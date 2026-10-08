import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
const client=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=id=>document.getElementById(id);
const statuses={queued:'En cola',analyzing:'Analizando la fotografía',generating:'Creando la escena',reviewing:'Revisando calidad',completed:'Lista para descargar',needs_review:'Requiere revisión',failed:'No se pudo completar'};
const labels={'golden-christmas':'Navidad dorada','reading-corner':'Rincón de cuentos de Navidad','santa-workshop':'Taller de Papá Noel','christmas-armchair':'Sillón de Navidad','white-door':'La puerta de Navidad','winter-window':'Ventana de invierno','cozy-cabinet':'El rincón de los ositos'};
let working=false,aiReady=false,activeId=null,poller=null,lastJobs=[],currentJob=null,elapsedTimer=null,pollBusy=false;
const sceneImages={
 'golden-christmas':'./assets/scenes/golden-bokeh.jpg',
 'reading-corner':'./assets/scenes/reading-corner.jpg',
 'santa-workshop':'./assets/scenes/santa-workshop.jpg',
 'christmas-armchair':'./assets/scenes/christmas-chair.jpg',
 'white-door':'./assets/scenes/white-trunk.jpg',
 'winter-window':'./assets/scenes/winter-window.jpg',
 'cozy-cabinet':'./assets/scenes/cabinet-teddies.jpg'
};

const phasePercent={queued:10,analyzing:25,generating:70,reviewing:90,needs_review:95,completed:100};
const errorDescriptions={
 openai_invalid_key:'La clave de OpenAI no es válida o no está autorizada.',
 openai_billing:'OpenAI ha rechazado el análisis por falta de créditos o por un límite de gasto/uso de la API. Comprueba el saldo y los límites en la plataforma de OpenAI antes de volver a generar.',
 openai_model_access:'El modelo de imágenes no está habilitado para esta cuenta de OpenAI.',
 openai_verification:'OpenAI solicita verificar la organización para utilizar imágenes.',
 openai_access:'La cuenta de OpenAI no tiene permiso para realizar esta solicitud.',
 openai_rate_limit:'OpenAI ha alcanzado temporalmente un límite de uso.',
 openai_unavailable:'El proveedor de IA no estaba disponible durante la solicitud.',
 openai_request:'OpenAI ha rechazado la solicitud.',
 analysis_incomplete:'No se pudo completar el análisis inicial de la fotografía.',
 subjects_not_supported:'El análisis de la fotografía no pudo validar los sujetos visibles.',
 source_invalid:'El archivo original no superó la validación del servidor.',
 scene_unavailable:'No se pudo cargar el escenario navideño elegido.',
 storage_error:'El resultado no se pudo guardar de manera privada.',
 timeout:'La generación agotó el tiempo de espera.',
 stale_timeout:'La solicitud no finalizó a tiempo.',
 unexpected_error:'El servidor no pudo completar el proceso.'
};
function controlAi(available){
 aiReady=!!available;window.picgiftAiReady=aiReady;
 $('generate').textContent=working?'Generando…':'Generar mi foto navideña';
 $('generate').disabled=working||!aiReady;
 $('api-diagnose').disabled=!aiReady;
 window.picgiftStudioUpdate?.();
}
const escape=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const status=s=>{$('generator-status').textContent=s};
async function invoke(body){
 const {data,error}=await client.functions.invoke('picgift-generate',{body});
 if(error){let message='Servicio de IA no disponible.';try{const j=await error.context.json();message=j.error||message}catch{}throw Error(message)}
 return data;
}
async function health(){
 try{const {data:{session}}=await client.auth.getSession();if(!session){controlAi(false);status('Inicia sesión para generar tu fotografía navideña. Puedes elegir el fondo y la foto antes de entrar.');return;}
 const data=await invoke({action:'health'});
 controlAi(data.available===true);
 status(data.available
  ?(data.pilot?'Prueba privada habilitada. Puedes generar una fotografía sin pago; cada prueba utiliza la API de OpenAI y puede generar costes de uso.':'Motor de IA disponible. Autoriza el procesamiento y pulsa Generar mi fotografía.')
  :'La IA está en preparación y solo se permite generar a cuentas autorizadas para la prueba privada. No se enviará ninguna fotografía.');
 if(!data.email_available){$('photo-email-delivery').disabled=true;$('photo-email-delivery').checked=false;$('photo-email-delivery').parentElement.title='El correo de entrega se activará cuando se configure el proveedor de email.'}
 else {$('photo-email-delivery').disabled=false;$('photo-email-delivery').parentElement.title='Te enviamos un enlace privado válido durante 24 horas'}
 }catch(e){controlAi(false);status('No hemos podido confirmar la conexión con la IA. Revisa tu sesión e inténtalo más tarde. '+e.message)}
}
async function diagnoseApi(){
 const button=$('api-diagnose'),out=$('api-diagnose-result');
 button.disabled=true;button.textContent='Comprobando conexión…';
 out.classList.remove('hidden');out.textContent='Verificando clave y acceso a los modelos, sin crear ninguna imagen…';
 try{
   const data=await invoke({action:'diagnose'});
   const problems=(data.checks||[]).filter(c=>!c.ok);
   const labels={analysis:'análisis fotográfico',image:'generación de imágenes'};
   const errors={openai_invalid_key:'clave no válida',openai_access:'acceso denegado',openai_model_access:'modelo no disponible',openai_verification:'verificación pendiente',openai_rate_limit:'límite temporal de peticiones',openai_billing:'saldo o facturación pendientes',connection_error:'sin conexión con OpenAI'};
   if(data.ready)out.textContent='Conexión comprobada: la clave responde y los modelos de análisis e imagen están accesibles. Esto NO verifica el saldo de la API. Ya puedes intentar una única generación de prueba.';
   else out.textContent='No se ha podido validar: '+problems.map(c=>(labels[c.name]||'servicio')+' ('+(errors[c.error]||'error del proveedor')+')').join('; ')+'. No generes todavía otra fotografía.';
 }catch(e){out.textContent='No fue posible comprobar la conexión: '+e.message}
 finally{button.disabled=!aiReady;button.textContent='Comprobar conexión con OpenAI'}
}
async function preparedFile(file){
 if(file.size<=3.5*1024*1024)return file;
 try{
  const bitmap=await createImageBitmap(file);const max=2560,scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
  canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  const blob=await new Promise(ok=>canvas.toBlob(ok,'image/jpeg',.92));
  if(blob)return new File([blob],file.name.replace(/\.[^.]+$/,'')+'.jpg',{type:'image/jpeg'});
 }catch(e){console.warn('PICGIFT resize fallback')}
 return file;
}
function finishButton(){working=false;controlAi(aiReady)}
async function create(ev){
 if(working)return;
 if(!aiReady){status('La IA todavía no está disponible para esta cuenta. Comprueba tu inicio de sesión o la conexión con OpenAI.');return;}const {file,scene_id,format,pose,outfit,consent,email_requested}=ev.detail||{};
 if(!file||consent!==true){status('Selecciona una foto y autoriza su tratamiento antes de generar.');return}
 if(!Object.prototype.hasOwnProperty.call(labels,scene_id)){status('Este escenario es solo una referencia provisional y todavía no admite generación IA. Elige uno de los fondos PICGIFT.');return}
 working=true;$('generate').disabled=true;$('generate').textContent='Preparando solicitud…';
 let path=null;
 try{
  const {data:{user}}=await client.auth.getUser();if(!user)throw Error('Inicia sesión de nuevo para continuar.');
  const ready=await invoke({action:'health'});
  if(!ready.available)throw Error('El motor de IA aún no tiene configurada una clave privada. No se ha subido ni procesado ninguna foto.');
  if(email_requested&&!ready.email_available)throw Error('La entrega por correo todavía no está activada. Desmarca esa opción para recibirla en tu cuenta.');
  const prepared=await preparedFile(file);
  if(prepared.size>15*1024*1024)throw Error('El archivo es demasiado grande. Máximo 15 MB.');
  const ext=prepared.type==='image/png'?'png':prepared.type==='image/webp'?'webp':'jpg';
  path=user.id+'/'+crypto.randomUUID()+'/source.'+ext;
  status('Subiendo tu fotografía a un espacio privado…');
  const uploaded=await client.storage.from('picgift-uploads').upload(path,prepared,{contentType:prepared.type,cacheControl:'0',upsert:false});
  if(uploaded.error)throw Error('No se pudo subir el archivo de forma privada. '+uploaded.error.message);
  status('La foto está protegida. Enviando solicitud al motor de IA…');
  const accepted=await invoke({action:'start',scene_id,source_path:path,format,pose:String(pose).slice(0,90),outfit:String(outfit).slice(0,90),consent:true,email_requested:email_requested===true});
  if(!accepted?.id)throw Error('No se pudo iniciar la generación.');
  activeId=accepted.id;path=null;
  $('result-empty').classList.add('hidden');$('real-result').classList.remove('hidden');
  $('result-page-title').textContent='Tu fotografía navideña';
  $('result-page-description').textContent='El trabajo se está procesando. Podrás descargar tu foto cuando termine y supere el control de calidad.';
  status('Solicitud aceptada. Analizando la fotografía…');
  window.dispatchEvent(new CustomEvent('picgift:route',{detail:{name:'resultado'}}));
  $('download-result').classList.add('hidden');
  renderProgress({id:accepted.id,scene_id,status:'queued',created_at:new Date().toISOString()});
  await refreshGallery();
  startPolling();
 }catch(e){status(e.message||'No se pudo iniciar la generación.');if(path)await client.storage.from('picgift-uploads').remove([path]).catch(()=>{});}
 finally{finishButton()}
}
function elapsedText(job){
 const ms=Date.now()-new Date(job.created_at).getTime();
 const n=Math.max(0,Number.isFinite(ms)?Math.floor(ms/1000):0);
 return n<60?n+' s':Math.floor(n/60)+' min '+String(n%60).padStart(2,'0')+' s';
}
function renderProgress(job){
 if(!job)return;
 currentJob=job;
 const state=job.status;
 const phaseNames={queued:'En cola',analyzing:'Analizando la fotografía',generating:'Generando la escena navideña',reviewing:'Revisando el resultado',completed:'Fotografía terminada',needs_review:'La imagen necesita revisión',failed:'La generación ha fallado'};
 const progress=phasePercent[state];
 const failed=state==='failed';
 const pct=$('progress-percent'),track=$('progress-track'),fill=$('progress-fill');
 pct.textContent=failed?'Error':(progress??10)+'%';
 fill.style.width=failed?'100%':(progress??10)+'%';
 track.dataset.state=state;
 if(failed)track.removeAttribute('aria-valuenow');
 else track.setAttribute('aria-valuenow',String(progress??10));
 track.setAttribute('aria-valuetext',phaseNames[state]||state);
 $('progress-phase').textContent=failed&&job.failure_code==='openai_billing'?'Sin saldo o límite de API':phaseNames[state]||'Preparando tu fotografía';
 const terminal=['failed','completed','needs_review'].includes(state);
 const billingProblem=failed&&job.failure_code==='openai_billing';
 const title=billingProblem?'Revisa el saldo de la API de OpenAI':failed?'No se pudo completar tu fotografía':state==='completed'?'¡Tu fotografía está lista!':state==='needs_review'?'El resultado necesita revisión':'Estamos creando tu Navidad';
 $('progress-headline').textContent=title;
 $('progress-kicker').textContent=failed?'Generación interrumpida':state==='completed'?'Resultado privado terminado':state==='needs_review'?'Control de calidad':'Fotografía navideña · Proceso protegido';
 $('progress-description').textContent=billingProblem?'El servidor ha recibido de OpenAI un rechazo por facturación o cuota antes de generar la imagen. No repitas la prueba hasta revisar los créditos y límites de tu cuenta API.':failed?'La generación ha terminado con un error. No necesitas seguir esperando. Puedes preparar otra fotografía cuando se resuelva la incidencia.':state==='completed'?'Tu fotografía ha superado la revisión automática y puedes descargarla de forma privada.':state==='needs_review'?'El sistema no ha aprobado automáticamente esta imagen. No está disponible para descargar hasta revisarla.':'Puedes salir de esta pantalla y volver a Mis fotos. Comprobaremos el progreso automáticamente.';
 $('result-page-description').textContent=failed?'El procesamiento falló y no se ha generado una fotografía descargable.':state==='completed'?'Tu fotografía se ha completado y está lista para descargar.':state==='needs_review'?'El resultado no ha superado la revisión automática.':'Estamos procesando tu fotografía. Puedes ver las etapas y el tiempo transcurrido.';
 $('progress-note').textContent=terminal?failed?'La generación no llegó a completarse.':state==='completed'?'Todas las etapas completadas.':'La revisión automática no ha aprobado la imagen.':'El porcentaje indica la etapa alcanzada, no un avance exacto de OpenAI.';
 $('progress-elapsed').textContent='Tiempo transcurrido: '+elapsedText(job);
 $('progress-warning').classList.toggle('hidden',terminal||Date.now()-new Date(job.created_at).getTime()<150000);
 if(!terminal)$('progress-warning').textContent='Está tardando más de lo habitual. Seguimos comprobando el servidor automáticamente. Puedes volver a Mis fotos sin perder el trabajo.';
 const step=({queued:0,analyzing:1,generating:2,reviewing:3,needs_review:3,completed:4,failed:0})[state]??0;
 document.querySelectorAll('.ai-progress-stages span').forEach((el,i)=>{el.classList.toggle('is-active',!terminal&&i===step);el.classList.toggle('is-done',state==='completed'||!failed&&i<step)});
 $('retry-job').classList.toggle('hidden',!failed||billingProblem);
 $('openai-billing-help').classList.toggle('hidden',!billingProblem);
 $('refresh-job').disabled=false;
 $('refresh-job').textContent=terminal?'Volver a comprobar':'Comprobar estado';
 const reason=failed?(errorDescriptions[job.failure_code]||'No se pudo completar esta fotografía. Revisa el estado de tu cuenta de OpenAI si el problema se repite.'):'';
 $('result-status').textContent=failed?reason:state==='completed'?'Completada. Puedes descargar el resultado desde esta página o Mis fotos.':state==='needs_review'?'La imagen no se ofrece para descarga porque necesita revisión de calidad.':phaseNames[state]||state;
 $('result-watermark').classList.remove('hidden');
 $('result-watermark').textContent=failed?'NO GENERADA':state==='needs_review'?'EN REVISIÓN':state==='completed'?'LISTA':(phaseNames[state]||'GENERANDO').toUpperCase();
 $('result-sample').alt=state==='completed'?'Tu resultado fotográfico privado PICGIFT':'Solo referencia del decorado, todavía no es la fotografía generada';
 if(state!=='completed'&&sceneImages[job.scene_id])$('result-sample').src=sceneImages[job.scene_id];
 if(terminal)stopPolling();
}
function tickElapsed(){if(currentJob&&!['completed','needs_review','failed'].includes(currentJob.status))$('progress-elapsed').textContent='Tiempo transcurrido: '+elapsedText(currentJob)}
async function signed(path,download=false){
 if(!path)return null;const {data,error}=await client.storage.from('picgift-generated').createSignedUrl(path,3600,download?{download:'picgift-navidad-2026.jpg'}:{});
 return error?null:data?.signedUrl;
}
function plainCard(job,href,download){
 const name=labels[job.scene_id]||'Navidad PICGIFT';const date=new Date(job.created_at).toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'numeric'});
 return '<article class="panel" style="display:flex;flex-direction:column;gap:10px;min-width:0">'
 + (href?'<img src="'+escape(href)+'" loading="lazy" alt="Tu fotografía PICGIFT" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:13px">':'<div class="detail-pic" style="height:140px;display:grid;place-items:center;color:#d9c18d">✧ '+escape(statuses[job.status]||job.status)+'</div>')
 +'<span class="eyebrow">'+escape(date)+'</span><h3>'+escape(name)+'</h3><p class="muted" style="font-size:12px">'+escape(statuses[job.status]||job.status)+'</p>'
 +(job.status==='failed'?'<p class="muted" style="font-size:12px">'+escape(errorDescriptions[job.failure_code]||'La generación terminó con un error y no produjo una fotografía.')+'</p>':phasePercent[job.status]&&job.status!=='completed'?'<p class="muted" style="font-size:12px">Etapa orientativa: '+phasePercent[job.status]+'%</p>':'')
 +'<button class="btn outline" type="button" data-view-job="'+escape(job.id)+'">Ver estado y detalles</button>'
 +(href?'<a class="btn primary" target="_blank" rel="noopener noreferrer" href="'+escape(download||href)+'">Descargar mi foto</a>':'')
 +'<button class="btn quiet" type="button" data-delete-job="'+escape(job.id)+'">Eliminar fotografía y datos</button></article>';
}
async function refreshGallery(){
 try{
  if(currentJob&&['queued','analyzing','generating','reviewing'].includes(currentJob.status)){
   const time=new Date(currentJob.updated_at||currentJob.created_at).getTime();
   if(Date.now()-time>8*60*1000)await invoke({action:'status'});
  }
  const {data,error}=await client.from('picgift_photo_jobs').select('id,scene_id,result_path,status,created_at,updated_at,email_status,failure_message,failure_code,failure_stage,result_quality').order('created_at',{ascending:false}).limit(30);
 if(error)throw error;lastJobs=data||[];
 const withLinks=await Promise.all(lastJobs.map(async j=>({job:j,href:j.status==='completed'?await signed(j.result_path):null,download:j.status==='completed'?await signed(j.result_path,true):null})));
 $('photo-library').innerHTML=withLinks.length?'<div class="scene-grid">'+withLinks.map(o=>plainCard(o.job,o.href,o.download)).join('')+'</div>':'<div class="panel empty"><div class="large">✧</div><h3>Todavía no hay fotografías</h3><p>Cuando generes tu primera imagen, aparecerá aquí de forma privada.</p><button class="btn outline" data-route="crear">Crear una foto</button></div>';
 const job=lastJobs.find(j=>j.id===activeId)||lastJobs[0];
 if(job){
  $('result-empty').classList.add('hidden');
  $('real-result').classList.remove('hidden');
  renderProgress(job);
  if(job.status==='completed'){
    const result=withLinks.find(x=>x.job.id===job.id);
    if(result?.href){
      $('result-sample').src=result.href;
      $('result-watermark').classList.add('hidden');
      $('download-result').href=result.download||result.href;
      $('download-result').classList.remove('hidden');
    }else{
      $('result-status').textContent='La fotografía está guardada, pero no ha sido posible generar el enlace privado. Pulsa «Comprobar estado».';
      $('download-result').classList.add('hidden');
    }
  }else{
    $('download-result').classList.add('hidden');
  }
 }
 return lastJobs;
 }catch(e){
  console.warn('PICGIFT private gallery unavailable');
  if(currentJob&&['queued','analyzing','generating','reviewing'].includes(currentJob.status)){
    $('progress-warning').textContent='No hemos podido conectar con el servidor. No significa que la imagen haya fallado. Comprobaremos otra vez cuando vuelva la conexión.';
    $('progress-warning').classList.remove('hidden');
  }
  return null;
 }
}
function stopPolling(){if(poller){clearInterval(poller);poller=null}if(elapsedTimer){clearInterval(elapsedTimer);elapsedTimer=null}}
function startPolling(){
 stopPolling();
 elapsedTimer=setInterval(tickElapsed,1000);
 poller=setInterval(async()=>{
  if(pollBusy||document.hidden)return;
  pollBusy=true;
  try{
   const jobs=await refreshGallery();
   if(!jobs)return;
   const j=jobs.find(x=>x.id===activeId);
   if(!j){stopPolling();return}
   status(statuses[j.status]||j.status);
   if(['completed','needs_review','failed'].includes(j.status))stopPolling();
  }finally{pollBusy=false}
 },6000);
}
async function removePhoto(id){
 if(!confirm('¿Eliminar de forma definitiva esta fotografía, el original subido y su resultado?'))return;
 try{await invoke({action:'delete',job_id:id});if(id===activeId){activeId=null;currentJob=null;stopPolling();$('real-result').classList.add('hidden');$('result-empty').classList.remove('hidden')}await refreshGallery();status('Fotografía eliminada de tu espacio privado.')}catch(e){status('No se pudo eliminar: '+e.message)}
}
function init(){
 window.addEventListener('picgift:generate',create);
 $('api-diagnose').addEventListener('click',diagnoseApi);
 $('refresh-job').addEventListener('click',async()=>{
  const btn=$('refresh-job');btn.disabled=true;btn.textContent='Comprobando…';
  try{
    await invoke({action:'status'});
    await refreshGallery();
  }catch{
    $('progress-warning').textContent='No se ha podido contactar con el servidor. Vuelve a intentarlo en unos segundos.';
    $('progress-warning').classList.remove('hidden');
  }finally{btn.disabled=false;btn.textContent='Comprobar estado'}
 });
 window.addEventListener('picgift:auth',async e=>{if(e.detail.user){await health();const jobs=await refreshGallery();if(!activeId){const inProgress=jobs.find(j=>['queued','analyzing','generating','reviewing'].includes(j.status));if(inProgress){activeId=inProgress.id;startPolling()}}}else{stopPolling();activeId=null;currentJob=null;lastJobs=[];controlAi(false);status('Inicia sesión para acceder a la generación privada.');}});
 $('photo-library').addEventListener('click',async e=>{
  const id=e.target.closest('[data-delete-job]')?.dataset.deleteJob;
  if(id){await removePhoto(id);return}
  const open=e.target.closest('[data-view-job]')?.dataset.viewJob;
  if(!open)return;
  activeId=open;
  const job=lastJobs.find(j=>j.id===open);
  if(!job)return;
  $('result-name').textContent=labels[job.scene_id]||'Navidad PICGIFT';
  window.dispatchEvent(new CustomEvent('picgift:route',{detail:{name:'resultado'}}));
  await refreshGallery();
  if(['queued','analyzing','generating','reviewing'].includes(job.status))startPolling();
 });
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&activeId)refreshGallery()});
 client.auth.getUser().then(async ({data})=>{if(data?.user){await health();const jobs=await refreshGallery();const pending=jobs.find(j=>['queued','analyzing','generating','reviewing'].includes(j.status));if(pending){activeId=pending.id;startPolling()}}}).catch(()=>{});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
