// PICGIFT: show admin navigation only on the public web and only after server authorization.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const links=['admin-dashboard-link','admin-topbar-link','admin-sidebar-link']
  .map(id=>document.getElementById(id)).filter(Boolean);
const hide=()=>links.forEach(link=>link.classList.add('hidden'));
const show=()=>links.forEach(link=>link.classList.remove('hidden'));

// The native Android application does not expose the admin UI.
if(links.length && typeof window.PicgiftNative==='undefined'){
 const client=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
   auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
 });
 let latest=0;
 let authorized=false;
 const check=async()=>{
   const seq=++latest;
   try{
     const {data:{session},error:sessionError}=await client.auth.getSession();
     if(seq!==latest)return;
     if(sessionError||!session){authorized=false;hide();return;}
     const {data,error}=await client.functions.invoke('picgift-admin',{body:{action:'health'}});
     if(seq!==latest)return;
     if(!error&&data?.admin===true){authorized=true;show();}
     else{authorized=false;hide();}
   }catch{
     if(seq===latest){if(authorized)show();else hide();}
   }
 };
 const queueCheck=()=>{void check()};
 // Multiple Supabase clients can refresh a session simultaneously.
 // Race protection prevents an old response from hiding a new successful authorization.
 client.auth.onAuthStateChange((_event,session)=>{
   if(!session){authorized=false;hide();}
   queueMicrotask(queueCheck);
 });
 window.addEventListener('picgift:auth',queueCheck);
 window.addEventListener('focus',()=>{if(!document.hidden)queueCheck()});
 queueCheck();
}else hide();
