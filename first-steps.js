(()=>{'use strict';
 const dialog=document.getElementById('first-steps');
 if(!dialog)return;
 let user=null,revision=0,started=false,waiting=false,paused=false,completed=false,sceneChosen=false,route='inicio',jobs=[],portraitId=null;
 let studio=window.picgiftStudioState||{};
 const key=()=> 'picgift-first-portrait-v2:'+user?.id;
 const seen=()=>{try{return localStorage.getItem(key())==='done'}catch{return false}};
 const go=name=>window.dispatchEvent(new CustomEvent('picgift:route',{detail:{name}}));
 const card=document.createElement('section');card.className='first-photo-guide';card.hidden=true;
 card.setAttribute('aria-label','Guía de tu primera fotografía');
 card.innerHTML='<div><span class="eyebrow" id="first-photo-step"></span><h2 id="first-photo-heading"></h2><p id="first-photo-copy"></p></div><div class="first-photo-actions"><button class="btn primary" type="button" data-guide-action></button><button class="text-btn" type="button" data-guide-saved hidden>Ya he guardado mi foto</button><button class="text-btn" type="button" data-guide-pause>Continuar más tarde</button></div>';
 const get=selector=>card.querySelector(selector);
 const stage=()=>{
  const result=jobs.find(j=>j.id===portraitId&&j.status==='completed')||jobs.find(j=>j.status==='completed');
  if(result)return {number:5,title:'Tu primera foto está lista',copy:'Abre el resultado y pulsa Descargar mi foto. Cuando la tengas guardada en tu dispositivo, confirma para terminar la guía.',action:'Ver y descargar',result};
  const pending=jobs.find(j=>['queued','analyzing','generating','reviewing'].includes(j.status));
  if(waiting||studio.working||pending)return {number:4,title:'Estamos preparando tu retrato',copy:'Puedes seguir su estado en Mis fotos y salir de esta pantalla. La descarga aparece cuando termine y supere la revisión.',action:'Ver Mis fotos',page:'mis-fotos'};
  const problem=jobs.find(j=>j.id===portraitId&&['failed','needs_review'].includes(j.status));
  if(problem)return {number:4,title:problem.status==='failed'?'La foto no pudo completarse':'Tu foto necesita revisión',copy:'Consulta los detalles en Mis fotos. La guía seguirá disponible y no se ha marcado como terminada.',action:'Ver Mis fotos',page:'mis-fotos'};
  if(!studio.hasPhoto)return {number:1,title:'Elige tu fotografía',copy:'Usa una foto nítida, con buena luz y la cara visible. Permanece en tu dispositivo hasta que autorices la creación.',action:'Elegir mi foto',target:'photo'};
  if(!studio.hasScene||!sceneChosen)return {number:2,title:'Elige un escenario',copy:'Toca uno de los decorados disponibles. Puedes ajustar el encuadre, la postura y el vestuario antes de crear.',action:'Elegir escenario',target:'mobile-scenes'};
  if(!studio.hasConsent)return {number:3,title:'Revisa y autoriza tu retrato',copy:'Comprueba la foto y el decorado, revisa la información sobre el tratamiento de imágenes y marca la autorización si estás de acuerdo.',action:'Revisar autorización',target:'photo-ai-consent'};
  return {number:4,title:'Crea tu primera foto',copy:studio.available?'Pulsa Crear mi foto para usar tu única foto Premium de prueba. Después podrás crear más con créditos.':'El estudio todavía no está disponible para esta cuenta. Puedes conservar la guía y volver cuando se habilite.',action:'Ir a Crear mi foto',target:'generate'};
 };
 function render(){
  if(!user||!started||paused||completed){card.hidden=true;return}
  const page=document.querySelector('[data-page="'+route+'"]');
  if(!page||!['inicio','crear','mis-fotos','resultado'].includes(route)){card.hidden=true;return}
  if(card.parentNode!==page)page.prepend(card);
  card.hidden=false;
  const step=stage();
  get('#first-photo-step').textContent=(window.picgiftI18n?.t('TU PRIMERA FOTO')||'TU PRIMERA FOTO')+' · '+step.number+' / 5';
  get('#first-photo-heading').textContent=step.title;
  get('#first-photo-copy').textContent=step.copy;
  get('[data-guide-action]').textContent=step.action;
  get('[data-guide-saved]').hidden=!step.result;
 }
 function start(){started=true;paused=false;dialog.close();go('crear');render()}
 function defer(){paused=true;dialog.close();render()}
 function finish(){
  if(!user||!jobs.some(j=>j.status==='completed'))return;
  try{localStorage.setItem(key(),'done')}catch{}
  completed=true;card.hidden=true;dialog.close();
  window.dispatchEvent(new Event('picgift:onboarding-complete'));
 }
 function open(){paused=false;started=true;completed=false;if(!dialog.open)dialog.showModal();render()}
 function enter(){
  if(!user||started)return;
  if(window.PicgiftNative&&!window.picgiftEntryNotificationsReady)return;
  started=true;completed=seen();
  const entryRevision=revision;
  setTimeout(()=>{
   if(entryRevision!==revision||!user)return;
   // Native entry always lands on Home. Web links keep their intended route.
   if(window.PicgiftNative)go('inicio');
   if(!completed&&!paused)open();else render();
  },0);
 }
 document.addEventListener('click',event=>{
  if(event.target.closest('[data-first-steps]'))open();
  const intro=event.target.closest('[data-first-steps-done]');
  if(intro){if(intro.classList.contains('primary'))start();else defer();}
  if(event.target.closest('[data-guide-pause]'))defer();
  if(event.target.closest('[data-guide-saved]'))finish();
  if(event.target.closest('[data-guide-action]')){
   const step=stage();
   if(step.result){
    const button=document.querySelector('[data-view-job="'+step.result.id+'"]');
    if(button)button.click();else go('mis-fotos');
   }else if(step.page)go(step.page);
   else{go('crear');const target=document.getElementById(step.target);target?.scrollIntoView?.({behavior:'smooth',block:'center'});if(step.target==='photo')target?.click();else target?.focus?.();}
  }
 });
 dialog.addEventListener('cancel',event=>{event.preventDefault();defer()});
 window.addEventListener('picgift:navigated',event=>{route=event.detail.name;render()});
 window.addEventListener('picgift:studio-state',event=>{studio=event.detail;if(!studio.working&&waiting&&!portraitId)waiting=false;render()});
 window.addEventListener('picgift:portrait-started',event=>{portraitId=event.detail.id;waiting=true;render()});
 window.addEventListener('picgift:gallery',event=>{jobs=event.detail.jobs||[];if(jobs.some(j=>j.id===portraitId))waiting=false;render()});
 window.addEventListener('picgift:portrait-saved',event=>{if(event.detail?.user_id===user?.id)finish()});
 window.addEventListener('picgift:scene-selected',()=>{sceneChosen=true;render()});
 window.addEventListener('picgift:entry-notifications-ready',enter);
 window.addEventListener('picgift:auth',event=>{
  revision++;user=event.detail.user||null;started=false;paused=false;completed=false;waiting=false;sceneChosen=false;jobs=[];portraitId=null;
  dialog.close();card.hidden=true;
  if(user)enter();
 });
 if(window.picgiftCurrentUser){user=window.picgiftCurrentUser;jobs=(window.picgiftGallery||[]).map(o=>o.job);enter();}
})();
