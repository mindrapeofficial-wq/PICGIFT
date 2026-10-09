(()=>{'use strict';
const $=id=>document.getElementById(id);
let scenes=[],selected=null,user=null,route='inicio',pending=null,file=null,localURL=null,filter='Todos';
const staticScenes=[{"id": "halloween-potions", "name": "La escuela de magia", "description": "Pociones brillantes, libros antiguos y un pequeño gran mago.", "category": "Fantasía", "badge": "Colección Halloween", "ages": "Retratos infantiles y familiares", "poses": ["De pie tras el caldero"], "source": "picgift", "status": "pilot", "previewOnly": false, "image": "./assets/halloween/backdrops/potions.jpg", "credit": {"author": "PICGIFT", "url": null}}, {"id": "halloween-autumn-arch", "name": "El bosque encantado", "description": "Una brujita de cuento bajo un arco de hojas y farolillos.", "category": "Bosques", "badge": "Colección Halloween", "ages": "Retratos infantiles y familiares", "poses": ["De pie"], "source": "picgift", "status": "pilot", "previewOnly": false, "image": "./assets/halloween/backdrops/autumn-arch.jpg", "credit": {"author": "PICGIFT", "url": null}}, {"id": "halloween-pumpkin-bench", "name": "El rincón de las calabazas", "description": "Calabazas, gatos negros y una sonrisa que lo ilumina todo.", "category": "Clásicos", "badge": "Colección Halloween", "ages": "Retratos infantiles y familiares", "poses": ["Sentado en el banco"], "source": "picgift", "status": "pilot", "previewOnly": false, "image": "./assets/halloween/backdrops/pumpkin-bench.jpg", "credit": {"author": "PICGIFT", "url": null}}, {"id": "halloween-lantern-street", "name": "La calle de los farolillos", "description": "Un paseo de cuento entre calabazas y luces cálidas.", "category": "Fantasía", "badge": "Colección Halloween", "ages": "Retratos infantiles y familiares", "poses": ["De pie"], "source": "picgift", "status": "pilot", "previewOnly": false, "image": "./assets/halloween/backdrops/lantern-street.jpg", "credit": {"author": "PICGIFT · Fondo aportado"}}];
function icon(id){return '<svg><use href="#i-'+id+'"></use></svg>'}
function toast(message){const e=$('toast');e.textContent=message;e.classList.add('on');clearTimeout(toast.timer);toast.timer=setTimeout(()=>e.classList.remove('on'),4200)}
function escapeHTML(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function imageRef(s){return escapeHTML(s.image||'')}
function card(s){
 const available=s.source==='picgift',previewable=available||['concept','sample'].includes(s.source);
 return '<article class="scene-card'+(available?'':' scene-unavailable')+'"'+(previewable?' data-select="'+escapeHTML(s.id)+'" tabindex="0" role="button" aria-label="Ver escenario '+escapeHTML(s.name)+'"':'')+'><div class="scene-pic"><img src="'+imageRef(s)+'" loading="lazy" alt="Decorado de '+escapeHTML(s.name)+'" onerror="this.style.opacity=.1"><span class="scene-label">'+escapeHTML(available?'Colección Halloween':'Próximamente')+'</span></div><div class="scene-body"><h3>'+escapeHTML(s.name)+'</h3><p>'+escapeHTML(s.description)+'</p><div class="scene-bottom"><span>'+(available?'Elegir este escenario':'Decorado de la colección')+'</span>'+(previewable?'<button class="round-arrow" type="button" aria-label="Ver '+escapeHTML(s.name)+'" data-select="'+escapeHTML(s.id)+'">→</button>':'')+'</div></div></article>'
}
const referenceScenes=[{"id":"reference-enchanted-city","name":"Ciudad encantada","category":"Fantasía","description":"Nuevo escenario de Halloween. Próximamente disponible para crear retratos.","source":"concept","status":"coming-soon","previewOnly":true,"image":"./assets/halloween/reference/enchanted-city.webp","poses":["De pie"],"ages":"Retratos familiares"},{"id":"reference-pumpkin-forest","name":"Bosque de calabazas","category":"Bosques","description":"Nuevo escenario de Halloween. Próximamente disponible para crear retratos.","source":"concept","status":"coming-soon","previewOnly":true,"image":"./assets/halloween/reference/pumpkin-forest.webp","poses":["De pie"],"ages":"Retratos familiares"},{"id":"reference-haunted-castle","name":"Castillo embrujado","category":"Fantasía","description":"Nuevo escenario de Halloween. Próximamente disponible para crear retratos.","source":"concept","status":"coming-soon","previewOnly":true,"image":"./assets/halloween/reference/haunted-castle.webp","poses":["De pie"],"ages":"Retratos familiares"},{"id":"reference-portrait-hall","name":"Salón de retratos","category":"Clásicos","description":"Nuevo escenario de Halloween. Próximamente disponible para crear retratos.","source":"concept","status":"coming-soon","previewOnly":true,"image":"./assets/halloween/reference/portrait-hall.webp","poses":["De pie"],"ages":"Retratos familiares"}];
function renderCatalog(){
 scenes=[...referenceScenes,...scenes.filter(s=>!s.id.startsWith("reference-"))];
 $('home-scenes').innerHTML=scenes.slice(0,3).map(card).join('');
 $('collection-scenes').innerHTML=scenes.filter(s=>filter==='Todos'||s.category===filter).map(card).join('')||'<div class="notice">No hay escenarios en esta categoría.</div>';
 $('credits-list').innerHTML='<p>Fotografías de muestra autorizadas y decorados de la colección PICGIFT. Las imágenes ilustran el estilo; cada retrato personalizado puede variar.</p>';
 if(!selected&&scenes.length)selectScene("reference-pumpkin-forest",false);
 renderMobileScenes();updateStudio();
}
async function loadCatalog(){try{const r=await fetch('./scenes.json',{cache:'no-store'});if(!r.ok)throw new Error('catalog');const data=await r.json();scenes=data.scenes||staticScenes;}catch(e){scenes=staticScenes;toast('Catálogo de Halloween cargado sin conexión al servidor.')}renderCatalog()}
function renderMobileScenes(){
 const wrap=$('mobile-scenes');if(!wrap)return;
 const order=['reference-pumpkin-forest','reference-haunted-castle','reference-portrait-hall','reference-enchanted-city','halloween-pumpkin-bench','halloween-autumn-arch','halloween-lantern-street','halloween-potions'];
 const available=[...scenes].sort((a,b)=>(order.indexOf(a.id)===-1?99:order.indexOf(a.id))-(order.indexOf(b.id)===-1?99:order.indexOf(b.id)));
 wrap.innerHTML=available.map(s=>'<button type="button" class="mobile-scene-option'+(selected?.id===s.id?' is-selected':'')+'" data-select="'+escapeHTML(s.id)+'" aria-pressed="'+(selected?.id===s.id)+'" aria-label="Elegir '+escapeHTML(s.name)+'"><img loading="lazy" src="'+imageRef(s)+'" alt=""><span>'+escapeHTML(s.name)+'</span><span class="mobile-scene-check" aria-hidden="true">✓</span></button>').join('');
}
function updateStudio(){
 const login=$('studio-login'),generate=$('generate');if(!login||!generate)return;
 const hasPhoto=!!file,hasScene=!!selected&&selected.source==='picgift',hasConsent=$('photo-ai-consent').checked;
 document.body.classList.toggle('studio-has-photo',hasPhoto);
 const signedIn=!!user,ready=signedIn&&hasPhoto&&hasScene&&hasConsent&&window.picgiftAiReady===true&&!window.picgiftGenerating;
 $('mobile-signin').classList.toggle('hidden',signedIn);
 $('studio-account').textContent=signedIn?'Sesión activa: '+user.email:'Sin iniciar sesión';
 login.classList.add('hidden');
 generate.classList.remove('hidden');
 generate.disabled=!!window.picgiftGenerating;
 const needsPack=false;
 generate.replaceChildren(document.createTextNode(window.picgiftGenerating?'Preparando fotografía…':needsPack?'Elegir un pack':'Crear mi foto'));
 if(!window.picgiftGenerating){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');const use=document.createElementNS('http://www.w3.org/2000/svg','use');use.setAttribute('href','#i-arrow');svg.appendChild(use);svg.setAttribute('aria-hidden','true');generate.appendChild(svg);}
 $('studio-step-photo').classList.toggle('is-done',hasPhoto);
 $('studio-step-scene').classList.toggle('is-done',hasScene);
 $('studio-step-create').classList.toggle('is-done',ready);
 let hint=!hasPhoto?'Primero selecciona tu fotografía':!hasScene?'Elige un escenario disponible':!signedIn?'Inicia sesión para guardar tu retrato':!hasConsent?'Falta aceptar la autorización de uso':window.picgiftGenerating?'Preparando tu retrato…':!window.picgiftAiReady?'Generación todavía en preparación':'Todo listo para crear';
 if(needsPack)hint='Tu foto está preparada. Elige un pack para crear y guardar tu retrato.';
 $('studio-readiness').textContent=hint;
 $('studio-chosen').textContent=selected?'Escenario: '+selected.name+(hasScene?' · Decorado seleccionado':' · En preparación'):'Elige un escenario de Halloween.';
 const playable=window.picgiftAiReady===true;
 if(signedIn&&hasPhoto&&hasScene&&hasConsent&&!playable)$('studio-readiness').textContent='Estamos preparando la apertura del estudio.';
}
window.picgiftStudioUpdate=updateStudio;
function selectScene(id,goToCreate=true){
 const scene=scenes.find(x=>x.id===id);if(!scene)return;
 selected=scene;
 $('selected-scene-image').src=scene.image;
 $('selected-scene-title').textContent=scene.name;
 $('selected-theme').textContent=scene.category||'Halloween';
 $('selected-ages').textContent=scene.ages||'Todas las edades';
 $('selected-status').textContent=scene.source==='picgift'?'Decorado seleccionado':'Decorado de estilo';
 $('pose').replaceChildren(...(scene.poses||['Automática']).map(p=>new Option(p,p)));
 renderMobileScenes();updateStudio();
 if(goToCreate&&route!=='crear')navigate('crear');
}
function navigate(name,fromHistory=false){const allowed=['inicio','escenarios','precios','crear','mis-fotos','resultado','cuenta','creditos'];if(!allowed.includes(name))name='inicio';
if(['mis-fotos','cuenta'].includes(name)&&!user){pending=name;openAuth('login');return}
route=name;document.body.classList.toggle('mobile-creator-active',name==='crear');document.body.dataset.appPage=name;document.querySelectorAll('[data-page]').forEach(el=>el.hidden=(el.dataset.page!==name));document.querySelectorAll('[data-route]').forEach(el=>{if(el.classList.contains('nav-link')||el.closest('.mobile-nav')){el.classList.toggle('active',el.dataset.route===name);}});
if(!fromHistory && location.hash!=='#'+name)history.pushState({page:name},'','#'+name);window.scrollTo({top:0,behavior:'instant'});window.dispatchEvent(new CustomEvent('picgift:navigated',{detail:{name}}));if(name==='resultado'&&selected){$('result-name').textContent=selected.name}}
function openAuth(mode='login'){window.picgiftAuthReturnFocus=document.activeElement;window.picgiftAuthMode=mode;$('auth-title').textContent=mode==='register'?'Crear cuenta':'Iniciar sesión';$('terms').required=mode==='register';$('terms').closest('label').classList.toggle('hidden',mode!=='register');$('auth-submit').textContent=mode==='register'?'Crear mi cuenta':'Entrar en mi cuenta';$('auth-password').autocomplete=mode==='register'?'new-password':'current-password';$('auth').classList.add('show');$('auth-msg').textContent='Puedes acceder con correo o Google.';$('auth-email').focus()}
window.addEventListener('picgift:auth',e=>{const wasLoggedIn=!!user;user=e.detail.user||null;window.picgiftCurrentUser=user;if(wasLoggedIn&&!user)clearPhoto();$('signin').classList.toggle('hidden',!!user);$('signup').classList.toggle('hidden',!!user);$('profile-button').classList.toggle('hidden',!user);$('workspace').classList.remove('hidden');$('account-email').textContent=user?.email||'Sesión iniciada';$('account-avatar').textContent=(user?.email||'P')[0].toUpperCase();$('profile-button').textContent=(user?.email||'P')[0].toUpperCase();updateStudio();if(user){$('auth').classList.remove('show');if(pending){const dest=pending;pending=null;navigate(dest)}else if(!['crear','mis-fotos','resultado','cuenta'].includes(route))navigate(route,true)}else if(['mis-fotos','cuenta'].includes(route))navigate('inicio');});
function initSnow(){if(window.matchMedia('(prefers-reduced-motion:reduce)').matches)return;const n=window.innerWidth<700?27:53,container=$('snow');for(let i=0;i<n;i++){const flake=document.createElement('i');flake.className='flake';const x=((i*47.33)%101),size=1.1+((i*17)%28)/10;flake.style.left=x+'%';flake.style.width=flake.style.height=size+'px';flake.style.opacity=(.2+((i*13)%55)/100).toFixed(2);flake.style.animationDuration=(12+(i*7)%24)+'s';flake.style.animationDelay=(-((i*13)%29))+'s';container.appendChild(flake)}document.addEventListener('visibilitychange',()=>{container.style.animationPlayState=document.hidden?'paused':'running';container.querySelectorAll('.flake').forEach(el=>el.style.animationPlayState=document.hidden?'paused':'running')})}
function acceptFile(next){if(!next)return;if(!['image/png','image/jpeg','image/webp'].includes(next.type)){toast('Solo se admiten archivos JPG, PNG o WEBP.');return}if(next.size>15*1024*1024){toast('El archivo supera el máximo de 15 MB.');return}if(localURL)URL.revokeObjectURL(localURL);localURL=URL.createObjectURL(next);file=next;window.picgiftPhotoEditor?.open(next);$('chosen-photo').src=localURL;$('file-name').textContent=next.name+' · '+(next.size/1024/1024).toFixed(1)+' MB';$('upload-empty').classList.add('hidden');$('upload-loaded').classList.remove('hidden');updateStudio()}
function clearPhoto(){
 if(localURL)URL.revokeObjectURL(localURL);
 localURL=null;file=null;window.picgiftPhotoEditor?.clear();$('photo').value='';
 $('chosen-photo').removeAttribute('src');$('file-name').textContent='';
 $('upload-empty').classList.remove('hidden');$('upload-loaded').classList.add('hidden');
 $('result-empty').classList.remove('hidden');updateStudio();
}
function init(){
window.addEventListener('picgift:show-auth',()=>{if(!user&&!$('auth').classList.contains('show'))openAuth('login')});
document.addEventListener('click',e=>{if(e.target.closest('[data-open-auth]'))openAuth('login')});
$('signin').addEventListener('click',()=>openAuth('login'));$('signup').addEventListener('click',()=>openAuth('register'));$('close').addEventListener('click',()=>$('auth').classList.remove('show'));$('auth').addEventListener('click',e=>{if(e.target===$('auth'))$('auth').classList.remove('show')});document.addEventListener('keydown',e=>{if(e.key==='Escape')$('auth').classList.remove('show')});
document.addEventListener('click',e=>{const select=e.target.closest('[data-select]');if(select){selectScene(select.dataset.select);return}const routeButton=e.target.closest('[data-route]');if(routeButton){e.preventDefault();navigate(routeButton.dataset.route)}});
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.scene-card[data-select]')){e.preventDefault();selectScene(e.target.dataset.select)} });
$('filters').addEventListener('click',e=>{const el=e.target.closest('[data-filter]');if(!el)return;filter=el.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===el)));renderCatalog()});
$('choose-photo').addEventListener('click',()=>$('photo').click());$('change-photo').addEventListener('click',()=>$('photo').click());$('photo').addEventListener('change',e=>acceptFile(e.target.files[0]));$('remove-photo').addEventListener('click',clearPhoto);
$('studio-login').addEventListener('click',()=>openAuth('login'));
$('photo-ai-consent').addEventListener('change',updateStudio);
$('studio-advanced').open=!window.matchMedia('(max-width:960px)').matches;
window.addEventListener('pagehide',e=>{if(!e.persisted&&localURL)URL.revokeObjectURL(localURL)});
const dz=$('drop-zone');['dragenter','dragover'].forEach(x=>dz.addEventListener(x,e=>{e.preventDefault();dz.classList.add('dragging')}));['dragleave','drop'].forEach(x=>dz.addEventListener(x,e=>{e.preventDefault();dz.classList.remove('dragging')}));dz.addEventListener('drop',e=>acceptFile(e.dataTransfer.files[0]));
$('generate').addEventListener('click',async()=>{
 if(!file){$('photo').click();return}
 if(!selected||selected.source!=='picgift'){toast('Este nuevo escenario estará disponible próximamente. Puedes elegir uno de los cuatro decorados activos.');$('mobile-scenes').scrollIntoView({behavior:'smooth',block:'center'});return}
 if(!user){openAuth('login');return}
 if(!$('photo-ai-consent').checked){toast('Para continuar acepta la autorización de uso de la fotografía.');$('photo-ai-consent').scrollIntoView({behavior:'smooth',block:'center'});$('photo-ai-consent').focus();return}
 const service=await window.picgiftChooseService?.();if(!service)return;
 if(service==='premium'&&window.picgiftPilot!==true&&!(window.picgiftCreditsAvailable>0)){navigate('precios');return;}
 try {if(window.picgiftGenerating)return;window.picgiftGenerating=true;updateStudio();const prepared=await window.picgiftPhotoEditor.exportFile();window.picgiftGenerating=false;window.dispatchEvent(new CustomEvent('picgift:generate',{detail:{service,file:prepared,references:window.picgiftPhotoEditor.references(),scene_id:selected.id,format:['vertical','horizontal'][$('format').selectedIndex]||'vertical',pose:$('pose').value,outfit:$('outfit').value,consent:true,email_requested:$('photo-email-delivery').checked}}));}catch(e){window.picgiftGenerating=false;updateStudio();toast(e.message||'No se pudo preparar el encuadre.')}
});
// Premium controls are hidden during the private AI test; no payments are offered.
window.addEventListener('picgift:route',e=>navigate(e.detail.name));
window.addEventListener('hashchange',()=>navigate(location.hash.slice(1)||'inicio',true));
window.addEventListener('popstate',()=>navigate(location.hash.slice(1)||'inicio',true));
$('workspace').classList.remove('hidden');
updateStudio();loadCatalog();
 const mobileEntry=window.matchMedia('(max-width:820px)').matches;
 const requested=location.hash.slice(1)||'crear';
 const authReturn=/access_token=|error_description=|type=recovery/.test(location.hash)||new URLSearchParams(location.search).has('code');
 const opening=authReturn||(mobileEntry&&requested==='inicio')?'crear':requested;
 if(mobileEntry&&requested==='inicio')history.replaceState({page:'crear'},'','#crear');
 navigate(opening,true);
 const splash=$('splash');if(splash){let seen=false;try{seen=sessionStorage.getItem('picgift_intro_2026')==='seen';sessionStorage.setItem('picgift_intro_2026','seen')}catch(e){}
   window.setTimeout(()=>splash.classList.add('dismissed'),seen||window.matchMedia('(prefers-reduced-motion:reduce)').matches?0:1050);
   window.setTimeout(()=>{if(splash.parentNode)splash.remove()},seen?200:1800);
 }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
