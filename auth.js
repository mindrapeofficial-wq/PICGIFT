// PICGIFT · Auth client. Nunca publicar service_role ni secretos OAuth en GitHub.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
const $=id=>document.getElementById(id);
const ready=/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(SUPABASE_URL)&&SUPABASE_PUBLISHABLE_KEY?.length>24;
const client=ready?createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}):null;
const msg=text=>{$('auth-msg').textContent=text;};
let recovery=false,previous=null;
const publish=user=>{const id=user?.id||null;if(id!==previous){previous=id;window.dispatchEvent(new CustomEvent('picgift:auth',{detail:{user:user||null}}))}};
function openRecovery(){recovery=true;$('auth').classList.add('show');$('auth-title').textContent='Cambia tu contraseña';$('auth-email').closest('label').classList.add('hidden');$('auth-email').required=false;$('auth-password').autocomplete='new-password';$('auth-password').value='';$('terms').closest('label').classList.add('hidden');$('terms').required=false;$('google').classList.add('hidden');$('reset-pass').classList.add('hidden');$('auth-submit').textContent='Guardar contraseña';msg('Escribe una nueva contraseña de PICGIFT de al menos 8 caracteres. También podrás seguir entrando con Google.');$('auth-password').focus();}
function resetRecovery(){recovery=false;$('auth-email').closest('label').classList.remove('hidden');$('auth-email').required=true;$('auth-password').autocomplete=window.picgiftAuthMode==='register'?'new-password':'current-password';$('auth-submit').textContent=window.picgiftAuthMode==='register'?'Crear mi cuenta':'Entrar en mi cuenta';$('terms').closest('label').classList.remove('hidden');$('terms').required=window.picgiftAuthMode==='register';$('terms').closest('label').classList.toggle('hidden',window.picgiftAuthMode!=='register');$('google').classList.remove('hidden');$('reset-pass').classList.remove('hidden');}
if(client){
  client.auth.onAuthStateChange((event,session)=>{if(event==='PASSWORD_RECOVERY'){openRecovery();return}if(!recovery)publish(session?.user||null);});
  client.auth.getUser().then(({data,error})=>{if(!error&&!recovery)publish(data?.user||null);}).catch(()=>{});
}else{msg('El registro está temporalmente desactivado. No introduzcas credenciales.');}
$('auth-form').addEventListener('submit',async e=>{
 e.preventDefault();if(!client){msg('Acceso temporalmente no disponible.');return;}
 const email=$('auth-email').value.trim(),password=$('auth-password').value;
 const signup=window.picgiftAuthMode==='register';
 if(!recovery&&signup&&!$('terms').checked){msg('Confirma que cuentas con autorización para utilizar las imágenes.');return;}
 const submit=$('auth-submit');submit.disabled=true;msg('Conectando de forma segura…');
 try{
  if(recovery){const {error}=await client.auth.updateUser({password});if(error)throw error;resetRecovery();$('auth').classList.remove('show');msg('Contraseña actualizada.');const {data}=await client.auth.getUser();publish(data.user);return;}
  const res=signup?await client.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname,data:{photo_authorization_confirmed:true}}}):await client.auth.signInWithPassword({email,password});
  if(res.error)throw res.error;
  if(signup&&!res.data.session)msg('Revisa tu correo para confirmar la cuenta. Después podrás iniciar sesión.');
  else if(res.data?.user)publish(res.data.user);
 }catch(err){msg(err.message||'No se pudo iniciar sesión.');}finally{submit.disabled=false;}
});
$('google').addEventListener('click',async()=>{
 if(!client){msg('Acceso con Google no disponible.');return}
 if(window.picgiftAuthMode==='register'&&!$('terms').checked){msg('Marca antes la confirmación de autorización.');return}
 if(typeof window.PicgiftNative==='object'){msg('El acceso con Google aún no está integrado en la APK. Puedes acceder con correo y contraseña o utilizar Google desde la web instalada en tu móvil.');return;}
 $('google').disabled=true;msg('Abriendo Google…');
 try{const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+location.pathname}});if(error)throw error}
 catch(err){msg(err.message||'No se pudo abrir Google.');$('google').disabled=false;}
});
$('reset-pass').addEventListener('click',async()=>{
 if(!client){msg('Recuperación desactivada.');return}const email=$('auth-email').value.trim();
 if(!email){msg('Primero escribe tu correo electrónico.');return}
 const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
 msg(error?error.message:'Si la cuenta existe, recibirás un correo para restablecer la contraseña.');
});
$('logout').addEventListener('click',async()=>{if(client){const {error}=await client.auth.signOut();if(error){msg(error.message);return}}publish(null);window.location.hash='inicio';});
