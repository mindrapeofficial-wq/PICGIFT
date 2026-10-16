import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.57.4";

const cors={"Access-Control-Allow-Origin":"https://picgift.onrender.com",
 "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info",
 "Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json; charset=utf-8",
 "Cache-Control":"no-store"};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});

Deno.serve(async request=>{
 if(request.method==="OPTIONS")return new Response(null,{headers:cors});
 if(request.method!=="POST")return reply({error:"method_not_allowed"},405);
 const url=Deno.env.get("SUPABASE_URL")||"",key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!url||!key)return reply({error:"service_unavailable"},503);
 const bearer=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
 if(!bearer)return reply({error:"login_required"},401);
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await db.auth.getUser(bearer);
 if(error||!data.user?.id||!data.user.email_confirmed_at)return reply({error:"invalid_session"},401);
 const {error:saveError}=await db.from("picgift_user_presence")
  .upsert({user_id:data.user.id,last_seen_at:new Date().toISOString()},{onConflict:"user_id"});
 return saveError?reply({error:"save_failed"},503):reply({ok:true});
});
