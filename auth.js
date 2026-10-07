// PICGIFT Auth. Solo URL y clave PUBLICABLE de un proyecto PICGIFT dedicado.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
const $=id=>document.getElementById(id);
const configured=/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(SUPABASE_URL) && SUPABASE_PUBLISHABLE_KEY.length>25;
const client=configured?createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true}}):null;
const msg=s=>{$('auth-msg').textContent=s;};
const showUser=user=>{const logged=!!user; $('public').classList.toggle('hide',logged);$('workspace').classList.toggle('show',logged);$('signin').style.display=logged?'none':'';$('signup').style.display=logged?'none':''; if(logged){$('auth').classList.remove('show');} };
if(!client){msg('El acceso está pendiente de activar con un proyecto Supabase exclusivo de PICGIFT. No se almacenan credenciales en esta web.');}
else{
  client.auth.onAuthStateChange((_event,session)=>showUser(session?.user));
  client.auth.getUser().then(({data,error})=>{if(!error)showUser(data.user);});
}
$('auth-form').addEventListener('submit',async e=>{
 e.preventDefault();if(!client){msg('Registro temporalmente no disponible.');return;}
 const email=$('auth-email').value.trim(),password=$('auth-password').value;
 const b=$('auth-submit');b.disabled=true;msg('Verificando…');
 try{
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
