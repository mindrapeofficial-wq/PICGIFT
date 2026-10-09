// PICGIFT · Google, password backup and email recovery. No service-role keys here.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
const $=id=>document.getElementById(id);
const ready=/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(SUPABASE_URL)&&SUPABASE_PUBLISHABLE_KEY?.length>24;
const client=ready?createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:window.PicgiftNative?'pkce':'implicit'}}):null;
// Recovery emails must work in a browser even if requested from the Android WebView.
const mailer=ready?createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,flowType:'implicit',storageKey:'picgift-recovery-request'}}):null;
const msg=text=>{$('auth-msg').textContent=text;};
let previous,activeUser=null,mode=window.picgiftAuthMode||'login',recovery=false,askedToSignIn=false,googleBusy=false;
const attemptedKey='picgift-google-opening';
function toggleField(id,show,required=show){const el=$(id);el.closest('label').classList.toggle('hidden',!show);el.required=required;el.disabled=!show;}
function openAuth(next='login'){
 mode=next;window.picgiftAuthMode=next;window.picgiftAuthReturnFocus=document.activeElement;
 $('auth').dataset.authMode=next;
 const passwordMode=next==='backup'||next==='recovery',forgot=next==='forgot',signup=next==='register';
 recovery=next==='recovery';
 $('auth-title').textContent=passwordMode?(recovery?'Cambia tu contraseña':'Crea tu contraseña alternativa'):forgot?'¿Olvidaste tu contraseña?':signup?'Crear cuenta':'Entrar con contraseña';
 document.querySelector('#auth .auth-caption').textContent=passwordMode?(recovery?'Elige una nueva contraseña para tu cuenta.':'Podrás entrar con tu correo si algún día Google no está disponible.'):forgot?'Te enviaremos un enlace para recuperar el acceso.':'Utiliza el correo de tu cuenta PICGIFT.';
 toggleField('auth-email',!passwordMode);toggleField('auth-password',!forgot);toggleField('auth-password-confirm',passwordMode);
 $('auth-password').autocomplete=passwordMode||signup?'new-password':'current-password';
 $('auth-password').value='';$('auth-password-confirm').value='';$('auth-password-confirm').setCustomValidity('');
 $('terms').closest('label').classList.toggle('hidden',!signup);$('terms').required=signup;
 // Google is an alternative link here; opening the installed app goes directly to Google.
 $('google').classList.toggle('hidden',passwordMode||forgot);
 document.querySelector('.auth-divider').classList.toggle('hidden',passwordMode||forgot);
 $('reset-pass').classList.toggle('hidden',passwordMode||forgot||signup);
 $('auth-back').classList.toggle('hidden',!forgot);
 $('auth-skip-password').classList.toggle('hidden',next!=='backup');
 $('auth-submit').textContent=passwordMode?'Guardar contraseña':forgot?'Enviar enlace de recuperación':signup?'Crear mi cuenta':'Entrar en mi cuenta';
 $('auth-submit').disabled=false;
 msg(passwordMode?(activeUser?.email?'Cuenta: '+activeUser.email:'Escribe y confirma una contraseña de al menos 8 caracteres.'):forgot?'Escribe el correo con el que entras con Google o con contraseña.':'Puedes recuperar tu contraseña aunque te registraras con Google.');
 $('auth').classList.add('show');$(passwordMode?'auth-password':'auth-email').focus();
}
window.picgiftOpenAuth=openAuth;
function offerPasswordBackup(user){
 if(!user||recovery||user.user_metadata?.picgift_password_backup===true)return;
 const google=user.app_metadata?.provider==='google'||user.app_metadata?.providers?.includes('google')||user.identities?.some(i=>i.provider==='google');
 if(!google)return;
 try{if(localStorage.getItem('picgift-password-offered:'+user.id)==='yes')return;localStorage.setItem('picgift-password-offered:'+user.id,'yes')}catch{}
 openAuth('backup');
}
function publish(user){activeUser=user||null;const id=user?.id||null;
 if(id!==previous){previous=id;window.dispatchEvent(new CustomEvent('picgift:auth',{detail:{user:activeUser}}));}
 if(user){try{sessionStorage.removeItem(attemptedKey)}catch{};setTimeout(()=>offerPasswordBackup(user),0)}
}
async function startGoogle(automatic=false){
 if(!client||googleBusy)return;
 if(mode==='register'&&!$('terms').checked){msg('Confirma primero la autorización para utilizar las fotografías.');return}
 googleBusy=true;$('google').disabled=true;
 try{
  try{sessionStorage.setItem(attemptedKey,'yes')}catch{}
  const native=!!window.PicgiftNative;
  if(native&&window.picgiftNativeCredentialManagerSupported===true){
   window.PicgiftNative.postMessage(JSON.stringify({action:'google-native',mode:automatic?'auto':'manual'}));
   return;
  }
  // Legacy Android builds and devices without native credentials retain external-browser OAuth.
  const {data,error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+'/',skipBrowserRedirect:native,queryParams:{prompt:'select_account'}}});
  if(error)throw error;
  if(native){
   if(!data?.url)throw new Error('No se pudo preparar el acceso.');
   const state=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
   window.PicgiftNative.postMessage(JSON.stringify({action:'google-auth',url:data.url,state}));
   // Leave the password alternative accessible if the customer cancels in the browser.
   openAuth();msg('Selecciona tu cuenta en el navegador y pulsa «Volver a PICGIFT». Puedes usar tu contraseña si cancelas.');
  }
 }catch{openAuth();msg('No se pudo abrir Google. Puedes reintentarlo o entrar con tu correo y contraseña.');}
 finally{googleBusy=false;$('google').disabled=false;}
}
async function offerInstalledSignIn(){
 if(!client||askedToSignIn||recovery||window.picgiftNativeReturn)return;
 // Wait for Android to announce Credential Manager support before selecting a sign-in flow.
 if(window.PicgiftNative&&typeof window.picgiftNativeGoogleSupported==='undefined')return;
 const installed=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true||!!window.PicgiftNative;
 if(!installed||/[?&]code=/.test(location.search)||/access_token=|type=recovery/.test(location.hash))return;
 try{const {data,error}=await client.auth.getSession();if(error||data.session)return;askedToSignIn=true;
  let attempted=false;try{attempted=sessionStorage.getItem(attemptedKey)==='yes'}catch{}
  if(attempted||/error=|error_description=/.test(location.hash)){openAuth();msg('Puedes reintentar Google o entrar con tu correo y contraseña.');return}
  await startGoogle(true);
 }catch{openAuth();msg('Comprueba tu conexión para iniciar sesión.');}
}
// Android's Credential Manager returns a Google ID token + raw nonce. Supabase validates
// the signature, audience and hashed nonce before creating any PICGIFT session.
window.picgiftReceiveGoogleIdToken=async detail=>{
 if(!window.PicgiftNative||!client)return;
 const token=detail?.token,nonce=detail?.nonce;
 if(typeof token!=='string'||!(/^[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$/).test(token)||
    typeof nonce!=='string'||!(/^[a-f0-9]{64}$/).test(nonce)){
  openAuth();msg('Respuesta de Google no válida. Vuelve a intentarlo.');return;
 }
 try{
  msg('Verificando tu cuenta de Google…');
  const {data,error}=await client.auth.signInWithIdToken({provider:'google',token,nonce});
  if(error)throw error;
  if(!data?.user&&!data?.session?.user)throw new Error('Sesión vacía');
  $('auth').classList.remove('show');
  publish(data.user||data.session.user);
 }catch{
  openAuth();msg('No se pudo verificar la cuenta Google. Comprueba la configuración e inténtalo de nuevo.');
 }
};
window.addEventListener('picgift:native-google-error',event=>{
 openAuth();
 const cancelled=event.detail?.reason==='cancelled';
 msg(cancelled?'Acceso cancelado. Puedes volver a elegir Google o entrar con contraseña.':'No se pudo abrir el selector de Google. Inténtalo de nuevo o utiliza tu contraseña.');
});
window.addEventListener('picgift:native-ready',offerInstalledSignIn);
window.addEventListener('picgift:native-auth-error',()=>{openAuth();msg('No se pudo abrir el navegador. Entra con tu correo y contraseña.');});
window.addEventListener('pageshow',event=>{if(event.persisted&&!activeUser&&!recovery){googleBusy=false;$('google').disabled=false;openAuth();}});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',offerInstalledSignIn,{once:true});else setTimeout(offerInstalledSignIn,0);
if(client){
 client.auth.onAuthStateChange((event,session)=>{if(event==='PASSWORD_RECOVERY'){activeUser=session?.user||null;openAuth('recovery');return}if(!recovery)publish(session?.user||null);});
 client.auth.getUser().then(({data,error})=>{if(!error&&!recovery)publish(data?.user||null)}).catch(()=>{});
}else{msg('Acceso temporalmente no disponible.');}
$('auth-password-confirm').addEventListener('input',()=>$('auth-password-confirm').setCustomValidity(''));
$('auth-form').addEventListener('submit',async event=>{
 event.preventDefault();if(!client){msg('Acceso temporalmente no disponible.');return}
 const currentMode=mode,email=$('auth-email').value.trim(),password=$('auth-password').value;
 const passwordMode=currentMode==='backup'||currentMode==='recovery';
 if(passwordMode&&password!==$('auth-password-confirm').value){$('auth-password-confirm').setCustomValidity('Las contraseñas no coinciden.');$('auth-password-confirm').reportValidity();return}
 if(currentMode==='register'&&!$('terms').checked){msg('Confirma la autorización para utilizar las imágenes.');return}
 const submit=$('auth-submit');submit.disabled=true;msg('Conectando de forma segura…');
 try{
  if(currentMode==='forgot'){
   const {error}=await mailer.auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/'});if(error)throw error;
   msg('Si hay una cuenta con ese correo, recibirás un enlace para elegir una nueva contraseña. Revisa también el correo no deseado.');submit.textContent='Volver a enviar el enlace';return;
  }
  if(passwordMode){
   const {data,error}=await client.auth.updateUser({password,data:{picgift_password_backup:true}});if(error)throw error;
   recovery=false;mode='login';window.picgiftAuthMode='login';$('auth').classList.remove('show');publish(data.user||activeUser);
   window.dispatchEvent(new CustomEvent('picgift:profile-updated',{detail:{user:data.user||activeUser}}));
   $('auth-password').value='';$('auth-password-confirm').value='';
   const toast=$('toast');toast.textContent='Contraseña guardada. Ya puedes entrar con Google o con tu correo.';toast.classList.add('on');setTimeout(()=>toast.classList.remove('on'),5000);return;
  }
  const res=currentMode==='register'?await client.auth.signUp({email,password,options:{emailRedirectTo:location.origin+'/',data:{photo_authorization_confirmed:true}}}):await client.auth.signInWithPassword({email,password});
  if(res.error)throw res.error;
  if(currentMode==='register'&&!res.data.session)msg('Revisa tu correo para confirmar la cuenta. Después podrás iniciar sesión.');else if(res.data?.user)publish(res.data.user);
 }catch{msg(currentMode==='forgot'?'No se pudo enviar el enlace. Comprueba el correo e inténtalo de nuevo dentro de unos minutos.':passwordMode?'No se pudo guardar la contraseña. Usa al menos 8 caracteres y vuelve a intentarlo; si tu sesión ha caducado, solicita un enlace de recuperación.':'No se pudo iniciar sesión. Comprueba tu correo y contraseña, o utiliza la recuperación.');}
 finally{submit.disabled=false;}
});
$('google').addEventListener('click',()=>startGoogle(false));
document.addEventListener('click',event=>{
 if(event.target.closest('[data-google-login]'))startGoogle();
 if(event.target.closest('[data-password-setup]')){document.getElementById('app-panel')?.close();if(activeUser)openAuth('backup');else openAuth();}
});
$('reset-pass').addEventListener('click',()=>openAuth('forgot'));
$('auth-back').addEventListener('click',()=>openAuth());
$('auth-skip-password').addEventListener('click',()=>{$('auth').classList.remove('show');});
$('logout').addEventListener('click',async()=>{if(client){if(window.picgiftNotificationsUnregister)await window.picgiftNotificationsUnregister();const {error}=await client.auth.signOut();if(error){msg('No se pudo cerrar la sesión.');return}}try{sessionStorage.setItem(attemptedKey,'yes')}catch{};publish(null);window.location.hash='crear';});
window.addEventListener('picgift:update-profile',async event=>{
 const name=String(event.detail?.display_name||'').trim().slice(0,60);
 if(!client||!name){window.dispatchEvent(new CustomEvent('picgift:profile-updated',{detail:{error:'Escribe un nombre válido e inicia sesión.'}}));return}
 const {data,error}=await client.auth.updateUser({data:{display_name:name}});
 window.dispatchEvent(new CustomEvent('picgift:profile-updated',{detail:error?{error:'No se pudo guardar el nombre. Inténtalo de nuevo.'}:{user:data.user}}));
});
