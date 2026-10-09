import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './config.js';

const client=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
 auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
});
const top=document.querySelector('.top-actions');
if(top){
 const button=document.createElement('button');
 button.type='button';button.className='picgift-news-button pill hidden';
 button.setAttribute('aria-label','Novedades y avisos de PICGIFT');
 button.setAttribute('aria-expanded','false');
 button.textContent='Novedades';
 const counter=document.createElement('span');counter.className='picgift-news-count';counter.hidden=true;
 button.append(counter);top.append(button);
 const panel=document.createElement('section');panel.className='picgift-news-panel';panel.hidden=true;
 panel.setAttribute('aria-label','Novedades de PICGIFT');panel.setAttribute('role','region');
 const header=document.createElement('div');header.className='picgift-news-heading';
 const heading=document.createElement('strong');heading.textContent='Novedades de PICGIFT';
 const close=document.createElement('button');close.type='button';close.textContent='×';
 close.setAttribute('aria-label','Cerrar notificaciones');close.className='picgift-news-close';
 header.append(heading,close);
 const list=document.createElement('div');list.className='picgift-news-list';
 panel.append(header,list);document.body.append(panel);
 let currentId=null,records=[],lastCheck=0;
 const seenKey=id=>'picgift-news-seen:'+id;
 function markRead(){
  if(!currentId||!records.length)return;
  const latest=new Date(records[0].published_at).toISOString();
  localStorage.setItem(seenKey(currentId),latest);
  counter.hidden=true;counter.textContent='';counter.removeAttribute('aria-label');
 }
 function closePanel(){
  panel.hidden=true;button.setAttribute('aria-expanded','false');
 }
 function render(){
  list.replaceChildren();
  if(!records.length){
   const empty=document.createElement('p');empty.textContent='Todavía no hay novedades. Las publicaciones aprobadas aparecerán aquí.';
   list.append(empty);return;
  }
  for(const item of records){
   const article=document.createElement('article');article.className='picgift-news-item';
   const title=document.createElement('strong');title.textContent=item.title||'PICGIFT';
   const message=document.createElement('p');message.textContent=item.body||'';
   const stamp=document.createElement('small');stamp.textContent=new Date(item.published_at).toLocaleString('es-ES');
   const open=document.createElement('button');open.type='button';open.className='picgift-news-open';
   open.textContent='Ver en PICGIFT ↗';
   open.addEventListener('click',()=>{
    const route=item.route==='inspiracion'?'escenarios':item.route;
    if(['escenarios','crear','precios','cuenta'].includes(route))window.location.hash='#'+route;
    closePanel();
   });
   article.append(title,message,stamp,open);list.append(article);
  }
 }
 async function update(force=false){
  const {data:{session}}=await client.auth.getSession();
  if(!session?.user){
   currentId=null;records=[];button.classList.add('hidden');closePanel();return;
  }
  const id=session.user.id;
  button.classList.remove('hidden');
  if(!force&&id===currentId&&Date.now()-lastCheck<45000)return;
  currentId=id;lastCheck=Date.now();
  const {data,error}=await client.from('picgift_announcements')
   .select('id,title,body,route,published_at').order('published_at',{ascending:false}).limit(30);
  if(error)return;
  records=data||[];
  render();
  const since=localStorage.getItem(seenKey(id));
  const unseen=records.filter(item=>!since||new Date(item.published_at)>new Date(since)).length;
  counter.hidden=unseen===0;counter.textContent=unseen>9?'9+':String(unseen);
  if(unseen)counter.setAttribute('aria-label',unseen+' avisos nuevos');
  if(!panel.hidden)markRead();
 }
 button.addEventListener('click',()=>{
  panel.hidden=!panel.hidden;
  button.setAttribute('aria-expanded',String(!panel.hidden));
  if(!panel.hidden){render();markRead();}
 });
 close.addEventListener('click',closePanel);
 document.addEventListener('click',e=>{
  if(!panel.hidden&&!panel.contains(e.target)&&!button.contains(e.target))closePanel();
 });
 window.addEventListener('focus',()=>void update(true));
 document.addEventListener('visibilitychange',()=>{
  if(!document.hidden)void update(true);
 });
 client.auth.onAuthStateChange(()=>queueMicrotask(()=>void update(true)));
 setInterval(()=>{if(!document.hidden)void update(true)},120000);
 void update(true);
}