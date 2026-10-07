// PICGIFT Auth. Solo URL y clave PUBLICABLE de un proyecto PICGIFT dedicado.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
const $=id=>document.getElementById(id);
const configured=/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(SUPABASE_URL) && SUPABASE_PUBLISHABLE_KEY.length>25;
const client=configured?createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true}}):null;
const msg=s=>{$('auth-msg').textContent=s;};
let recoveryMode=false;
function showRecovery(){recoveryMode=true;document.getElementById('auth').classList.add('show');$('auth-title').textContent='Nueva contraseña';$('auth-password').value='';$('auth-password').autocomplete='new-password';$('auth-email').closest('label').style.display='none';$('google').style.display='none';$('reset-pass').style.display='none';$('auth-submit').textContent='Guardar nueva contraseña';$('terms').closest('label').style.display='none';$('terms').required=false;msg('Introduce una contraseña nueva de al menos 8 caracteres.');}
function clearRecovery(){recoveryMode=false;$('auth-email').closest('label').style.display='';$('google').style.display='';$('reset-pass').style.display='';$('auth-submit').textContent='Continuar';$('terms').closest('label').style.display='';$('terms').required=true;}
const showUser=user=>{const logged=!!user; $('public').classList.toggle('hide',logged);$('workspace').classList.toggle('show',logged);$('signin').style.display=logged?'none':'';$('signup').style.display=logged?'none':''; if(logged){$('auth').classList.remove('show');} };
if(!client){msg('El acceso está pendiente de activar con un proyecto Supabase exclusivo de PICGIFT. No se almacenan credenciales en esta web.');}
else{
  client.auth.onAuthStateChange((event,session)=>{if(event==='PASSWORD_RECOVERY'){showRecovery();return;}if(!recoveryMode)showUser(session?.user);});
  client.auth.getUser().then(({data,error})=>{if(!error)showUser(data.user);});
}
$('auth-form').addEventListener('submit',async e=>{
 e.preventDefault();if(!client){msg('Registro temporalmente no disponible.');return;}
 const email=$('auth-email').value.trim(),password=$('auth-password').value;
 if(!recoveryMode&&!$('terms').checked){msg('Debes confirmar la autorización para utilizar fotografías.');return;}
 const b=$('auth-submit');b.disabled=true;msg('Verificando…');
 try{
   if(recoveryMode){const {error}=await client.auth.updateUser({password});if(error)throw error;clearRecovery();msg('Contraseña actualizada correctamente.');$('auth').classList.remove('show');const {data}=await client.auth.getUser();showUser(data.user);return;}
   const register=window.picgiftAuthMode==='register';
   const result=register
    ?await client.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname,data:{photo_authorization_confirmed:true}}})
    :await client.auth.signInWithPassword({email,password});
   if(result.error)throw result.error;
   if(register&&!result.data.session)msg('Revisa tu correo y confirma la cuenta antes de entrar.');
   else if(result.data.user)showUser(result.data.user);
 }catch(error){msg(error.message||'No se pudo completar el acceso.');}finally{b.disabled=false;}
});
$('google').addEventListener('click',async()=>{
 if(!client){msg('Google Login pendiente de configuración.');return;}
 if(!$('terms').checked){msg('Confirma primero que tienes autorización para utilizar las fotografías.');return;}
 try{const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+location.pathname}});if(error)throw error;}catch(error){msg(error.message||'Error de Google Login');}
});
$('reset-pass').addEventListener('click',async()=>{
 if(!client){msg('Recuperación de contraseña pendiente de activación.');return;}
 const email=$('auth-email').value.trim();
 if(!email){msg('Introduce tu correo electrónico.');return;}
 const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
 msg(error?error.message:'Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña.');
});
$('logout').addEventListener('click',async()=>{
 if(client)await client.auth.signOut();
 showUser(null);
});
