import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './config.js';
const client=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=id=>document.getElementById(id);
const message=(text)=>{$('flux-review-status').textContent=text};
async function call(body){
 const {data,error}=await client.functions.invoke('picgift-flux-personal',{body});
 if(error){let text='Error de conexión con la revisión.';try{text=(await error.context.json())?.error||text}catch{}throw Error(text)}
 return data;
}
function element(tag,cls,text){
 const e=document.createElement(tag);if(cls)e.className=cls;if(text)e.textContent=text;return e;
}
async function refresh(){
 if($('dashboard').hidden)return;
 message('Comprobando resultados privados pendientes…');
 try{
  const data=await call({action:'list_reviews'});
  if(!Array.isArray(data?.jobs))throw Error('Respuesta inesperada.');
  const area=$('flux-review-list');area.replaceChildren();
  if(!data.jobs.length){area.append(element('p','muted','No hay retratos esperando revisión.'));message('Sin pendientes.');return}
  for(const job of data.jobs){
   const item=element('article','user-item');item.style.display='block';
   const title=element('strong','',job.scene_id+' · '+new Date(job.created_at).toLocaleString('es-ES'));
   const info=element('div','user-info');
   info.append(title,element('span','meta','Trabajo '+job.id+' · No disponible para descarga'));
   const preview=element('button','button','Ver imagen para revisión');preview.type='button';
   const approve=element('button','button primary','Aprobar y permitir descarga');approve.type='button';approve.disabled=true;
   const reject=element('button','button','Rechazar resultado');reject.type='button';reject.disabled=true;
   const buttons=element('div');buttons.style.display='flex';buttons.style.flexWrap='wrap';buttons.style.gap='10px';buttons.style.marginTop='14px';
   buttons.append(preview,approve,reject);
   const picture=element('img');picture.alt='Resultado privado en revisión';picture.loading='lazy';
   picture.style.cssText='display:none;max-height:560px;max-width:100%;width:auto;height:auto;object-fit:contain;border-radius:12px;margin-top:16px';
   preview.addEventListener('click',async()=>{
    preview.disabled=true;
    try{
     const response=await call({action:'review',job_id:job.id,decision:'preview'});
     if(!response?.url)throw Error('Sin imagen');
     picture.src=response.url;picture.style.display='block';
     approve.disabled=false;reject.disabled=false;
     message('Revisa ojos, boca, nariz, manos, postura, sombras y parecido facial antes de decidir.');
    }catch(e){message('No se pudo abrir el retrato: '+e.message)}
    finally{preview.disabled=false}
   });
   for(const [button,decision] of [[approve,'approve'],[reject,'reject']]){
    button.addEventListener('click',async()=>{
     if(picture.style.display==='none')return;
     const question=decision==='approve'?'¿Has revisado cuidadosamente el retrato y confirmas que puede entregarse?':'¿Rechazar este resultado por calidad?';
     if(!confirm(question))return;
     approve.disabled=true;reject.disabled=true;
     try{await call({action:'review',job_id:job.id,decision,confirmed:true});item.remove();message(decision==='approve'?'Retrato aprobado para descarga.':'Resultado rechazado. No se entregará.')}
     catch(e){approve.disabled=false;reject.disabled=false;message('No se pudo guardar la revisión: '+e.message)}
    });
   }
   item.append(info,buttons,picture);area.append(item);
  }
  message(data.jobs.length+' retrato(s) pendiente(s) de revisión.');
 }catch(e){message('Revisión no disponible: '+e.message)}
}
$('flux-review-refresh')?.addEventListener('click',refresh);
const observer=new MutationObserver(()=>{if(!$('dashboard').hidden){observer.disconnect();refresh()}});
observer.observe($('dashboard'),{attributes:true,attributeFilter:['hidden']});
if(!$('dashboard').hidden){observer.disconnect();refresh()}
