import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY } from './config.js';
const link=document.getElementById('admin-dashboard-link');
if(link && typeof window.PicgiftNative==='undefined'){
 const client=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 const check=async()=>{
   link.classList.add('hidden');
   try{
     const {data:{session}}=await client.auth.getSession();
     if(!session)return;
     const {data,error}=await client.functions.invoke('picgift-admin',{body:{action:'health'}});
     if(!error&&data?.admin===true)link.classList.remove('hidden');
   }catch{}
 };
 client.auth.onAuthStateChange(()=>setTimeout(check,0));
 window.addEventListener('picgift:auth',check);
 check();
}
