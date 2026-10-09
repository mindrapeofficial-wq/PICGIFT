import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const $=id=>document.getElementById(id);
const client=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
 auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
});
const status=(message,error=false)=>{
 const el=$('ai-director-status');if(!el)return;
 el.textContent=message;el.classList.toggle('error',error);
};
const typeName={scene:'Fondo Premium',category:'Categoría',notification:'Notificación',promotion:'Campaña promocional'};
const stateName={pending:'Pendiente de aprobar',approved:'Aprobado',rejected:'Rechazado',failed:'Error de publicación',processing:'Publicando'};
async function api(body){
 const {data,error}=await client.functions.invoke('picgift-ai-director',{body});
 if(error){let code='No se pudo contactar con el servicio de IA.';
  try{code=(await error.context.json())?.error||code}catch{}
  throw Error(code);
 }
 if(data?.error)throw Error(data.error);
 return data;
}
function info(label,value){
 const p=document.createElement('p');p.className='meta';
 const b=document.createElement('strong');b.textContent=label+': ';
 p.append(b,document.createTextNode(value||'—'));return p;
}
function makeButton(name,onClick,primary=false){
 const button=document.createElement('button');button.type='button';
 button.className='button'+(primary?' primary':'');button.textContent=name;
 button.addEventListener('click',onClick);return button;
}
function renderProposal(item){
 const row=document.createElement('article');row.className='user-item';
 row.style.display='flex';row.style.flexDirection='column';row.style.alignItems='stretch';
 row.style.gap='10px';row.style.marginBottom='12px';row.style.padding='18px';
 const kicker=document.createElement('span');kicker.className='eyebrow';
 kicker.textContent=(typeName[item.kind]||item.kind)+' · '+(stateName[item.status]||item.status);
 const heading=document.createElement('strong');heading.style.fontSize='1.15rem';heading.textContent=item.title;
 row.append(kicker,heading);
 if(item.preview_url){
  const img=document.createElement('img');img.src=item.preview_url;img.alt='Vista previa privada del fondo '+item.title;
  img.loading='lazy';img.style.cssText='display:block;width:min(100%,420px);max-height:420px;object-fit:contain;object-position:center;border-radius:14px;background:#160e12;';
  row.append(img);
 }
 if(item.description)row.append(info('Descripción',item.description));
 if(item.review_summary)row.append(info('Análisis creativo de la IA gratuita',item.review_summary));
 if(item.category)row.append(info('Categoría',item.category));
 if(item.message)row.append(info('Mensaje propuesto',item.message));
 if(item.error_message)row.append(info('Incidencia',item.error_message));
 row.append(info('Creado',new Date(item.created_at).toLocaleString('es-ES')));
 if(item.kind==='scene'){
  const note=document.createElement('small');note.textContent='El fondo se publica en Inspiración. Su activación para retratos reales necesita una prueba de calidad y compatibilidad de la receta.';
  row.append(note);
 }
 if(item.status==='pending'){
  const label=document.createElement('label');label.textContent='Título revisable';
  const title=document.createElement('input');title.value=item.title;title.maxLength=80;title.required=true;
  label.append(title);row.append(label);
  let textInput=null,categoryInput=null;
  if(['notification','promotion'].includes(item.kind)){
   const field=document.createElement('label');field.textContent='Mensaje revisable';
   textInput=document.createElement('textarea');textInput.rows=3;textInput.maxLength=300;
   textInput.value=item.message||'';field.append(textInput);row.append(field);
  }
  if(item.kind==='scene'){
   const field=document.createElement('label');field.textContent='Categoría';
   categoryInput=document.createElement('input');categoryInput.maxLength=50;categoryInput.value=item.category||'Fantasía';
   field.append(categoryInput);row.append(field);
  }
  const actions=document.createElement('div');actions.style.cssText='display:flex;gap:10px;flex-wrap:wrap';
  async function decide(decision){
   const headingValue=title.value.trim(),messageValue=textInput?.value.trim(),categoryValue=categoryInput?.value.trim();
   if(!headingValue||(textInput&&!messageValue)||(categoryInput&&!categoryValue)){
    status('Completa los campos antes de aprobar.',true);return;
   }
   const result=decision==='approve'?'aprobar':'rechazar';
   if(!confirm('¿Quieres '+result+' esta propuesta?'+(decision==='approve'?' Podría publicarse y notificar a los usuarios registrados.':'')))return;
   for(const control of actions.querySelectorAll('button'))control.disabled=true;
   status('Registrando '+result+'…');
   try{
    await api({action:'review',id:item.id,decision,title:headingValue,...(textInput?{message:messageValue}:{}),
     ...(categoryInput?{category:categoryValue}:{})});
    status('Decisión guardada. La publicación y los avisos se registran en el historial.');
    await refresh();
   }catch(e){status('No se pudo '+result+': '+(e.message==='approve_scene_first'?'Primero aprueba el escenario de este día. La publicidad solo puede anunciar una imagen publicada.':e.message),true);for(const control of actions.querySelectorAll('button'))control.disabled=false}
  }
  actions.append(makeButton('Aprobar y publicar',()=>decide('approve'),true),
   makeButton('Rechazar',()=>decide('reject')));
  row.append(actions);
 }
 return row;
}
let refreshing=false;
async function refresh(){
 if(refreshing)return;
 refreshing=true;
 try{
  const data=await api({action:'dashboard'});
  $('ai-director-count').textContent=data.pending?'('+data.pending+' pendientes)':'(sin pendientes)';
  const providers=data.providers||{};
  const health=$('ai-director-providers');
  if(health)health.textContent='IA Premium: '+(providers.premium_configured?'configurada':'sin configurar')+' · IA gratuita: '+(providers.free_configured?'configurada':'sin configurar')+'. La prueba de conexión se realiza por separado.';
  const list=$('ai-director-list');list.replaceChildren();
  if(!data.proposals?.length)list.textContent='Aún no hay propuestas generadas. La planificación diaria está programada en el servidor.';
  for(const item of data.proposals||[])list.append(renderProposal(item));
  const outbox=$('ai-director-outbox');outbox.replaceChildren();
  for(const item of data.outbox||[]){
   const wrap=document.createElement('div');wrap.className='user-item';
   const title=document.createElement('strong');title.textContent=item.title;
   const line=document.createElement('span');line.className='meta';
   line.textContent=item.target==='admin'?'Administrador · ':'Usuarios · ';
   line.textContent+=item.state+' · '+item.delivered_count+'/'+item.recipient_count+' aceptadas por Firebase';
   if(item.last_error)line.textContent+=' · '+item.last_error;
   wrap.append(title,line);outbox.append(wrap);
  }
  if(!data.outbox?.length)outbox.textContent='Todavía no hay envíos.';
  status('Propuestas cargadas. Las decisiones requieren autorización de administrador.');
 }catch(e){status('No se pudo cargar la bandeja: '+e.message,true)}
 finally{refreshing=false}
}
$('ai-director-refresh')?.addEventListener('click',()=>void refresh());
$('ai-director-check')?.addEventListener('click',async()=>{
 const button=$('ai-director-check');button.disabled=true;status('Comprobando ambas IA sin generar imágenes ni consumir créditos de los usuarios…');
 try{const data=await api({action:'check_providers'});
  status(data.free==='ready'&&data.premium==='ready'?'Conexión verificada: IA gratuita y Premium responden correctamente.':'No se pudieron verificar ambos servicios.',data.free!=='ready'||data.premium!=='ready');
 }catch(e){status('No se pudo verificar la conexión: '+e.message,true)}
 finally{button.disabled=false}
});
$('ai-director-dispatch')?.addEventListener('click',async()=>{
 if(!confirm('¿Reintentar notificaciones fallidas? No se generará contenido nuevo.'))return;
 try{status('Revisando la cola…');const res=await api({action:'dispatch',retry_failed:true});
  status('Envíos procesados: '+(res.dispatch?.length||0));await refresh();
 }catch(e){status(e.message,true)}
});
async function activate(){
 if(!$('dashboard')||$('dashboard').hidden)return;
 const {data:{session}}=await client.auth.getSession();
 if(!session?.user)return;
 await refresh();
}
const observer=new MutationObserver(()=>{
 if(!$('dashboard').hidden){observer.disconnect();void activate();}
});
if($('dashboard'))observer.observe($('dashboard'),{attributes:true,attributeFilter:['hidden']});
if($('dashboard')&&!$('dashboard').hidden)void activate();
document.addEventListener('visibilitychange',()=>{
 if(!document.hidden&&!$('dashboard')?.hidden)void refresh();
});