import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
const $=id=>document.getElementById(id);
const client=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
let users=[],settings=null,premiumSettings=null,globalUsed=0;
const displayDate=value=>{if(!value)return 'Nunca';const date=new Date(value);return Number.isNaN(date.getTime())?'No disponible':new Intl.DateTimeFormat('es-ES',{dateStyle:'medium',timeStyle:'short'}).format(date)};
const providerNames={email:'Correo y contraseña',google:'Google',apple:'Apple',facebook:'Facebook',github:'GitHub',azure:'Microsoft'};
const loginMethods=user=>(Array.isArray(user.providers)?user.providers:[]).filter(p=>typeof p==='string');
const msg=(s,error=false)=>{$('status').textContent=s;$('status').classList.toggle('error',error)};
async function api(body){
 const {data,error}=await client.functions.invoke('picgift-admin',{body});
 if(error){let detail='No se pudo conectar con el panel.';try{detail=(await error.context.json())?.error||detail}catch{}throw Error(detail)}
 return data;
}
function block(title,description){
 $('dashboard').hidden=true;$('blocked').hidden=false;$('blocked-title').textContent=title;$('blocked-message').textContent=description;
}
function render(){
 if(!settings)return;
 const filtered=users.filter(u=>(!$('filter-enabled').checked||u.enabled)&&u.email.toLowerCase().includes($('user-search').value.trim().toLowerCase()));
 $('count-users').textContent=users.length;
 $('count-enabled').textContent=users.filter(u=>u.enabled).length;
 $('count-used').textContent=globalUsed;
 $('count-remaining').textContent=Math.max(0,settings.global_daily_limit-globalUsed);
 $('global-limit').value=String(settings.global_daily_limit);
 $('default-limit').value=String(settings.default_user_daily_limit);
 $('premium-default-limit').value=String(premiumSettings?.daily_limit??3);
 const container=$('user-list');container.replaceChildren();
 if(!filtered.length){const blank=document.createElement('div');blank.className='empty';blank.textContent='No hay usuarios que coincidan con la búsqueda.';container.append(blank);return}
 const sorted=[...filtered].sort((a,b)=>Number(b.enabled)-Number(a.enabled)||a.email.localeCompare(b.email));
 for(const user of sorted){
   const card=document.createElement('div');card.className='user-item';
   const info=document.createElement('div');info.className='user-info';
   const title=document.createElement('strong');title.textContent=user.email||'Cuenta sin correo';
   const meta=document.createElement('span');meta.className='meta';meta.textContent=(user.confirmed?'Correo verificado':'Correo sin confirmar')+' · '+user.used_today+' usadas hoy'+(user.is_pilot?' · Beta tradicional':'');
   info.append(title,meta);
   const premiumLabel=document.createElement('label');premiumLabel.textContent='Premium por día ';
   const premiumLimit=document.createElement('input');premiumLimit.type='number';premiumLimit.min='0';premiumLimit.max='100';premiumLimit.step='1';premiumLimit.value=user.premium_daily_limit===null?'':String(user.premium_daily_limit);premiumLimit.placeholder='General: '+(premiumSettings?.daily_limit??3);premiumLimit.setAttribute('aria-label','Límite Premium diario para '+user.email);
   const premiumSave=document.createElement('button');premiumSave.type='button';premiumSave.className='button';premiumSave.textContent='Guardar Premium';
   premiumLabel.append(premiumLimit);info.append(premiumLabel,premiumSave);
   premiumSave.addEventListener('click',async()=>{
    const n=premiumLimit.value===''?null:Number(premiumLimit.value);
    if(n!==null&&(!Number.isInteger(n)||n<0||n>100)){msg('El límite Premium debe estar entre 0 y 100.',true);return}
    premiumSave.disabled=true;
    try{await api({action:'set_premium_user',user_id:user.id,daily_limit:n});user.premium_daily_limit=n;msg('Límite Premium actualizado para '+user.email);}
    catch(e){msg('No se pudo guardar: '+e.message,true)}finally{premiumSave.disabled=false}
   });
   const label=document.createElement('label');label.className='user-enable';
   const enabled=document.createElement('input');enabled.type='checkbox';enabled.checked=user.enabled;
   const caption=document.createElement('span');caption.textContent='Habilitado';label.append(enabled,caption);
   const limit=document.createElement('input');limit.type='number';limit.min='0';limit.max='20';limit.step='1';limit.value=String(user.daily_limit);limit.setAttribute('aria-label','Límite diario para '+user.email);
   const save=document.createElement('button');save.className='button';save.textContent='Guardar';save.type='button';
   save.addEventListener('click',async()=>{
     const n=Number(limit.value);
     if(!Number.isInteger(n)||n<0||n>20){msg('El límite debe estar entre 0 y 20.',true);return}
     if(enabled.checked&&!user.confirmed){msg('El usuario debe confirmar su correo antes de habilitar pruebas.',true);return}
     save.disabled=true;save.textContent='Guardando…';
     try{await api({action:'set_user',user_id:user.id,enabled:enabled.checked,daily_limit:n});user.enabled=enabled.checked;user.daily_limit=n;user.has_override=true;msg('Límite actualizado para '+user.email);save.textContent='Guardado';setTimeout(()=>{save.textContent='Guardar'},900)}
     catch(e){msg('No se pudo guardar: '+e.message,true);save.textContent='Guardar'}finally{save.disabled=false}
   });
   const methods=loginMethods(user);
   const access=document.createElement('div');access.className='account-access';
   const details=document.createElement('div');details.className='account-details';
   const method=document.createElement('span');method.textContent='Inicio de sesión: '+(methods.length?methods.map(p=>providerNames[p]||p).join(', '):'Método no disponible');
   const last=document.createElement('span');last.textContent='Último acceso: '+displayDate(user.last_sign_in_at)+' · Registro: '+displayDate(user.created_at);
   const password=document.createElement('span');password.textContent=methods.includes('email')?'Contraseña: protegida, no visible para administradores':'Contraseña: no disponible en el panel';
   details.append(method,last,password);
   const reset=document.createElement('button');reset.type='button';reset.className='button';reset.textContent='Enviar recuperación de contraseña';
   const canReset=Boolean(user.confirmed&&user.email&&methods.includes('email'));
   reset.disabled=!canReset;
   if(!canReset)reset.title=methods.includes('google')&&!methods.includes('email')?'Esta cuenta utiliza Google. No tiene contraseña de PICGIFT que recuperar.':'Solo disponible para usuarios con correo confirmado y acceso por contraseña.';
   reset.addEventListener('click',async()=>{
     if(!canReset||!window.confirm('¿Enviar un correo de recuperación de contraseña a '+user.email+'?'))return;
     reset.disabled=true;reset.textContent='Solicitando envío…';
     try{
       const {error}=await client.auth.resetPasswordForEmail(user.email,{redirectTo:location.origin+'/'});
       if(error)throw error;
       msg('Recuperación solicitada para '+user.email+'. La entrega depende de la configuración de correo de Supabase.');
     }catch(e){msg('No se pudo solicitar la recuperación: '+(e.message||'Error desconocido'),true)}
     finally{reset.disabled=false;reset.textContent='Enviar recuperación de contraseña'}
   });
   access.append(details,reset);
   card.append(info,label,limit,save,access);container.append(card);
 }
}
async function load(){
 msg('Actualizando información…');
 try{
   const data=await api({action:'list'});if(!data?.admin||!Array.isArray(data.users))throw Error('Respuesta de administración no válida');
   users=data.users;settings=data.settings;premiumSettings=data.premium_settings;globalUsed=data.global_used||0;
   $('day-label').textContent=data.utc_day+' (UTC)';
   render();msg('Administración lista. Cambios protegidos por Supabase.');
 }catch(e){msg('Error al actualizar: '+e.message,true)}
}
$('refresh').addEventListener('click',load);
$('premium-form').addEventListener('submit',async e=>{
 e.preventDefault();const n=Number($('premium-default-limit').value);
 if(!Number.isInteger(n)||n<0||n>100){msg('El límite Premium debe estar entre 0 y 100.',true);return}
 const button=$('premium-form').querySelector('button');button.disabled=true;
 try{await api({action:'set_premium_global',daily_limit:n});premiumSettings.daily_limit=n;render();msg('Límite diario Premium guardado.');}
 catch(e){msg('No se pudo guardar: '+e.message,true)}finally{button.disabled=false}
});
$('user-search').addEventListener('input',render);
$('filter-enabled').addEventListener('change',render);
$('global-form').addEventListener('submit',async e=>{
 e.preventDefault();const global=Number($('global-limit').value),def=Number($('default-limit').value);
 if(!Number.isInteger(global)||global<0||global>48||!Number.isInteger(def)||def<0||def>20){msg('Introduce valores dentro de los límites permitidos.',true);return}
 const button=$('global-form').querySelector('button');button.disabled=true;
 try{await api({action:'set_global',global_daily_limit:global,default_user_daily_limit:def});settings.global_daily_limit=global;settings.default_user_daily_limit=def;render();msg('Límites globales guardados.');}
 catch(e){msg('No se pudo guardar: '+e.message,true)}finally{button.disabled=false}
});
if(typeof window.PicgiftNative!=='undefined')block('Disponible solo en la web','La administración se gestiona desde un navegador web, no desde la aplicación Android.');
else {
  try{
   const {data:{session}}=await client.auth.getSession();
   if(!session)block('Inicia sesión primero','Accede a PICGIFT con tu cuenta administradora y vuelve a abrir esta página.');
   else{
     const h=await api({action:'health'});
     if(h?.admin){$('blocked').hidden=true;$('dashboard').hidden=false;await load()}
     else block('Acceso no autorizado','Esta cuenta no tiene permisos de administración.');
   }
  }catch(e){block('Acceso restringido',e.message==='admin_forbidden'?'Esta cuenta no tiene permisos de administración.':'Inicia sesión con una cuenta administradora para continuar.')}
}
