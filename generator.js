import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
const client=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=id=>document.getElementById(id);
const statuses={queued:'En cola',analyzing:'Analizando la fotografía',generating:'Creando la escena',reviewing:'Revisando calidad',completed:'Lista para descargar',needs_review:'Requiere revisión',failed:'No se pudo completar'};
const labels={'halloween-potions':'La escuela de magia','halloween-autumn-arch':'El bosque encantado','halloween-pumpkin-bench':'El rincón de las calabazas','halloween-lantern-street':'La calle de los farolillos','golden-christmas':'Navidad dorada','reading-corner':'Rincón de cuentos de Navidad','santa-workshop':'Taller de Papá Noel','christmas-armchair':'Sillón de Navidad','white-door':'La puerta de Navidad','winter-window':'Ventana de invierno','cozy-cabinet':'El rincón de los ositos'};
let working=false,aiReady=false,activeId=null,poller=null,lastJobs=[],currentJob=null,elapsedTimer=null,pollBusy=false;
const sceneImages={
 'halloween-potions':'./assets/halloween/backdrops/potions.jpg',
 'halloween-autumn-arch':'./assets/halloween/backdrops/autumn-arch.jpg',
 'halloween-pumpkin-bench':'./assets/halloween/backdrops/pumpkin-bench.jpg',
 'halloween-lantern-street':'./assets/halloween/backdrops/lantern-street.jpg',
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
 openai_invalid_key:'El estudio no ha podido completar el retrato. Vuelve a intentarlo más tarde o contacta con soporte.',
 openai_billing:'El estudio no ha podido completar el retrato. Vuelve a intentarlo más tarde o contacta con soporte.',
 openai_model_access:'El estudio no ha podido completar el retrato. Vuelve a intentarlo más tarde o contacta con soporte.',
 openai_verification:'El estudio no ha podido completar el retrato. Vuelve a intentarlo más tarde o contacta con soporte.',
 openai_access:'El estudio no ha podido completar el retrato. Vuelve a intentarlo más tarde o contacta con soporte.',
 openai_rate_limit:'El estudio no ha podido completar el retrato. Vuelve a intentarlo más tarde o contacta con soporte.',
 openai_unavailable:'El estudio no ha podido completar el retrato. Vuelve a intentarlo más tarde o contacta con soporte.',
 openai_request:'El estudio no ha podido completar el retrato. Vuelve a intentarlo más tarde o contacta con soporte.',
 analysis_incomplete:'No se pudo completar el análisis inicial de la fotografía.',
 subjects_not_supported:'El análisis de la fotografía no pudo validar los sujetos visibles.',
 source_invalid:'El archivo original no superó la validación del servidor.',
 scene_unavailable:'No se pudo cargar el escenario elegido.',
 storage_error:'El resultado no se pudo guardar de manera privada.',
 timeout:'La generación agotó el tiempo de espera.',
 stale_timeout:'La solicitud no finalizó a tiempo.',
 unexpected_error:'El servidor no pudo completar el proceso.'
};
function controlAi(available){
 aiReady=!!available;window.picgiftGenerating=working;
 window.picgiftAiReady=aiReady;
 $('generate').textContent=working?'Preparando tu retrato…':aiReady?'Crear mi retrato':'Estudio no disponible';
 $('generate').disabled=working||!aiReady;
 if($('api-diagnose'))$('api-diagnose').disabled=!available;
 window.picgiftStudioUpdate?.();
}
const escape=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const status=s=>{$('generator-status').textContent=s};
async function invoke(body){
 const {data,error}=await client.functions.invoke('picgift-generate',{body});
 if(error){let message='El estudio no está disponible.';try{const j=await error.context.json();message=j.error||message}catch{}throw Error(message)}
 return data;
}
async function health(){
 try{const {data:{session}}=await client.auth.getSession();if(!session){controlAi(false);status('Inicia sesión para comprobar la disponibilidad del estudio. Puedes elegir tu foto y ajustar el encuadre antes.');return;}
 const data=await invoke({action:'health'});
 window.picgiftPilot=data.pilot===true;controlAi(data.available===true);window.picgiftReferencesReady=data.references_supported===true;
 if(!data.available&&data.campaign==='halloween'){
  status('Estamos preparando la apertura de esta colección. No se enviará ninguna fotografía.');
 }else{
  status(data.available
   ?(data.pilot?'Tu cuenta tiene acceso a la prueba del estudio, sin compras.':'El estudio está disponible para tu cuenta.')
   :'El estudio no está disponible para esta cuenta. No se enviará ninguna fotografía.');
 }
 if(!data.email_available){$('photo-email-delivery').disabled=true;$('photo-email-delivery').checked=false;$('photo-email-delivery').parentElement.title='El correo de entrega se activará cuando se configure el proveedor de email.'}
 else {$('photo-email-delivery').disabled=false;$('photo-email-delivery').parentElement.title='Te enviamos un enlace privado válido durante 24 horas'}
 }catch(e){controlAi(false);status('No hemos podido conectar con el estudio. Revisa tu sesión e inténtalo más tarde. '+e.message)}
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
 if(!aiReady){status('El estudio está en preparación. No se enviará ninguna fotografía.');return;}const {file,references={},scene_id,format,pose,outfit,consent,email_requested}=ev.detail||{};
 if(!file||consent!==true){status('Selecciona una foto y autoriza su tratamiento antes de generar.');return}
 if(!Object.prototype.hasOwnProperty.call(labels,scene_id)){status('Este escenario está en preparación.');return}
 working=true;$('generate').disabled=true;$('generate').textContent='Preparando solicitud…';
 let path=null,uploadedPaths=[],acceptedByServer=false,requestSubmitted=false;
 try{
  const {data:{user}}=await client.auth.getUser();if(!user)throw Error('Inicia sesión de nuevo para continuar.');
  const ready=await invoke({action:'health'});
  if(!ready.available)throw Error('El estudio no está disponible. No se ha subido ni procesado ninguna foto.');
  if(email_requested&&!ready.email_available)throw Error('La entrega por correo todavía no está activada. Desmarca esa opción para recibirla en tu cuenta.');
  const prepared=await preparedFile(file);
  if(prepared.size>15*1024*1024)throw Error('El archivo es demasiado grande. Máximo 15 MB.');
  const ext=prepared.type==='image/png'?'png':prepared.type==='image/webp'?'webp':'jpg';
  path=user.id+'/'+crypto.randomUUID()+'/source.'+ext;
  status('Subiendo tu fotografía a un espacio privado…');
  const uploaded=await client.storage.from('picgift-uploads').upload(path,prepared,{contentType:prepared.type,cacheControl:'0',upsert:false});
  if(uploaded.error)throw Error('No se pudo subir el archivo de forma privada. '+uploaded.error.message);
  uploadedPaths.push(path);
  const reference_paths={};
  for(const kind of ['face','body']){
    const reference=references[kind];if(!reference)continue;
    if(!['image/jpeg','image/png','image/webp'].includes(reference.type)||reference.size>15*1024*1024)throw Error('La referencia supera el tamaño o tipo permitido.');
    if(ready.references_supported!==true)throw Error('El estudio aún no admite referencias adicionales. No se enviarán hasta que puedan utilizarse.');
    const extra=await preparedFile(reference),extension=extra.type==='image/png'?'png':extra.type==='image/webp'?'webp':'jpg';
    const extraPath=path.slice(0,path.lastIndexOf('/'))+'/reference-'+kind+'.'+extension;
    const upload=await client.storage.from('picgift-uploads').upload(extraPath,extra,{contentType:extra.type,cacheControl:'0',upsert:false});
    if(upload.error)throw Error('No se pudo subir la referencia de '+(kind==='face'?'rostro':'cuerpo')+'.');
    uploadedPaths.push(extraPath);reference_paths[kind]=extraPath;
  }
  status('Las fotos están protegidas. Enviando solicitud al estudio…');
  requestSubmitted=true;
  const accepted=await invoke({action:'start',request_language:window.picgiftI18n.language,scene_id,source_path:path,reference_paths,format,pose:String(pose).slice(0,90),outfit:String(outfit).slice(0,90),consent:true,email_requested:email_requested===true});
  if(!accepted?.id)throw Error('No se pudo iniciar la generación.');
  activeId=accepted.id;path=null;acceptedByServer=true;
  $('result-empty').classList.add('hidden');$('real-result').classList.remove('hidden');
  $('result-page-title').textContent='Tu retrato de cuento';
  $('result-page-description').textContent='El trabajo se está procesando. Podrás descargar tu foto cuando termine y supere el control de calidad.';
  status('Solicitud aceptada. Analizando la fotografía…');
  window.dispatchEvent(new CustomEvent('picgift:route',{detail:{name:'resultado'}}));
  $('download-result').classList.add('hidden');
  renderProgress({id:accepted.id,scene_id,status:'queued',created_at:new Date().toISOString()});
  await refreshGallery();
  startPolling();
 }catch(e){status(requestSubmitted?'No se pudo confirmar la solicitud. Consulta Mis fotos antes de volver a intentarlo.':e.message||'No se pudo iniciar la generación.');if(requestSubmitted)await refreshGallery();if(!acceptedByServer&&!requestSubmitted&&uploadedPaths.length)await client.storage.from('picgift-uploads').remove(uploadedPaths).catch(()=>{});}
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
 const phaseNames={queued:'En cola',analyzing:'Analizando la fotografía',generating:'Creando el retrato',reviewing:'Revisando el resultado',completed:'Fotografía terminada',needs_review:'La imagen necesita revisión',failed:'La generación ha fallado'};
 const progress=phasePercent[state];
 const failed=state==='failed';
 const pct=$('progress-percent'),track=$('progress-track'),fill=$('progress-fill');
 pct.textContent=failed?'Error':(progress??10)+'%';
 fill.style.width=failed?'100%':(progress??10)+'%';
 track.dataset.state=state;
 if(failed)track.removeAttribute('aria-valuenow');
 else track.setAttribute('aria-valuenow',String(progress??10));
 track.setAttribute('aria-valuetext',phaseNames[state]||state);
 $('progress-phase').textContent=failed&&job.failure_code==='openai_billing'?'Estudio no disponible':phaseNames[state]||'Preparando tu fotografía';
 const terminal=['failed','completed','needs_review'].includes(state);
 const billingProblem=failed&&job.failure_code==='openai_billing';
 const title=billingProblem?'El estudio necesita atención':failed?'No se pudo completar tu fotografía':state==='completed'?'¡Tu fotografía está lista!':state==='needs_review'?'El resultado necesita revisión':'Estamos preparando su aventura';
 $('progress-headline').textContent=title;
 $('progress-kicker').textContent=failed?'Generación interrumpida':state==='completed'?'Resultado privado terminado':state==='needs_review'?'Control de calidad':'Tu retrato · Proceso protegido';
 $('progress-description').textContent=billingProblem?'No hemos podido completar el retrato. Contacta con soporte antes de volver a intentarlo.':failed?'La generación ha terminado con un error. No necesitas seguir esperando. Puedes preparar otra fotografía cuando se resuelva la incidencia.':state==='completed'?'Tu fotografía ha superado la revisión automática y puedes descargarla de forma privada.':state==='needs_review'?'El sistema no ha aprobado automáticamente esta imagen. No está disponible para descargar hasta revisarla.':'Puedes salir de esta pantalla y volver a Mis fotos. Comprobaremos el progreso automáticamente.';
 $('result-page-description').textContent=failed?'El procesamiento falló y no se ha generado una fotografía descargable.':state==='completed'?'Tu fotografía se ha completado y está lista para descargar.':state==='needs_review'?'El resultado no ha superado la revisión automática.':'Estamos procesando tu fotografía. Puedes ver las etapas y el tiempo transcurrido.';
 $('progress-note').textContent=terminal?failed?'La generación no llegó a completarse.':state==='completed'?'Todas las etapas completadas.':'La revisión automática no ha aprobado la imagen.':'El porcentaje es orientativo y muestra la etapa de preparación.';
 $('progress-elapsed').textContent='Tiempo transcurrido: '+elapsedText(job);
 $('progress-warning').classList.toggle('hidden',terminal||Date.now()-new Date(job.created_at).getTime()<150000);
 if(!terminal)$('progress-warning').textContent='Está tardando más de lo habitual. Seguimos comprobando el servidor automáticamente. Puedes volver a Mis fotos sin perder el trabajo.';
 const step=({queued:0,analyzing:1,generating:2,reviewing:3,needs_review:3,completed:4,failed:0})[state]??0;
 document.querySelectorAll('.ai-progress-stages span').forEach((el,i)=>{el.classList.toggle('is-active',!terminal&&i===step);el.classList.toggle('is-done',state==='completed'||!failed&&i<step)});
 $('retry-job').classList.toggle('hidden',!failed||billingProblem);

 $('refresh-job').disabled=false;
 $('refresh-job').textContent=terminal?'Volver a comprobar':'Comprobar estado';
 const reason=failed?(errorDescriptions[job.failure_code]||'No se pudo completar esta fotografía. Contacta con soporte si el problema se repite.'):'';
 $('result-status').textContent=failed?reason:state==='completed'?'Completada. Puedes descargar el resultado desde esta página o Mis fotos.':state==='needs_review'?'La imagen no se ofrece para descarga porque necesita revisión de calidad.':phaseNames[state]||state;
 $('result-watermark').classList.remove('hidden');
 $('result-watermark').textContent=failed?'NO GENERADA':state==='needs_review'?'EN REVISIÓN':state==='completed'?'LISTA':(phaseNames[state]||'GENERANDO').toUpperCase();
 $('result-sample').alt=state==='completed'?'Tu resultado fotográfico privado PICGIFT':'Solo referencia del decorado, todavía no es la fotografía generada';
 if(state!=='completed'&&sceneImages[job.scene_id])$('result-sample').src=sceneImages[job.scene_id];
 if(terminal)stopPolling();
}
function tickElapsed(){if(currentJob&&!['completed','needs_review','failed'].includes(currentJob.status))$('progress-elapsed').textContent='Tiempo transcurrido: '+elapsedText(currentJob)}
async function signed(path,download=false){
 if(!path)return null;const {data,error}=await client.storage.from('picgift-generated').createSignedUrl(path,3600,download?{download:'picgift-portrait.jpg'}:{});
 return error?null:data?.signedUrl;
}
function plainCard(job,href,download){
 const name=labels[job.scene_id]||'PICGIFT';const date=new Date(job.created_at).toLocaleDateString(window.picgiftI18n?.locale||'es-ES',{day:'2-digit',month:'short',year:'numeric'});
 return '<article class="panel" style="display:flex;flex-direction:column;gap:10px;min-width:0">'
 + (href?'<img src="'+escape(href)+'" loading="lazy" alt="Tu fotografía PICGIFT" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:13px">':'<div class="detail-pic" style="height:140px;display:grid;place-items:center;color:#d9c18d">✧ '+escape(statuses[job.status]||job.status)+'</div>')
 +'<span class="eyebrow">'+escape(date)+'</span><h3>'+escape(name)+'</h3><p class="muted" style="font-size:12px">'+escape(statuses[job.status]||job.status)+'</p>'
 +(job.status==='failed'?'<p class="muted" style="font-size:12px">'+escape(errorDescriptions[job.failure_code]||'La generación terminó con un error y no produjo una fotografía.')+'</p>':phasePercent[job.status]&&job.status!=='completed'?'<p class="muted" style="font-size:12px">Etapa orientativa: '+phasePercent[job.status]+'%</p>':'')
 +'<button class="btn outline" type="button" data-view-job="'+escape(job.id)+'">Ver estado y detalles</button>'
 +(href?'<a class="btn primary" rel="noopener noreferrer" href="'+escape(download||href)+'">Descargar mi foto</a>':'')
 +'<button class="btn quiet" type="button" data-report-job="'+escape(job.id)+'">Informar de un problema con el retrato</button>'
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
 if(!confirm(window.picgiftI18n.t('¿Eliminar de forma definitiva esta fotografía, el original subido y su resultado?')))return;
 try{await invoke({action:'delete',job_id:id});if(id===activeId){activeId=null;currentJob=null;stopPolling();$('real-result').classList.add('hidden');$('result-empty').classList.remove('hidden')}await refreshGallery();status('Fotografía eliminada de tu espacio privado.')}catch(e){status('No se pudo eliminar: '+e.message)}
}
function init(){
 const fluxButton=$('flux-verify');
 if(fluxButton)fluxButton.addEventListener('click',async()=>{
   fluxButton.disabled=true;
   $('flux-status').textContent=window.picgiftI18n?.t('Comprobando Cloudflare…')||'Comprobando Cloudflare…';
   try{
     const {data:{session}}=await client.auth.getSession();
     if(!session)throw new Error('Inicia sesión para verificar la conexión.');
     const {data,error}=await client.functions.invoke('picgift-flux-check',{body:{action:'health'}});
     if(error)throw new Error('No se ha podido consultar el servidor.');
     const messages={
       connected:'Cloudflare conectado. La generación gratuita todavía no está activada.',
       missing_secrets:'Faltan los secretos de Cloudflare en Supabase.',
       invalid_account_id:'El Account ID de Cloudflare no es válido.',
       cloudflare_permission_error:'El token no tiene acceso a Workers AI o la cuenta no coincide.',
       cloudflare_unavailable:'Cloudflare no responde correctamente.',
       model_not_listed:'Cloudflare responde, pero no confirma FLUX.2 Klein 4B.',
       cloudflare_error:'Cloudflare ha rechazado la comprobación.',
       connection_timeout:'Se agotó el tiempo al conectar con Cloudflare.'
     };
     const message=messages[data?.status]||'Todavía no se ha verificado la conexión gratuita.';
     $('flux-status').textContent=window.picgiftI18n?.t(message)||message;
     $('flux-status').dataset.verified=String(data?.verified===true);
   }catch(e){$('flux-status').textContent=window.picgiftI18n?.t(e.message)||e.message}
   finally{fluxButton.disabled=false;}
 });

 window.addEventListener('picgift:generate',create);

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
 window.addEventListener('picgift:auth',async e=>{if(e.detail.user){await health();const jobs=await refreshGallery();if(!activeId){const inProgress=jobs?.find(j=>['queued','analyzing','generating','reviewing'].includes(j.status));if(inProgress){activeId=inProgress.id;startPolling()}}}else{stopPolling();activeId=null;currentJob=null;lastJobs=[];$('photo-library').replaceChildren();$('result-sample').removeAttribute('src');$('download-result').removeAttribute('href');$('real-result').classList.add('hidden');$('result-empty').classList.remove('hidden');controlAi(false);status('Inicia sesión para acceder a la creación de retratos.');}});
 $('photo-library').addEventListener('click',async e=>{
  const id=e.target.closest('[data-delete-job]')?.dataset.deleteJob;
  if(id){await removePhoto(id);return}
  const open=e.target.closest('[data-view-job]')?.dataset.viewJob;
  if(!open)return;
  activeId=open;
  const job=lastJobs.find(j=>j.id===open);
  if(!job)return;
  $('result-name').textContent=labels[job.scene_id]||'PICGIFT';
  window.dispatchEvent(new CustomEvent('picgift:route',{detail:{name:'resultado'}}));
  await refreshGallery();
  if(['queued','analyzing','generating','reviewing'].includes(job.status))startPolling();
 });
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&activeId)refreshGallery()});
 client.auth.getUser().then(async ({data})=>{if(data?.user){await health();const jobs=await refreshGallery();const pending=jobs?.find(j=>['queued','analyzing','generating','reviewing'].includes(j.status));if(pending){activeId=pending.id;startPolling()}}}).catch(()=>{});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();

async function reportPortrait(id){
 const {data:{user}}=await client.auth.getUser();if(!user)return;
 const btn=document.querySelector('[data-report-job="'+id+'"]');if(!btn)return;btn.disabled=true;
 const {error}=await client.from('picgift_content_reports').insert({user_id:user.id,job_id:id,reason:'other'});
 btn.textContent=!error||error.code==='23505'?'Informe recibido. Revisaremos este retrato.':'No se pudo enviar el informe. Inténtalo de nuevo.';
 btn.disabled=!error||error.code==='23505';
}
document.addEventListener('click',event=>{const btn=event.target.closest('[data-report-job]');if(btn)reportPortrait(btn.dataset.reportJob)});
window.addEventListener('picgift:language',()=>{if(lastJobs.length)refreshGallery()});
