import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
const client=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=id=>document.getElementById(id);
const statuses={queued:'En cola',analyzing:'Analizando la fotografía',generating:'Creando la escena',reviewing:'Revisando calidad',completed:'Lista para descargar',needs_review:'Requiere revisión',failed:'No se pudo completar'};
const labels={'golden-christmas':'Navidad dorada','reading-corner':'Rincón de cuentos de Navidad','santa-workshop':'Taller de Papá Noel','christmas-armchair':'Sillón de Navidad','white-door':'La puerta de Navidad','winter-window':'Ventana de invierno','cozy-cabinet':'El rincón de los ositos'};
let working=false,aiReady=false,activeId=null,poller=null,lastJobs=[];
function controlAi(available){aiReady=!!available;$('generate').disabled=!aiReady||working;$('generate').textContent=aiReady?'Generar con IA':'Generar con IA (pendiente)';}
const escape=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const status=s=>{$('generator-status').textContent=s};
async function invoke(body){
 const {data,error}=await client.functions.invoke('picgift-generate',{body});
 if(error){let message='Servicio de IA no disponible.';try{const j=await error.context.json();message=j.error||message}catch{}throw Error(message)}
 return data;
}
async function health(){
 try{const {data:{session}}=await client.auth.getSession();if(!session){controlAi(false);status('Inicia sesión para acceder al generador de IA. La demostración funciona sin registrar tu foto.');return;}
 const data=await invoke({action:'health'});
 controlAi(data.available===true);
 status(data.available
  ?(data.pilot?'Prueba privada habilitada. Puedes generar una fotografía sin pago; cada prueba utiliza la API de OpenAI y puede generar costes de uso.':'Motor de IA disponible. Autoriza el procesamiento y pulsa Generar mi fotografía.')
  :'La IA está en preparación y solo se permite generar a cuentas autorizadas para la prueba privada. No se enviará ninguna fotografía.');
 if(!data.email_available){$('photo-email-delivery').disabled=true;$('photo-email-delivery').checked=false;$('photo-email-delivery').parentElement.title='El correo de entrega se activará cuando se configure el proveedor de email.'}
 else {$('photo-email-delivery').disabled=false;$('photo-email-delivery').parentElement.title='Te enviamos un enlace privado válido durante 24 horas'}
 }catch(e){controlAi(false);status('No se ha podido comprobar el motor de IA. Puedes utilizar la demostración sin enviar fotos. '+e.message)}
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
 if(!aiReady){status('La IA está pendiente de activación. Mientras tanto puedes abrir la demostración local.');return;}const {file,scene_id,format,pose,outfit,consent,email_requested}=ev.detail||{};
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
  $('demo-result').classList.add('hidden');$('result-empty').classList.add('hidden');$('real-result').classList.remove('hidden');
  $('result-page-title').textContent='Tu fotografía navideña';
  $('result-page-description').textContent='El trabajo se está procesando. Podrás descargar tu foto cuando termine y supere el control de calidad.';
  status('Solicitud aceptada. Analizando la fotografía…');
  window.dispatchEvent(new CustomEvent('picgift:route',{detail:{name:'resultado'}}));
  $('result-watermark').textContent='GENERANDO';
  $('result-status').textContent='Analizando la fotografía. La generación puede tardar varios minutos.';
  $('download-result').classList.add('hidden');
  await refreshGallery();
  startPolling();
 }catch(e){status(e.message||'No se pudo iniciar la generación.');if(path)await client.storage.from('picgift-uploads').remove([path]).catch(()=>{});}
 finally{finishButton()}
}
async function signed(path,download=false){
 if(!path)return null;const {data,error}=await client.storage.from('picgift-generated').createSignedUrl(path,3600,download?{download:'picgift-navidad-2026.jpg'}:{});
 return error?null:data?.signedUrl;
}
function plainCard(job,href,download){
 const name=labels[job.scene_id]||'Navidad PICGIFT';const date=new Date(job.created_at).toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'numeric'});
 return '<article class="panel" style="display:flex;flex-direction:column;gap:10px;min-width:0">'
 + (href?'<img src="'+escape(href)+'" loading="lazy" alt="Tu fotografía PICGIFT" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:13px">':'<div class="detail-pic" style="height:140px;display:grid;place-items:center;color:#d9c18d">✧ '+escape(statuses[job.status]||job.status)+'</div>')
 +'<span class="eyebrow">'+escape(date)+'</span><h3>'+escape(name)+'</h3><p class="muted" style="font-size:12px">'+escape(statuses[job.status]||job.status)+'</p>'
 +(href?'<a class="btn primary" target="_blank" rel="noopener noreferrer" href="'+escape(download||href)+'">Descargar mi foto</a>':'')
 +'<button class="btn quiet" type="button" data-delete-job="'+escape(job.id)+'">Eliminar fotografía y datos</button></article>';
}
async function refreshGallery(){
 try{const {data,error}=await client.from('picgift_photo_jobs').select('id,scene_id,result_path,status,created_at,email_status,failure_message,result_quality').order('created_at',{ascending:false}).limit(30);
 if(error)throw error;lastJobs=data||[];
 const withLinks=await Promise.all(lastJobs.map(async j=>({job:j,href:j.status==='completed'?await signed(j.result_path):null,download:j.status==='completed'?await signed(j.result_path,true):null})));
 $('photo-library').innerHTML=withLinks.length?'<div class="scene-grid">'+withLinks.map(o=>plainCard(o.job,o.href,o.download)).join('')+'</div>':'<div class="panel empty"><div class="large">✧</div><h3>Todavía no hay fotografías</h3><p>Cuando generes tu primera imagen, aparecerá aquí de forma privada.</p><button class="btn outline" data-route="crear">Crear una foto</button></div>';
 const job=lastJobs.find(j=>j.id===activeId)||lastJobs[0];
 if(job){if($('demo-result').classList.contains('hidden')){$('result-empty').classList.add('hidden');$('real-result').classList.remove('hidden')}
 const state=statuses[job.status]||job.status;$('result-status').textContent=state+(job.email_status==='sent'?'. También hemos enviado un enlace privado por correo.':'')+(job.email_status==='skipped'?'. La entrega por correo no está configurada.':'');
  if(job.status==='completed'){const result=withLinks.find(x=>x.job.id===job.id);
   if(result?.href){$('result-sample').src=result.href;$('result-watermark').classList.add('hidden');$('download-result').href=result.download||result.href;$('download-result').classList.remove('hidden')}
  }else{$('download-result').classList.add('hidden');$('result-watermark').classList.remove('hidden');$('result-watermark').textContent=job.status==='needs_review'?'EN REVISIÓN':state.toUpperCase();}
  if(['completed','needs_review','failed'].includes(job.status))stopPolling();
 }
 return lastJobs;
 }catch(e){console.warn('PICGIFT private gallery unavailable');return []}
}
function stopPolling(){if(poller){clearInterval(poller);poller=null}}
function startPolling(){stopPolling();poller=setInterval(async()=>{const jobs=await refreshGallery();if(!jobs.some(j=>j.id===activeId)){stopPolling();return}const j=jobs.find(x=>x.id===activeId);if(j){status(statuses[j.status]||j.status);if(['completed','needs_review','failed'].includes(j.status))stopPolling()}},6000)}
async function removePhoto(id){
 if(!confirm('¿Eliminar de forma definitiva esta fotografía, el original subido y su resultado?'))return;
 try{await invoke({action:'delete',job_id:id});if(id===activeId){activeId=null;stopPolling()}await refreshGallery();status('Fotografía eliminada de tu espacio privado.')}catch(e){status('No se pudo eliminar: '+e.message)}
}
function init(){
 window.addEventListener('picgift:generate',create);
 window.addEventListener('picgift:auth',async e=>{if(e.detail.user){await health();const jobs=await refreshGallery();if(!activeId){const inProgress=jobs.find(j=>['queued','analyzing','generating','reviewing'].includes(j.status));if(inProgress){activeId=inProgress.id;startPolling()}}}else{stopPolling();activeId=null;lastJobs=[];controlAi(false);status('Inicia sesión para acceder a la generación privada.');}});
 $('photo-library').addEventListener('click',e=>{const id=e.target.closest('[data-delete-job]')?.dataset.deleteJob;if(id)removePhoto(id)});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&activeId)refreshGallery()});
 client.auth.getUser().then(async ({data})=>{if(data?.user){await health();const jobs=await refreshGallery();const pending=jobs.find(j=>['queued','analyzing','generating','reviewing'].includes(j.status));if(pending){activeId=pending.id;startPolling()}}}).catch(()=>{});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
