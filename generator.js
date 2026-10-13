import { createClient } from './vendor/supabase.js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
const client=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=id=>document.getElementById(id);
const statuses={queued:'En cola',analyzing:'Analizando la fotografía',generating:'Creando la escena',reviewing:'Revisando calidad',completed:'Lista para descargar',needs_review:'Requiere revisión',failed:'No se pudo completar'};
const labels={'halloween-potions':'La escuela de magia','halloween-autumn-arch':'El bosque encantado','halloween-pumpkin-bench':'El rincón de las calabazas','halloween-lantern-street':'La calle de los farolillos','halloween-pumpkin-forest':'Bosque de calabazas','halloween-haunted-castle':'Castillo embrujado','halloween-portrait-hall':'Salón de retratos','halloween-enchanted-city':'Ciudad encantada','golden-christmas':'Navidad dorada','reading-corner':'Rincón de cuentos de Navidad','santa-workshop':'Taller de Papá Noel','christmas-armchair':'Sillón de Navidad','white-door':'La puerta de Navidad','winter-window':'Ventana de invierno','cozy-cabinet':'El rincón de los ositos'};
let fluxMode=false,freeReady=false,premiumReady=false,working=false,aiReady=false,activeId=null,poller=null,lastJobs=[],currentJob=null,elapsedTimer=null,pollBusy=false;
let galleryRevision=0,galleryAuthenticated=false,authRevision=0,healthRevision=0,serviceChoice=null;
const sceneImages={
 'halloween-potions':'./assets/halloween/backdrops/potions.jpg',
 'halloween-autumn-arch':'./assets/halloween/backdrops/autumn-arch.jpg',
 'halloween-pumpkin-bench':'./assets/halloween/backdrops/pumpkin-bench.jpg',
 'halloween-lantern-street':'./assets/halloween/backdrops/lantern-street.jpg',
 'halloween-pumpkin-forest':'./assets/halloween/reference/pumpkin-forest.webp',
 'halloween-haunted-castle':'./assets/halloween/reference/haunted-castle.webp',
 'halloween-portrait-hall':'./assets/halloween/reference/portrait-hall.webp',
 'halloween-enchanted-city':'./assets/halloween/reference/enchanted-city.webp',
 'golden-christmas':'./assets/scenes/golden-bokeh.jpg',
 'reading-corner':'./assets/scenes/reading-corner.jpg',
 'santa-workshop':'./assets/scenes/santa-workshop.jpg',
 'christmas-armchair':'./assets/scenes/christmas-chair.jpg',
 'white-door':'./assets/scenes/white-trunk.jpg',
 'winter-window':'./assets/scenes/winter-window.jpg',
 'cozy-cabinet':'./assets/scenes/cabinet-teddies.jpg'
};

// These are observed steps, never a percentage or a prediction of time remaining.
const progressSteps=['Subida','Comprobación','Cola','Creación','Revisión','Lista'];
const progressStates={
 queued:{step:2,title:'Tu foto está en cola',description:'La comprobación inicial ha terminado y tu solicitud está registrada. Esperamos a que empiece la creación.'},
 analyzing:{step:3,title:'Preparando tu retrato',description:'Estamos leyendo la fotografía y las referencias para preparar la composición del retrato.'},
 generating:{step:3,title:'Creando tu fotografía',description:'Tu foto ya es la protagonista. Estamos creando el retrato con el escenario elegido; podrás descargarlo cuando termine.'},
 reviewing:{step:4,title:'Comprobando y guardando el resultado',description:'La imagen ya se ha creado. Estamos terminando las comprobaciones del servicio elegido y guardándola en tu galería privada.'},
 completed:{step:5,title:'Tu fotografía está lista',description:'Abre la imagen, revisa el resultado y descárgala en tu dispositivo. También la encontrarás en Mis fotos.'},
 needs_review:{step:4,title:'El resultado necesita atención',description:'La revisión automática no ha aprobado esta imagen. No está disponible para descargar. Consulta el estado o contacta con soporte antes de crear otra.'}
};
let requestTimer=null,requestStartedAt=null,requestPhase=null,galleryConnectionLost=false,lastGalleryCheck=null;
const translated=text=>window.picgiftI18n?.t?.(text)||text;
function progressDetails(job){
 if(job.status==='failed')return {step:progressStates[job.failure_stage]?.step??null,title:'No se pudo completar tu fotografía',description:errorDescriptions[job.failure_code]||'El proceso se ha detenido y no hay una fotografía disponible para descargar.',terminal:true};
 const detail=progressStates[job.status];
 return detail?{...detail,terminal:['completed','needs_review'].includes(job.status)}:{step:null,title:'Comprobando el estado de tu fotografía',description:'Todavía no tenemos un estado confirmado. Consulta Mis fotos antes de iniciar otra solicitud.',terminal:false};
}
function requestProgress(phase,message){
 const box=$('request-progress');if(!box)return;
 requestPhase=phase;box.classList.remove('hidden');box.dataset.state=phase;
 const copy={
  preparing:['Preparando tu fotografía','Comprobamos tu sesión y preparamos el archivo antes de enviarlo.'],
  uploading:['Subiendo tu fotografía','Estamos enviando tu foto y las referencias a tu espacio privado. Mantén la app abierta hasta confirmar la solicitud.'],
  checking:['Comprobando si la foto es apta','Revisamos la calidad de la foto antes de iniciar el retrato. Esta comprobación no consume créditos ni intentos.'],
  uncertain:['Comprobando tu solicitud','No recibimos la confirmación. La solicitud puede haberse registrado. Abre Mis fotos y comprueba el estado antes de volver a generar.'],
  failed:['La solicitud se ha detenido',message]
 }[phase];
 $('request-phase').textContent=copy[0];$('request-description').textContent=message||copy[1];
 $('request-step').textContent=phase==='checking'?'2 / 6':['preparing','uploading'].includes(phase)?'1 / 6':'—';
 $('request-note').textContent=['failed','uncertain'].includes(phase)?'No repitas una compra para resolver esta incidencia. Comprueba primero Mis fotos y tu saldo.':'Envía la solicitud una sola vez. Después podrás seguirla en Mis fotos sin repetir la generación ni la compra.';
 $('request-gallery').classList.toggle('hidden',phase!=='uncertain');
 if(requestStartedAt===null){requestStartedAt=Date.now();box.scrollIntoView?.({behavior:'smooth',block:'center'});}
 const tick=()=>{$('request-elapsed').textContent=translated('Tiempo en esta solicitud:')+' '+elapsedText({created_at:requestStartedAt});};
 tick();clearInterval(requestTimer);
 if(!['failed','uncertain'].includes(phase))requestTimer=setInterval(tick,1000);
}
function clearRequestProgress(){clearInterval(requestTimer);requestTimer=null;requestStartedAt=null;requestPhase=null;$('request-progress')?.classList.add('hidden');}
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
 const functionName=fluxMode&&['start','health'].includes(body.action)?'picgift-flux-personal':'picgift-generate';
 const {data,error}=await client.functions.invoke(functionName,{body});
 if(error){let message='El estudio no está disponible.',code='';try{const j=await error.context.json();message=j.error||message;code=j.code||''}catch{}const failure=Error(message);failure.code=code;throw failure}
 return data;
}
async function health(){
 const revision=++healthRevision,sessionRevision=authRevision;
 const isCurrent=()=>revision===healthRevision&&sessionRevision===authRevision;
 try{
  const {data:{session}}=await client.auth.getSession();
  if(!isCurrent())return;
  if(!session){resetStudioAvailability();status('Inicia sesión para crear tu fotografía.');return}
  const [beta,premium]=await Promise.all([
   client.functions.invoke('picgift-flux-personal',{body:{action:'health'}}),
   client.functions.invoke('picgift-generate',{body:{action:'health'}})
  ]);
  if(!isCurrent())return;
  const halloween=document.documentElement.dataset.campaign==='halloween';
  freeReady=halloween&&!beta.error&&beta.data?.available===true;
  premiumReady=!premium.error&&premium.data?.available===true;
  window.picgiftFreeReady=freeReady;window.picgiftPremiumReady=premiumReady;
  window.picgiftPilot=premium.data?.pilot===true;
  window.picgiftReferencesReady=freeReady||premium.data?.references_supported===true;
  controlAi(freeReady||premiumReady);
  status(freeReady||premiumReady?'Elige Foto Gratis o Foto Premium para crear tu retrato.':'No hay servicios disponibles para tu cuenta en este momento.');
  const email=$('photo-email-delivery');email.disabled=!premiumReady||premium.data?.email_available!==true;
  if(email.disabled)email.checked=false;
 }catch(e){if(!isCurrent())return;resetStudioAvailability();status('No hemos podido conectar con el estudio. Revisa tu sesión e inténtalo más tarde.')}
}
function resetStudioAvailability(){
 freeReady=false;premiumReady=false;
 window.picgiftFreeReady=false;window.picgiftPremiumReady=false;
 window.picgiftPilot=false;window.picgiftReferencesReady=false;
 const email=$('photo-email-delivery');email.disabled=true;email.checked=false;
 controlAi(false);
}
window.picgiftChooseService=()=>{
 if(serviceChoice)return serviceChoice;
 serviceChoice=chooseService().finally(()=>{serviceChoice=null});
 return serviceChoice;
};
async function chooseService(){
 const revision=authRevision;
 await health();
 if(revision!==authRevision)return null;
 const dialog=$('photo-service-choice'),free=$('choose-free-photo'),premium=$('choose-premium-photo');
 const credits=window.picgiftCreditsAvailable;
 const balanceKnown=typeof credits==='number'&&Number.isFinite(credits);
 const billingMode=window.picgiftPilot===true&&balanceKnown&&credits<=0?'pilot':'credits';
 free.disabled=!freeReady;premium.disabled=!premiumReady;
 if(window.picgiftPilot===true&&!balanceKnown)premium.disabled=true;
 $('free-photo-availability').textContent=freeReady?'Crea un retrato con tu fotografía. Sujeto a la cuota diaria de la beta.':'No disponible para esta cuenta.';
 $('premium-photo-availability').textContent=!premiumReady?'El servicio Premium no está disponible ahora.':!balanceKnown&&window.picgiftPilot===true?'Actualiza tu saldo antes de elegir Foto Premium.':billingMode==='pilot'?'Prueba Premium gratuita para tu cuenta piloto. No consume créditos.':'Foto Premium utiliza 1 crédito. Se descuenta solo si la foto supera la revisión inicial.';
 return new Promise(resolve=>{
  const finish=()=>{dialog.removeEventListener('close',finish);const service=dialog.returnValue;resolve(['free','premium'].includes(service)?{service,billing_mode:service==='premium'?billingMode:null}:null)};
  dialog.returnValue='';dialog.addEventListener('close',finish);dialog.showModal();
 });
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
async function smallFluxImage(blob,name){
 if(!blob||!['image/jpeg','image/png','image/webp'].includes(blob.type)||blob.size>15*1024*1024)throw Error('Imagen de referencia no válida.');
 const bitmap=await createImageBitmap(blob);
 try{
  const ratio=Math.min(1,480/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(64,Math.round(bitmap.width*ratio));
  canvas.height=Math.max(64,Math.round(bitmap.height*ratio));
  if(Math.max(canvas.width,canvas.height)>480)throw Error('Tamaño de referencia no válido.');
  canvas.getContext('2d',{alpha:false}).drawImage(bitmap,0,0,canvas.width,canvas.height);
  const compressed=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.86));
  if(!compressed||compressed.size<1000||compressed.size>550000)throw Error('No se pudo preparar la referencia.');
  return new File([compressed],name,{type:'image/jpeg'});
 }finally{bitmap.close()}
}
async function sceneFluxImage(sceneId){
 const url=sceneImages[sceneId];
 if(!url||!url.startsWith('./assets/'))throw Error('Este decorado todavía no está disponible para el servicio elegido.');
 const response=await fetch(url,{cache:'force-cache'});
 if(!response.ok)throw Error('No se pudo cargar el fondo autorizado.');
 const blob=await response.blob();
 return smallFluxImage(blob,'flux-scene.jpg');
}
function finishButton(){working=false;controlAi(aiReady)}
async function create(ev){
 if(working)return;
 const {service='free',billing_mode}=ev.detail||{};if(!['free','premium'].includes(service))return;fluxMode=service==='free';
 // Cached callers may omit the mode; the server preserves their existing pilot/paid behavior.
 if(!fluxMode&&billing_mode!==undefined&&!['credits','pilot'].includes(billing_mode)){status('Elige de nuevo Foto Premium para confirmar el uso de créditos.');return;}
 if(!(fluxMode?freeReady:premiumReady)){status('El servicio elegido no está disponible.');return;}const {file,references={},scene_id,format,pose,outfit,consent,email_requested:requestedEmail}=ev.detail||{};
 const email_requested=!fluxMode&&requestedEmail===true;
 if(!file||consent!==true){status('Selecciona una foto y autoriza su tratamiento antes de generar.');return}
 if(!Object.prototype.hasOwnProperty.call(labels,scene_id)){status('Este escenario está en preparación.');return}
 working=true;controlAi(aiReady);$('generate').disabled=true;$('generate').textContent='Preparando solicitud…';
 clearRequestProgress();requestProgress('preparing');
 const sessionRevision=authRevision;
 const requireSameSession=()=>{if(sessionRevision!==authRevision){const error=Error('La sesión ha cambiado.');error.code='session_changed';throw error}};
 let path=null,uploadedPaths=[],acceptedByServer=false,requestSubmitted=false;
 try{
  const {data:{user}}=await client.auth.getUser();if(!user)throw Error('Inicia sesión de nuevo para continuar.');
  requireSameSession();
  const ready=await invoke({action:'health'});
  requireSameSession();
  if(!ready.available)throw Error('El estudio no está disponible. No se ha subido ni procesado ninguna foto.');
  if(email_requested&&!ready.email_available)throw Error('La entrega por correo todavía no está activada. Desmarca esa opción para recibirla en tu cuenta.');
  const prepared=await preparedFile(file);
  requireSameSession();
  if(prepared.size>15*1024*1024)throw Error('El archivo es demasiado grande. Máximo 15 MB.');
  const ext=prepared.type==='image/png'?'png':prepared.type==='image/webp'?'webp':'jpg';
  path=user.id+'/'+crypto.randomUUID()+'/source.'+ext;
  status('Subiendo tu fotografía a un espacio privado…');
  requestProgress('uploading');
  const uploaded=await client.storage.from('picgift-uploads').upload(path,prepared,{contentType:prepared.type,cacheControl:'0',upsert:false});
  if(uploaded.error)throw Error('No se pudo subir la foto. Comprueba la conexión y vuelve a intentarlo.');
  uploadedPaths.push(path);
  requireSameSession();
  const reference_paths={};
  if(fluxMode){
   const folder=path.slice(0,path.lastIndexOf('/'));
   const subject=await smallFluxImage(prepared,'flux-subject.jpg');requireSameSession();
   const scene=await sceneFluxImage(scene_id);requireSameSession();
   const inputs=[['flux_subject',subject],['flux_scene',scene]];
   for(const kind of ['face','body']){
    if(references[kind]){
     if(inputs.length>=4)throw Error('Demasiadas referencias.');
     inputs.push(['flux_'+kind,await smallFluxImage(references[kind],'flux-'+kind+'.jpg')]);
     requireSameSession();
    }
   }
   for(const [key,small] of inputs){
    const privatePath=folder+'/'+key.replace('_','-')+'.jpg';
    const upload=await client.storage.from('picgift-uploads').upload(privatePath,small,{contentType:'image/jpeg',cacheControl:'0',upsert:false});
    if(upload.error)throw Error('No se pudo subir la referencia. Comprueba la conexión y vuelve a intentarlo.');
    reference_paths[key]=privatePath;uploadedPaths.push(privatePath);
    requireSameSession();
   }
  }else{
   for(const kind of ['face','body']){
    const reference=references[kind];if(!reference)continue;
    if(!['image/jpeg','image/png','image/webp'].includes(reference.type)||reference.size>15*1024*1024)throw Error('La referencia supera el tamaño o tipo permitido.');
    if(ready.references_supported!==true)throw Error('El estudio aún no admite referencias adicionales.');
    const extra=await preparedFile(reference),extension=extra.type==='image/png'?'png':extra.type==='image/webp'?'webp':'jpg';
    requireSameSession();
    const extraPath=path.slice(0,path.lastIndexOf('/'))+'/reference-'+kind+'.'+extension;
    const upload=await client.storage.from('picgift-uploads').upload(extraPath,extra,{contentType:extra.type,cacheControl:'0',upsert:false});
    if(upload.error)throw Error('No se pudo subir la referencia.');
    uploadedPaths.push(extraPath);reference_paths[kind]=extraPath;
    requireSameSession();
   }
  }
  requireSameSession();
  status('Revisando si tu fotografía es apta antes de consumir créditos o intentos…');
  requestProgress('checking');
  requestSubmitted=true;
  const accepted=await invoke({action:'start',billing_mode,request_language:window.picgiftI18n.language,scene_id,source_path:path,reference_paths,format,pose:String(pose).slice(0,90),outfit:String(outfit).slice(0,90),consent:true,guardian_consent:consent===true,email_requested:email_requested===true});
  if(!accepted?.id)throw Error('No se pudo iniciar la generación.');
  path=null;acceptedByServer=true;
  requireSameSession();
  clearRequestProgress();
  activeId=accepted.id;
  window.dispatchEvent(new CustomEvent('picgift:portrait-started',{detail:{id:activeId}}));
  $('result-empty').classList.add('hidden');$('real-result').classList.remove('hidden');
  $('result-page-title').textContent='Tu retrato de cuento';
  $('result-page-description').textContent='El trabajo se está procesando. Podrás descargar tu foto cuando termine y supere el control de calidad.';
  status('Solicitud aceptada. Puedes seguir el estado en Mis fotos.');
  window.dispatchEvent(new CustomEvent('picgift:route',{detail:{name:'resultado'}}));
  $('download-result').classList.add('hidden');
  renderProgress({id:accepted.id,scene_id,status:'queued',created_at:new Date().toISOString()});
  await refreshGallery();
  requireSameSession();
  startPolling();
 }catch(e){
  const preflightStopped=['photo_not_suitable','photo_preflight_unavailable','photo_source_unavailable','photo_reference_invalid','photo_balance_unavailable','photo_credit_required'].includes(e.code);
  if(sessionRevision===authRevision){
   const message=preflightStopped?(e.message||'La foto no superó la revisión.')+' No se han consumido créditos ni intentos.':requestSubmitted?'No se pudo confirmar la solicitud. Consulta Mis fotos antes de volver a intentarlo.':e.message||'No se pudo iniciar la generación.';
   status(message);requestProgress(requestSubmitted&&!preflightStopped?'uncertain':'failed',message);
   if(requestSubmitted&&!preflightStopped)await refreshGallery();
  }
  if(!acceptedByServer&&(!requestSubmitted||preflightStopped)&&uploadedPaths.length)await client.storage.from('picgift-uploads').remove(uploadedPaths).catch(()=>{});
 }
 finally{finishButton()}
}
function elapsedText(job){
 const ms=Date.now()-new Date(job.created_at).getTime();
 if(!Number.isFinite(ms))return '—';
 const n=Math.max(0,Math.floor(ms/1000));
 return n<60?n+' s':Math.floor(n/60)+' min '+String(n%60).padStart(2,'0')+' s';
}
function renderProgress(job){
 if(!job)return;
 currentJob=job;
 const state=job.status,detail=progressDetails(job),failed=state==='failed';
 const terminal=detail.terminal;
 const track=$('progress-track');track.dataset.state=state;
 track.removeAttribute('aria-valuenow');track.removeAttribute('aria-valuemin');track.removeAttribute('aria-valuemax');
 track.setAttribute('aria-label',translated('Etapas de tu fotografía'));
 $('progress-count').textContent=detail.step===null?'—':(detail.step+1)+' / 6';
 $('progress-phase').textContent=detail.title;
 $('progress-headline').textContent=detail.title;
 $('progress-kicker').textContent=failed?'Proceso detenido':state==='completed'?'Tu retrato privado':state==='needs_review'?'Revisión pendiente':'Tu fotografía, paso a paso';
 $('progress-description').textContent=detail.description;
 $('result-page-description').textContent=terminal?'Consulta el resultado y los detalles de tu fotografía.':'El estado se actualiza automáticamente. No necesitas repetir la solicitud.';
 $('progress-note').textContent=failed?'Comprueba Mis fotos y tu saldo antes de volver a generar. No necesitas comprar otro pack para consultar esta incidencia.':state==='completed'?'La imagen ha sido creada con IA. Revísala antes de compartirla.':state==='needs_review'?'No crees otra fotografía para desbloquear esta. Puedes volver a comprobar su estado.':'Puedes salir de esta pantalla. Tu solicitud sigue en Mis fotos; no repitas la generación ni la compra.';
 $('progress-elapsed').classList.toggle('hidden',terminal);
 $('progress-elapsed').textContent=translated('Tiempo desde la solicitud:')+' '+elapsedText(job);
 document.querySelectorAll('[data-progress-step]').forEach(el=>{
  const step=Number(el.dataset.progressStep),current=step===detail.step&&state!=='completed',done=detail.step!==null&&step<detail.step||state==='completed';
  el.classList.toggle('is-active',current);el.classList.toggle('is-done',done);el.classList.toggle('is-stopped',current&&(failed||state==='needs_review'));
  if(current)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');
 });
 $('retry-job').classList.add('hidden');
 $('progress-actions')?.classList.toggle('hidden',state==='completed');
 $('refresh-job').disabled=false;$('refresh-job').textContent=terminal?'Volver a comprobar':'Comprobar estado';
 $('result-status').textContent=failed?detail.description:state==='completed'?'Completada. Puedes descargar el resultado desde esta página o Mis fotos.':state==='needs_review'?'La imagen no se ofrece para descarga porque necesita revisión de calidad.':detail.title;
 $('result-status').classList.add('hidden');
 $('result-watermark').classList.remove('hidden');
 $('result-watermark').textContent=state==='completed'?'LISTA':'Decorado de referencia';
 $('result-sample').alt=state==='completed'?'Tu resultado fotográfico privado PICGIFT':'Solo referencia del decorado, todavía no es la fotografía generada';
 if(state!=='completed'&&sceneImages[job.scene_id])$('result-sample').src=sceneImages[job.scene_id];
 renderConnection();
 if(terminal)stopPolling();
}
function renderConnection(){
 const warning=$('progress-warning'),job=currentJob;if(!job)return;
 const pending=!progressDetails(job).terminal;
 const delayed=pending&&Date.now()-new Date(job.updated_at||job.created_at).getTime()>150000;
 warning.classList.toggle('hidden',!galleryConnectionLost&&!delayed);
 warning.textContent=galleryConnectionLost?'No podemos actualizar el estado por la conexión. Esto no confirma un fallo del retrato. Reintentamos automáticamente; no vuelvas a generar ni a comprar.':delayed?'Seguimos esperando una actualización. El tiempo varía según la fotografía. Puedes volver a Mis fotos; no hace falta enviar otra solicitud.':'';
 const checked=$('progress-checked');
 checked.textContent=galleryConnectionLost?'Último estado conocido':lastGalleryCheck?translated('Estado comprobado a las')+' '+new Date(lastGalleryCheck).toLocaleTimeString(window.picgiftI18n?.locale||'es-ES',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'Esperando la primera actualización';
}
function tickElapsed(){
 if(currentJob&&!progressDetails(currentJob).terminal){$('progress-elapsed').textContent=translated('Tiempo desde la solicitud:')+' '+elapsedText(currentJob);renderConnection();}
}
const portraitFilename=path=>'picgift-portrait.'+(/\.(png|webp|jpg)$/i.exec(path||'')?.[1]?.toLowerCase()||'jpg');
async function signed(path,download=false){
 if(!path)return null;const {data,error}=await client.storage.from('picgift-generated').createSignedUrl(path,3600,download?{download:portraitFilename(path)}:{});
 return error?null:data?.signedUrl;
}
function plainCard(job,href,download){
 const name=labels[job.scene_id]||'PICGIFT';const date=new Date(job.created_at).toLocaleDateString(window.picgiftI18n?.locale||'es-ES',{day:'2-digit',month:'short',year:'numeric'});
 return '<article class="panel" style="display:flex;flex-direction:column;gap:10px;min-width:0">'
 + (href?'<img src="'+escape(href)+'" loading="lazy" alt="Tu fotografía PICGIFT" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:13px">':'<div class="detail-pic" style="height:140px;display:grid;place-items:center;color:#d9c18d">✧ '+escape(statuses[job.status]||job.status)+'</div>')
 +'<span class="eyebrow">'+escape(date)+'</span><h3>'+escape(name)+'</h3><p class="muted" style="font-size:12px">'+escape(statuses[job.status]||job.status)+'</p>'
 +(job.status==='failed'?'<p class="muted" style="font-size:12px">'+escape(errorDescriptions[job.failure_code]||'La generación terminó con un error y no produjo una fotografía.')+'</p>':job.status!=='completed'?'<p class="muted" style="font-size:12px">'+escape(progressDetails(job).description)+'</p>':'')
 +'<button class="btn outline" type="button" data-view-job="'+escape(job.id)+'">Ver estado y detalles</button>'
  +(href?'<a class="btn primary" data-download-job="'+escape(job.id)+'" rel="noopener noreferrer" href="'+escape(download||href)+'">Descargar mi foto</a>':'')
 +'<button class="btn quiet" type="button" data-report-job="'+escape(job.id)+'">Informar de un problema con el retrato</button>'
 +'<button class="btn quiet" type="button" data-delete-job="'+escape(job.id)+'">Eliminar fotografía y datos</button></article>';
}
async function refreshGallery(){
 const revision=++galleryRevision;
 try{
  if(currentJob&&['queued','analyzing','generating','reviewing'].includes(currentJob.status)){
   const time=new Date(currentJob.updated_at||currentJob.created_at).getTime();
   if(Date.now()-time>8*60*1000)await invoke({action:'status'});
  }
  const {data,error}=await client.from('picgift_photo_jobs').select('id,scene_id,result_path,status,created_at,updated_at,email_status,failure_message,failure_code,failure_stage,result_quality').order('created_at',{ascending:false}).limit(30);
 if(revision!==galleryRevision)return null;
 if(error)throw error;
 const jobs=data||[];
 const withLinks=await Promise.all(jobs.map(async j=>({job:j,href:j.status==='completed'?await signed(j.result_path):null,download:j.status==='completed'?await signed(j.result_path,true):null})));
 if(revision!==galleryRevision)return null;
 lastJobs=jobs;
 galleryConnectionLost=false;lastGalleryCheck=Date.now();$('gallery-connection-warning')?.classList.add('hidden');
 window.picgiftGallery=withLinks.map(o=>({...o,name:labels[o.job.scene_id]||'PICGIFT',statusLabel:statuses[o.job.status]||o.job.status}));
  window.dispatchEvent?.(new CustomEvent('picgift:gallery',{detail:{jobs:jobs.map(({id,status})=>({id,status}))}}));
 if(window.picgiftRenderGallery)window.picgiftRenderGallery(window.picgiftGallery);
 else $('photo-library').innerHTML=withLinks.length?'<div class="scene-grid">'+withLinks.map(o=>plainCard(o.job,o.href,o.download)).join('')+'</div>':'<div class="panel empty"><div class="large">✧</div><h3>Todavía no hay fotografías</h3><p>Cuando generes tu primera imagen, aparecerá aquí de forma privada.</p><button class="btn outline" data-route="crear">Crear una foto</button></div>';
  const job=activeId?lastJobs.find(j=>j.id===activeId):lastJobs[0];
 if(job){
   $('result-name').textContent=labels[job.scene_id]||'PICGIFT';
   $('download-result').removeAttribute('href');
   delete $('download-result').dataset.downloadJob;
   $('download-result').classList.add('hidden');
   $('result-sample').removeAttribute('src');
  $('result-empty').classList.add('hidden');
  $('real-result').classList.remove('hidden');
  renderProgress(job);
  if(job.status==='completed'){
    const result=withLinks.find(x=>x.job.id===job.id);
    if(result?.href){
      $('result-sample').src=result.href;
      $('result-watermark').classList.add('hidden');
      $('download-result').href=result.download||result.href;
      $('download-result').dataset.downloadJob=job.id;
      $('download-result').classList.remove('hidden');
    }else{
      $('result-status').textContent='La fotografía está guardada, pero no ha sido posible generar el enlace privado. Pulsa «Comprobar estado».';
      $('result-status').classList.remove('hidden');
      $('progress-actions')?.classList.remove('hidden');
      $('download-result').classList.add('hidden');
    }
  }else{
    $('download-result').classList.add('hidden');
  }
 }else if(!(activeId&&(!currentJob||['queued','analyzing','generating','reviewing'].includes(currentJob.status)))){
  activeId=null;currentJob=null;stopPolling();
  $('result-sample').removeAttribute('src');$('download-result').removeAttribute('href');
  $('real-result').classList.add('hidden');$('result-empty').classList.remove('hidden');
 }
 renderConnection();
 return lastJobs;
 }catch(e){
  if(revision!==galleryRevision)return null;
  console.warn('PICGIFT private gallery unavailable');
  galleryConnectionLost=true;$('gallery-connection-warning')?.classList.remove('hidden');renderConnection();
  return null;
 }
}
function resumeGallery(){if(galleryAuthenticated&&!document.hidden)void refreshGallery()}
function clearPrivateGallery(){
 galleryRevision++;stopPolling();activeId=null;currentJob=null;lastJobs=[];window.picgiftGallery=[];
 clearRequestProgress();galleryConnectionLost=false;lastGalleryCheck=null;$('gallery-connection-warning')?.classList.add('hidden');
 $('photo-library').replaceChildren();$('result-sample').removeAttribute('src');$('download-result').removeAttribute('href');
  delete $('download-result').dataset.downloadJob;
 $('real-result').classList.add('hidden');$('result-empty').classList.remove('hidden');
 $('refresh-job').disabled=false;$('refresh-job').textContent='Comprobar estado';
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
    if(!j){if(currentJob?.id!==activeId||!['queued','analyzing','generating','reviewing'].includes(currentJob.status))stopPolling();return}
   status(statuses[j.status]||j.status);
   if(['completed','needs_review','failed'].includes(j.status))stopPolling();
  }finally{pollBusy=false}
 },6000);
}
async function removePhoto(id){
 if(!confirm(window.picgiftI18n.t('¿Eliminar de forma definitiva esta fotografía, el original subido y su resultado?')))return;
 const revision=authRevision;
 try{
  await invoke({action:'delete',job_id:id});if(revision!==authRevision)return;
  if(id===activeId){activeId=null;currentJob=null;stopPolling();$('real-result').classList.add('hidden');$('result-empty').classList.remove('hidden')}
  await refreshGallery();if(revision===authRevision)status('Fotografía eliminada de tu espacio privado.');
 }catch(e){if(revision===authRevision)status('No se pudo eliminar: '+e.message)}
}
async function downloadPortrait(id,button){
 const revision=authRevision,job=lastJobs.find(j=>j.id===id&&j.status==='completed');
 if(!galleryAuthenticated||!job||button.dataset.downloading==='true')return;
 button.dataset.downloading='true';button.setAttribute('aria-busy','true');
 try{
  const href=await signed(job.result_path,true);
  if(revision!==authRevision)return;
  if(!href)throw Error('private_link_unavailable');
  const link=document.createElement('a');link.href=href;link.rel='noopener noreferrer';
  link.download=portraitFilename(job.result_path);document.body.appendChild(link);link.click();link.remove();
 }catch{
  if(revision===authRevision)window.dispatchEvent(new CustomEvent('picgift:notice',{detail:{message:'No se pudo preparar la descarga privada. Comprueba la conexión y vuelve a intentarlo.'}}));
 }finally{delete button.dataset.downloading;button.removeAttribute('aria-busy')}
}
function init(){
 window.addEventListener('picgift:generate',create);
 window.addEventListener('picgift:navigated',event=>{if(event.detail?.name==='resultado'&&currentJob)$('result-name').textContent=labels[currentJob.scene_id]||'PICGIFT'});
  document.addEventListener('click',event=>{const button=event.target.closest('[data-download-job]');if(button){event.preventDefault();void downloadPortrait(button.dataset.downloadJob,button)}});

 $('refresh-job').addEventListener('click',async()=>{
  const btn=$('refresh-job');if(btn.disabled)return;
  const revision=authRevision;btn.disabled=true;btn.textContent='Comprobando…';
  try{
    await invoke({action:'status'});
    if(revision!==authRevision)return;
    await refreshGallery();
  }catch{
    if(revision!==authRevision)return;
    $('progress-warning').textContent='No se ha podido contactar con el servidor. Vuelve a intentarlo en unos segundos.';
    $('progress-warning').classList.remove('hidden');
  }finally{if(revision===authRevision){btn.disabled=false;btn.textContent='Comprobar estado'}}
 });
 $('gallery-reconnect')?.addEventListener('click',async()=>{
  const button=$('gallery-reconnect');if(button.disabled)return;button.disabled=true;
  try{await refreshGallery()}finally{button.disabled=false}
 });
 window.addEventListener('picgift:auth',async e=>{
  const revision=++authRevision;
   clearPrivateGallery();resetStudioAvailability();galleryAuthenticated=!!e.detail.user;
   if($('photo-service-choice')?.open)$('photo-service-choice').close();
  if(!galleryAuthenticated){status('Inicia sesión para acceder a la creación de retratos.');return}
  await health();if(revision!==authRevision)return;
  const jobs=await refreshGallery();if(revision!==authRevision)return;
  if(!activeId){const inProgress=jobs?.find(j=>['queued','analyzing','generating','reviewing'].includes(j.status));if(inProgress){activeId=inProgress.id;startPolling()}}
 });
 $('photo-library').addEventListener('click',async e=>{
  const id=e.target.closest('[data-delete-job]')?.dataset.deleteJob;
  if(id){await removePhoto(id);return}
  const open=e.target.closest('[data-view-job]')?.dataset.viewJob;
  if(!open)return;
  activeId=open;
  const job=lastJobs.find(j=>j.id===open);
  if(!job)return;
   $('result-sample').removeAttribute('src');$('download-result').removeAttribute('href');delete $('download-result').dataset.downloadJob;
   $('download-result').classList.add('hidden');renderProgress(job);
  $('result-name').textContent=labels[job.scene_id]||'PICGIFT';
  window.dispatchEvent(new CustomEvent('picgift:route',{detail:{name:'resultado'}}));
  const revision=authRevision;
  const jobs=await refreshGallery();if(revision!==authRevision||activeId!==open)return;
  const latest=jobs?.find(j=>j.id===open);
  if(latest&&['queued','analyzing','generating','reviewing'].includes(latest.status))startPolling();
 });
 document.addEventListener('visibilitychange',resumeGallery);
 window.addEventListener('online',resumeGallery);
 window.addEventListener('offline',()=>{if(galleryAuthenticated){galleryConnectionLost=true;renderConnection()}});
 const initialAuthRevision=authRevision;
 client.auth.getUser().then(async ({data})=>{if(initialAuthRevision!==authRevision)return;if(data?.user){galleryAuthenticated=true;await health();if(initialAuthRevision!==authRevision)return;const jobs=await refreshGallery();if(initialAuthRevision!==authRevision)return;const pending=jobs?.find(j=>['queued','analyzing','generating','reviewing'].includes(j.status));if(pending){activeId=pending.id;startPolling()}}}).catch(()=>{});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();

async function reportPortrait(id){
 const revision=authRevision;
 const btn=document.querySelector('[data-report-job="'+id+'"]');if(!btn||btn.disabled)return;btn.disabled=true;
 try{
  const {data:{user}}=await client.auth.getUser();if(revision!==authRevision)return;
  if(!user){btn.disabled=false;return}
  const {error}=await client.from('picgift_content_reports').insert({user_id:user.id,job_id:id,reason:'other'});
  if(revision!==authRevision)return;
  const received=!error||error.code==='23505';
  btn.textContent=received?'Informe recibido. Revisaremos este retrato.':'No se pudo enviar el informe. Inténtalo de nuevo.';
  btn.disabled=received;
 }catch{
  if(revision!==authRevision)return;
  btn.textContent='No se pudo enviar el informe. Inténtalo de nuevo.';btn.disabled=false;
 }
}
document.addEventListener('click',event=>{const btn=event.target.closest('[data-report-job]');if(btn)reportPortrait(btn.dataset.reportJob)});
window.addEventListener('picgift:language',()=>{if(lastJobs.length)refreshGallery()});
