(()=>{'use strict';
const $=id=>document.getElementById(id);
let scenes=[],selected=null,user=null,route='inicio',pending=null,file=null,localURL=null,filter='Todos';
const staticScenes=[
{id:'rustic-sleigh',name:'Trineo rústico',description:'Una Navidad de madera y luces cálidas',image:'https://images.unsplash.com/photo-1763351866520-a9e3d5489eb6?auto=format&fit=crop&q=82&w=1280',ages:'1–4 años',category:'Clásicos',badge:'Colección especial',poses:['Sentado en trineo','Sentado delante','De pie al lado'],credit:{author:'Fujiphilm',url:'https://unsplash.com/photos/christmas-tree-with-red-and-gold-ornaments-and-gifts-cxvfPfbu2vE'}},
{id:'snow-forest',name:'Bosque nevado',description:'Paisajes blancos de cuento',image:'https://images.unsplash.com/photo-1767813364465-5d45663021ab?auto=format&fit=crop&q=82&w=1280',ages:'1–10 años',category:'Invierno',badge:'Más mágico',poses:['Sentado','De pie'],credit:{author:'Tolga Ahmetler',url:'https://unsplash.com/photos/snow-covered-evergreen-trees-in-a-forest-dl3EytOQgxU'}}
];
function icon(id){return '<svg><use href="#i-'+id+'"></use></svg>'}
function toast(message){const e=$('toast');e.textContent=message;e.classList.add('on');clearTimeout(toast.timer);toast.timer=setTimeout(()=>e.classList.remove('on'),4200)}
function escapeHTML(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function imageRef(s){return escapeHTML(s.image||'')}
function card(s){return '<article class="scene-card"><div class="scene-pic"><img src="'+imageRef(s)+'" loading="lazy" alt="Imagen provisional de inspiración: '+escapeHTML(s.name)+'" onerror="this.style.opacity=.1"><span class="scene-label">'+escapeHTML(s.badge||'Navidad 2026')+'</span></div><div class="scene-body"><h3>'+escapeHTML(s.name)+'</h3><p>'+escapeHTML(s.description)+'</p><div class="scene-bottom"><span>'+(s.source==='picgift'?'Fondo PICGIFT':'Concepto provisional')+'</span><button class="round-arrow" type="button" aria-label="Elegir '+escapeHTML(s.name)+'" data-select="'+escapeHTML(s.id)+'">→</button></div></div></article>'}
function renderCatalog(){const featured=scenes.filter(s=>['golden-christmas','reading-corner','santa-workshop'].includes(s.id));$('home-scenes').innerHTML=(featured.length?featured:scenes.slice(0,3)).map(card).join('');$('collection-scenes').innerHTML=scenes.filter(s=>filter==='Todos'||s.category===filter).map(card).join('')||'<div class="notice">No hay escenarios en esta categoría.</div>';
const credits=$('credits-list');credits.innerHTML=scenes.map(s=>{
const own=s.source==='picgift';
return '<div style="font-size:12px;color:#c5d3c5">'+escapeHTML(s.name)+': '+(own?'Fotografía del archivo PICGIFT (uso comercial por confirmar)':'<a style="color:#e8c994;text-decoration:underline" href="'+escapeHTML(s.credit?.url||'#')+'" target="_blank" rel="noopener noreferrer">'+escapeHTML(s.credit?.author||'Autor')+' · Unsplash</a>')+'</div>';
}).join('')+'<div style="font-size:12px;color:#c5d3c5">Los retratos con niños no se han importado a esta web. Los fondos de PICGIFT son archivos de muestra comprimidos, no originales 4K.</div>';
if(!selected&&scenes.length)selectScene(scenes[0].id,false);}
async function loadCatalog(){try{const r=await fetch('./scenes.json',{cache:'no-store'});if(!r.ok)throw new Error('catalog');const data=await r.json();scenes=data.scenes||staticScenes;}catch(e){scenes=staticScenes;toast('Catálogo provisional cargado sin conexión al servidor.')}renderCatalog()}
function selectScene(id,goToCreate=true){const s=scenes.find(x=>x.id===id);if(!s)return;selected=s;$('selected-scene-image').src=s.image;$('selected-scene-title').textContent=s.name;$('selected-theme').textContent=s.category||'Navidad 2026';$('selected-ages').textContent=s.ages||'Todos';$('selected-status').textContent='Elegido';$('selection').textContent='Escenario: '+s.name+'. Selecciona una fotografía para visualizar el proceso.';$('pose').replaceChildren(...(s.poses||['Automática']).map(p=>new Option(p,p)));if(goToCreate)navigate('crear');}
function navigate(name,fromHistory=false){const allowed=['inicio','escenarios','precios','crear','mis-fotos','resultado','cuenta','creditos'];if(!allowed.includes(name))name='inicio';
if(['mis-fotos','cuenta'].includes(name)&&!user){pending=name;openAuth('register');return}
route=name;document.querySelectorAll('[data-page]').forEach(el=>el.hidden=(el.dataset.page!==name));document.querySelectorAll('[data-route]').forEach(el=>{if(el.classList.contains('nav-link')||el.closest('.mobile-nav')){el.classList.toggle('active',el.dataset.route===name);}});
if(!fromHistory && location.hash!=='#'+name)history.pushState({page:name},'','#'+name);window.scrollTo({top:0,behavior:'instant'});if(name==='resultado'&&selected){$('result-sample').src=selected.image;$('result-name').textContent=selected.name}}
function openAuth(mode='login'){window.picgiftAuthMode=mode;$('auth-title').textContent=mode==='register'?'Crear cuenta':'Iniciar sesión';$('terms').required=mode==='register';$('terms').closest('label').classList.toggle('hidden',mode!=='register');$('auth-submit').textContent=mode==='register'?'Crear mi cuenta':'Entrar en mi cuenta';$('auth-password').autocomplete=mode==='register'?'new-password':'current-password';$('auth').classList.add('show');$('auth-msg').textContent='Puedes acceder con correo o Google.';$('auth-email').focus()}
window.addEventListener('picgift:auth',e=>{const wasLoggedIn=!!user;user=e.detail.user||null;if(wasLoggedIn&&!user)clearPhoto();$('signin').classList.toggle('hidden',!!user);$('signup').classList.toggle('hidden',!!user);$('profile-button').classList.toggle('hidden',!user);$('workspace').classList.remove('hidden');$('account-email').textContent=user?.email||'Sesión iniciada';$('account-avatar').textContent=(user?.email||'P')[0].toUpperCase();$('profile-button').textContent=(user?.email||'P')[0].toUpperCase();if(user){$('auth').classList.remove('show');if(pending){const dest=pending;pending=null;navigate(dest)}else if(!['crear','mis-fotos','resultado','cuenta'].includes(route))navigate(route,true)}else if(['mis-fotos','cuenta'].includes(route))navigate('inicio');});
function initSnow(){if(window.matchMedia('(prefers-reduced-motion:reduce)').matches)return;const n=window.innerWidth<700?27:53,container=$('snow');for(let i=0;i<n;i++){const flake=document.createElement('i');flake.className='flake';const x=((i*47.33)%101),size=1.1+((i*17)%28)/10;flake.style.left=x+'%';flake.style.width=flake.style.height=size+'px';flake.style.opacity=(.2+((i*13)%55)/100).toFixed(2);flake.style.animationDuration=(12+(i*7)%24)+'s';flake.style.animationDelay=(-((i*13)%29))+'s';container.appendChild(flake)}document.addEventListener('visibilitychange',()=>{container.style.animationPlayState=document.hidden?'paused':'running';container.querySelectorAll('.flake').forEach(el=>el.style.animationPlayState=document.hidden?'paused':'running')})}
function acceptFile(next){if(!next)return;if(!['image/png','image/jpeg','image/webp'].includes(next.type)){toast('Solo se admiten archivos JPG, PNG o WEBP.');return}if(next.size>15*1024*1024){toast('El archivo supera el máximo de 15 MB.');return}if(localURL)URL.revokeObjectURL(localURL);localURL=URL.createObjectURL(next);file=next;$('chosen-photo').src=localURL;$('file-name').textContent=next.name+' · '+(next.size/1024/1024).toFixed(1)+' MB';$('upload-empty').classList.add('hidden');$('upload-loaded').classList.remove('hidden')}
function clearPhoto(){
 if(localURL)URL.revokeObjectURL(localURL);
 localURL=null;file=null;$('photo').value='';
 $('chosen-photo').removeAttribute('src');$('file-name').textContent='';
 $('upload-empty').classList.remove('hidden');$('upload-loaded').classList.add('hidden');
 $('demo-client-image').removeAttribute('src');
 $('demo-client-image').classList.add('hidden');
 $('demo-client-empty').classList.remove('hidden');
 $('demo-result').classList.add('hidden');
 $('result-empty').classList.remove('hidden');
}
function init(){
$('signin').addEventListener('click',()=>openAuth('login'));$('signup').addEventListener('click',()=>openAuth('register'));$('close').addEventListener('click',()=>$('auth').classList.remove('show'));$('auth').addEventListener('click',e=>{if(e.target===$('auth'))$('auth').classList.remove('show')});document.addEventListener('keydown',e=>{if(e.key==='Escape')$('auth').classList.remove('show')});
document.addEventListener('click',e=>{const select=e.target.closest('[data-select]');if(select){selectScene(select.dataset.select);return}const routeButton=e.target.closest('[data-route]');if(routeButton){e.preventDefault();navigate(routeButton.dataset.route)}});
$('filters').addEventListener('click',e=>{const el=e.target.closest('[data-filter]');if(!el)return;filter=el.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===el)));renderCatalog()});
$('choose-photo').addEventListener('click',()=>$('photo').click());$('change-photo').addEventListener('click',()=>$('photo').click());$('photo').addEventListener('change',e=>acceptFile(e.target.files[0]));$('remove-photo').addEventListener('click',clearPhoto);
window.addEventListener('pagehide',()=>{if(localURL)URL.revokeObjectURL(localURL)});
const dz=$('drop-zone');['dragenter','dragover'].forEach(x=>dz.addEventListener(x,e=>{e.preventDefault();dz.classList.add('dragging')}));['dragleave','drop'].forEach(x=>dz.addEventListener(x,e=>{e.preventDefault();dz.classList.remove('dragging')}));dz.addEventListener('drop',e=>acceptFile(e.dataTransfer.files[0]));
$('demo-preview').addEventListener('click',()=>{
  if(!selected){toast('Escoge un escenario primero.');return}
  if(!file){toast('Añade una fotografía para ver tus dos referencias.');return}
  $('demo-scene-image').src=selected.image;
  $('demo-scene-name').textContent=selected.name;
  $('demo-client-image').classList.toggle('hidden',!localURL);
  $('demo-client-empty').classList.toggle('hidden',!!localURL);
  if(localURL)$('demo-client-image').src=localURL;
  $('demo-result').classList.remove('hidden');
  $('real-result').classList.add('hidden');
  $('result-empty').classList.add('hidden');
  $('result-page-title').textContent='Tu demostración';
  $('result-page-description').textContent='Descubre cómo trabajará PICGIFT con tu fotografía y el escenario. Sin generación de IA ni subida a servidores.';
  navigate('resultado');
  toast('Demostración local abierta. Tu fotografía permanece en tu dispositivo.');
});
$('generate').addEventListener('click',()=>{if(!selected){toast('Elige un escenario para continuar.');return}if(!file){toast('Primero selecciona una fotografía.');return}if(!$('photo-ai-consent').checked){toast('Debes autorizar expresamente el procesamiento de esta fotografía.');return}window.dispatchEvent(new CustomEvent('picgift:generate',{detail:{file,scene_id:selected.id,format:['vertical','horizontal','square'][$('format').selectedIndex]||'vertical',pose:$('pose').value,outfit:$('outfit').value,consent:true,email_requested:$('photo-email-delivery').checked}}))});
// Premium controls are hidden during the private AI test; no payments are offered.
window.addEventListener('picgift:route',e=>navigate(e.detail.name));
window.addEventListener('hashchange',()=>navigate(location.hash.slice(1)||'inicio',true));
window.addEventListener('popstate',()=>navigate(location.hash.slice(1)||'inicio',true));
$('workspace').classList.remove('hidden');
initSnow();loadCatalog();navigate(location.hash.slice(1)||'inicio',true);
 const splash=$('splash');if(splash){let seen=false;try{seen=sessionStorage.getItem('picgift_intro_2026')==='seen';sessionStorage.setItem('picgift_intro_2026','seen')}catch(e){}
   window.setTimeout(()=>splash.classList.add('dismissed'),seen||window.matchMedia('(prefers-reduced-motion:reduce)').matches?0:1050);
   window.setTimeout(()=>{if(splash.parentNode)splash.remove()},seen?200:1800);
 }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();