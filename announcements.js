import {createClient} from './vendor/supabase.js';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './config.js';
const client=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
 auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}
});
const top=document.querySelector('.top-actions');
if(top){
 const english=()=>document.documentElement.lang.startsWith('en');
 const t=(es,en)=>english()?en:es;
 const button=document.createElement('button');
 button.type='button';button.className='picgift-news-button pill hidden';
 button.setAttribute('aria-label',t('Novedades y avisos de PICGIFT','PICGIFT news and updates'));
 button.setAttribute('aria-expanded','false');button.textContent=t('Novedades','News');
 const counter=document.createElement('span');counter.className='picgift-news-count';counter.hidden=true;
 const buttonText=document.createTextNode(t('Novedades','News'));
 button.replaceChildren(buttonText,counter);button.setAttribute('data-no-translate','');top.append(button);
 const panel=document.createElement('section');panel.className='picgift-news-panel';panel.hidden=true;
 panel.setAttribute('data-no-translate','');
 panel.setAttribute('aria-label',t('Novedades de PICGIFT','PICGIFT news'));panel.setAttribute('role','region');
 const header=document.createElement('div');header.className='picgift-news-heading';
 const heading=document.createElement('strong');heading.textContent=t('Novedades de PICGIFT','PICGIFT news');
 const close=document.createElement('button');close.type='button';close.textContent='×';
 close.setAttribute('aria-label',t('Cerrar notificaciones','Close notifications'));close.className='picgift-news-close';
 header.append(heading,close);
 const list=document.createElement('div');list.className='picgift-news-list';
 panel.append(header,list);document.body.append(panel);
 let currentId=null,records=[],lastCheck=0,generation=0,inFlight=null,failed=false,focusBefore=null;
 const seenKey=id=>'picgift-news-seen:'+id;
 const stored=id=>{try{return localStorage.getItem(seenKey(id))}catch{return null}};
 function markRead(){
  if(!currentId||!records.length)return;
  try{localStorage.setItem(seenKey(currentId),new Date(records[0].published_at).toISOString())}catch{}
  counter.hidden=true;counter.textContent='';counter.removeAttribute('aria-label');
 }
 function closePanel(){panel.hidden=true;button.setAttribute('aria-expanded','false');focusBefore?.focus?.();focusBefore=null;}
 function clear(){currentId=null;records=[];lastCheck=0;failed=false;button.classList.add('hidden');counter.hidden=true;list.replaceChildren();closePanel();}
 function render(){
  list.replaceChildren();
  if(failed){
   const warning=document.createElement('p');warning.setAttribute('role','status');
   warning.textContent=t('No se pudieron actualizar las novedades. Puedes reintentarlo.','Unable to refresh news. You can try again.');
   const retry=document.createElement('button');retry.type='button';retry.className='btn outline';
   retry.textContent=t('Reintentar','Try again');
   retry.addEventListener('click',async()=>{
    if(retry.disabled)return;
    retry.disabled=true;
    try{await update(true)}finally{if(retry.isConnected)retry.disabled=false;}
   });
   list.append(warning,retry);
  }
  if(!records.length){
   if(failed)return;
   const empty=document.createElement('p');
   empty.textContent=t('Todavía no hay novedades. Las publicaciones aprobadas aparecerán aquí.','No news yet. Approved updates will appear here.');
   list.append(empty);return;
  }
  for(const item of records){
   const article=document.createElement('article');article.className='picgift-news-item';
   const title=document.createElement('strong');title.textContent=item.title||'PICGIFT';
   const message=document.createElement('p');message.textContent=item.body||'';
   const stamp=document.createElement('small');stamp.textContent=new Date(item.published_at).toLocaleString(english()?'en':'es-ES');
   const open=document.createElement('button');open.type='button';open.className='picgift-news-open';
   open.textContent=t('Ver en PICGIFT ↗','Open in PICGIFT ↗');
   open.addEventListener('click',()=>{
    const route=item.route==='inspiracion'?'escenarios':item.route;
    if(['escenarios','crear','precios','cuenta'].includes(route))window.location.hash='#'+route;
    closePanel();
   });
   article.append(title,message,stamp,open);list.append(article);
  }
 }
 async function load(version,force=false){
  const {data,error:sessionError}=await client.auth.getSession();
  if(version!==generation)return;
  const id=data?.session?.user?.id;
  if(sessionError||!id){clear();return;}
  if(id!==currentId){clear();currentId=id;}
  button.classList.remove('hidden');
  if(!force&&Date.now()-lastCheck<45000)return;
  lastCheck=Date.now();
  const {data:items,error}=await client.from('picgift_announcements')
   .select('id,title,body,route,published_at').order('published_at',{ascending:false}).limit(30);
  if(version!==generation||id!==currentId)return;
  failed=!!error;
  if(error){render();return;}
  records=items||[];render();
  const since=stored(id);
  const unseen=records.filter(item=>!since||new Date(item.published_at)>new Date(since)).length;
  counter.hidden=unseen===0;counter.textContent=unseen>9?'9+':String(unseen);
  if(unseen)counter.setAttribute('aria-label',unseen+t(' avisos nuevos',' new updates'));else counter.removeAttribute('aria-label');
  if(!panel.hidden)markRead();
 }
 function localize(){
  buttonText.textContent=t('Novedades','News');
  button.setAttribute('aria-label',t('Novedades y avisos de PICGIFT','PICGIFT news and updates'));
  panel.setAttribute('aria-label',t('Novedades de PICGIFT','PICGIFT news'));
  heading.textContent=t('Novedades de PICGIFT','PICGIFT news');
  close.setAttribute('aria-label',t('Cerrar notificaciones','Close notifications'));
  if(!counter.hidden)counter.setAttribute('aria-label',counter.textContent+t(' avisos nuevos',' new updates'));
  render();
 }
 new MutationObserver(localize).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
 function update(force=false){
  if(document.hidden||navigator.onLine===false)return Promise.resolve();
  if(inFlight?.version===generation)return inFlight.promise;
  const ticket={version:generation,promise:null};inFlight=ticket;
  ticket.promise=load(ticket.version,force).catch(()=>{if(ticket.version===generation){failed=true;render();}})
   .finally(()=>{if(inFlight===ticket)inFlight=null;});
  return ticket.promise;
 }
 async function show(){
  await update(failed);
  if(!currentId){window.picgiftOpenAuth?.();return;}
  focusBefore=document.activeElement;panel.hidden=false;button.setAttribute('aria-expanded','true');render();markRead();close.focus();
 }
 button.addEventListener('click',()=>{if(panel.hidden)void show();else closePanel();});
 window.addEventListener('picgift:open-news',()=>setTimeout(()=>void show(),0));
 close.addEventListener('click',closePanel);
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden)closePanel();});
 document.addEventListener('click',event=>{
  if(!panel.hidden&&!panel.contains(event.target)&&!button.contains(event.target))closePanel();
 });
 window.addEventListener('focus',()=>void update());window.addEventListener('online',()=>void update());
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void update();});
 client.auth.onAuthStateChange((_event,session)=>{
  if(session?.user?.id===currentId)return;
  generation++;clear();
  // Auth callbacks must finish before making further auth calls.
  setTimeout(()=>void update(),0);
 });
 setInterval(()=>void update(),120000);
 void update();
}
