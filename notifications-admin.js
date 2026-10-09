import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
const $ = id => document.getElementById(id);
const client=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const setStatus=(message,error=false)=>{const el=$('notification-status');el.textContent=message;el.classList.toggle('error',error)};
const errors={firebase_not_configured:'Firebase todavía no tiene credenciales configuradas.',firebase_credentials_invalid:'Firebase rechazó las credenciales.',no_devices:'No hay móviles registrados para ese destinatario.',send_limit:'Se alcanzó el límite de 10 campañas por hora.',audience_too_large:'Hay más de 1000 dispositivos. Debe dividirse el envío.',admin_forbidden:'Esta cuenta no puede enviar notificaciones.',invalid_session:'Inicia sesión nuevamente.',login_required:'Inicia sesión nuevamente.',devices_unavailable:'No se pudieron consultar los dispositivos.'};
async function invoke(body){
 const {data,error}=await client.functions.invoke('picgift-notifications',{body});
 if(error){let code='service_unavailable';try{code=(await error.context.json())?.error||code}catch{}throw Error(errors[code]||code)}
 if(data?.error)throw Error(errors[data.error]||data.error);
 return data;
}
function fillUsers(users){
 const select=$('notification-user');select.replaceChildren();
 for(const user of users.filter(u=>u.id&&u.email).sort((a,b)=>a.email.localeCompare(b.email))){
  const option=document.createElement('option');option.value=user.id;option.textContent=user.email;select.append(option);
 }
}
async function load(){
 try{
  const data=await invoke({action:'health'});
  $('notification-health').textContent=(data.configured?'Firebase configurado':'Firebase sin configurar')+' · '+(data.devices??0)+' dispositivos registrados';
  $('notification-send').disabled=!data.configured||!data.devices;
  const history=$('notification-history');history.replaceChildren();
  if(!data.history?.length){history.textContent='Todavía no hay campañas enviadas.';return}
  for(const item of data.history){
   const row=document.createElement('div');row.className='user-item';
   const name=document.createElement('strong');name.textContent=item.title;
   const detail=document.createElement('span');detail.className='meta';
   detail.textContent=(item.body||'')+' · '+new Date(item.created_at).toLocaleString('es-ES')+' · '+item.status+' · aceptados '+item.accepted+'/'+item.total+' · fallidos '+item.failed;
   const wrapper=document.createElement('div');wrapper.className='user-info';wrapper.append(name,detail);row.append(wrapper);history.append(row);
  }
 }catch(e){$('notification-health').textContent='No se pudo comprobar el servicio: '+e.message;$('notification-send').disabled=true}
}
$('notification-audience').addEventListener('change',()=>{
 const user=$('notification-audience').value==='user';$('notification-user-label').hidden=!user;$('notification-user').required=user;
});
$('notification-refresh').addEventListener('click',load);
$('notification-form').addEventListener('submit',async event=>{
 event.preventDefault();
 const audience=$('notification-audience').value,title=$('notification-title-input').value.trim(),body=$('notification-body-input').value.trim(),route=$('notification-route').value;
 if(!title||!body||title.length>80||body.length>300){setStatus('Revisa el título y el mensaje.',true);return}
 const target=audience==='all'?'todos los dispositivos registrados':audience==='self'?'tu dispositivo':'el usuario seleccionado';
 if(!window.confirm('¿Confirmas el envío a '+target+'?'))return;
 const button=$('notification-send');button.disabled=true;setStatus('Solicitando envío…');
 try{
  const result=await invoke({action:'send',id:crypto.randomUUID(),title,body,route,audience,...(audience==='user'?{user_id:$('notification-user').value}:{})});
  setStatus('Campaña '+result.status+'. Dispositivos seleccionados: '+(result.total??'pendiente')+'. Actualiza el historial para ver los resultados; la aceptación no garantiza lectura.');
  $('notification-form').reset();$('notification-user-label').hidden=true;
 }catch(e){setStatus('No se ha enviado: '+e.message,true)}
 finally{await load()}
});
async function activate(){
 if(!$('dashboard')||$('dashboard').hidden)return;
 const {data:{session}}=await client.auth.getSession();if(!session)return;
 const {data,error}=await client.functions.invoke('picgift-admin',{body:{action:'list'}});
 if(!error&&data?.admin&&Array.isArray(data.users)){fillUsers(data.users);await load();}
}
const observer=new MutationObserver(()=>{if(!$('dashboard').hidden){observer.disconnect();void activate()}});
observer.observe($('dashboard'),{attributes:true,attributeFilter:['hidden']});
if(!$('dashboard').hidden)void activate();
