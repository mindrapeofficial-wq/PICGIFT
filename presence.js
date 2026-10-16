import {createClient} from './vendor/supabase.js';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './config.js';

const client=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
let lastUser=null,lastPing=0,busy=false;
const madridDay=date=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
let lastDay='';
async function markEntry(){
 if(document.visibilityState==='hidden'||busy||navigator.onLine===false)return;
 const {data,error}=await client.auth.getSession();
 const session=data?.session;
 if(error||!session?.user?.id||!session.access_token)return;
 const now=Date.now(),day=madridDay(new Date(now));
 if(lastUser===session.user.id&&lastDay===day&&now-lastPing<15*60_000)return;
 busy=true;
 try{
  const {error:pingError}=await client.functions.invoke('picgift-presence',{body:{},headers:{Authorization:'Bearer '+session.access_token}});
  if(!pingError){lastUser=session.user.id;lastDay=day;lastPing=now}
 }finally{busy=false}
}
client.auth.onAuthStateChange((_event,session)=>{
 if(!session?.user){lastUser=null;lastDay='';lastPing=0;return}
 setTimeout(()=>{void markEntry().catch(()=>{})},0);
});
document.addEventListener('visibilitychange',()=>{void markEntry().catch(()=>{})});
window.addEventListener('pageshow',()=>{void markEntry().catch(()=>{})});
window.addEventListener('online',()=>{void markEntry().catch(()=>{})});
void markEntry().catch(()=>{});
