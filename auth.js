// PICGIFT · Auth client. Nunca publicar service_role ni secretos OAuth en GitHub.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
const $=id=>document.getElementById(id);
const ready=/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(SUPABASE_URL)&&SUPABASE_PUBLISHABLE_KEY?.length>24;
const client=ready?createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:window.PicgiftNative?'pkce':'implicit'}}):null;
const msg=text=>{$('auth-msg').textContent=text;};
let recovery=false,previous;
let askedToSignIn=false;
async function offerInstalledSignIn(){
 if(!client||askedToSignIn||recovery||window.picgiftNativeReturn)return;
 const installed=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true||window.picgiftNativeGoogleSupported===true;
 if(!installed||/[?&]code=/.test(location.search)||/access_token=|type=recovery/.test(location.hash))return;
 try{const {data,error}=await client.auth.getSession();if(error||data.session)return;
  askedToSignIn=true;window.dispatchEvent(new Event('picgift:show-auth'));
 }catch{ /* The visible sign-in button remains available after a network failure. */ }
}
window.addEventListener('picgift:native-ready',()=>{if(window.picgiftNativeGoogleSupported&&!recovery){$('google').classList.remove('hidden');document.querySelector('.auth-divider').classList.remove('hidden');}offerInstalledSignIn();});
window.addEventListener('picgift:native-auth-error',()=>{msg('No se pudo abrir el navegador. Instala un navegador compatible o entra con tu correo.');$('google').disabled=false;});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',offerInstalledSignIn,{once:true});else setTimeout(offerInstalledSignIn,0);
const publish=user=>{const id=user?.id||null;if(id!==previous){previous=id;window.dispatchEvent(new CustomEvent('picgift:auth',{detail:{user:user||null}}))}};
function openRecovery(){recovery=true;$('auth').classList.add('show');$('auth-title').textContent='Cambia tu contraseña';$('auth-email').closest('label').classList.add('hidden');$('auth-email').required=false;$('auth-password').autocomplete='new-password';$('auth-password').value='';$('terms').closest('label').classList.add('hidden');$('terms').required=false;$('google').classList.add('hidden');document.querySelector('.auth-divider').classList.add('hidden');$('reset-pass').classList.add('hidden');$('auth-submit').textContent='Guardar contraseña';msg('Escribe una nueva contraseña de PICGIFT de al menos 8 caracteres. También podrás seguir entrando con Google.');$('auth-password').focus();}
function resetRecovery(){recovery=false;$('auth-email').closest('label').classList.remove('hidden');$('auth-email').required=true;$('auth-password').autocomplete=window.picgiftAuthMode==='register'?'new-password':'current-password';$('auth-submit').textContent=window.picgiftAuthMode==='register'?'Crear mi cuenta':'Entrar en mi cuenta';$('terms').closest('label').classList.remove('hidden');$('terms').required=window.picgiftAuthMode==='register';$('terms').closest('label').classList.toggle('hidden',window.picgiftAuthMode!=='register');$('google').classList.remove('hidden');document.querySelector('.auth-divider').classList.remove('hidden');$('reset-pass').classList.remove('hidden');}
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
 if(window.PicgiftNative&&!window.picgiftNativeGoogleSupported){msg('Actualiza la app Android para entrar con Google. También puedes acceder con tu correo y contraseña.');return;}
 $('google').disabled=true;msg('Abriendo Google…');
 try{
  const native=!!window.PicgiftNative;
  const {data,error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+'/',skipBrowserRedirect:native,queryParams:{prompt:'select_account'}}});
  if(error)throw error;
  if(native){
   if(!data?.url)throw new Error('No se pudo preparar el acceso con Google.');
   const state=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
   window.PicgiftNative.postMessage(JSON.stringify({action:'google-auth',url:data.url,state}));
   msg('Elige tu cuenta en el navegador y pulsa «Volver a PICGIFT».');
   $('google').disabled=false;
  }
 }
 catch(err){msg(err.message||'No se pudo abrir Google.');$('google').disabled=false;}
});
$('reset-pass').addEventListener('click',async()=>{
 if(!client){msg('Recuperación desactivada.');return}const email=$('auth-email').value.trim();
 if(!email){msg('Primero escribe tu correo electrónico.');return}
 const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
 msg(error?error.message:'Si la cuenta existe, recibirás un correo para restablecer la contraseña.');
});
$('logout').addEventListener('click',async()=>{if(client){const {error}=await client.auth.signOut();if(error){msg(error.message);return}}publish(null);window.location.hash='inicio';});
window.addEventListener('picgift:update-profile',async e=>{
 const name=String(e.detail?.display_name||'').trim().slice(0,60);
 if(!client||!name){window.dispatchEvent(new CustomEvent('picgift:profile-updated',{detail:{error:'Escribe un nombre válido e inicia sesión.'}}));return;}
 const {data,error}=await client.auth.updateUser({data:{display_name:name}});
 window.dispatchEvent(new CustomEvent('picgift:profile-updated',{detail:error?{error:'No se pudo guardar el nombre. Inténtalo de nuevo.'}:{user:data.user}}));
});
