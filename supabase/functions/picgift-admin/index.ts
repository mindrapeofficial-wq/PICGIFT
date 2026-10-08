import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const url = Deno.env.get("SUPABASE_URL") || "";
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const cors = {
  "Access-Control-Allow-Origin":"https://picgift.onrender.com",
  "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info",
  "Access-Control-Allow-Methods":"POST,OPTIONS",
  "Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"no-store"
};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
const isInt=(value:unknown,min:number,max:number):value is number=>
 typeof value==="number"&&Number.isInteger(value)&&value>=min&&value<=max;
const today=()=>new Date().toISOString().slice(0,10);

Deno.serve(async request=>{
 if(request.method==="OPTIONS")return new Response(null,{headers:cors});
 if(request.method!=="POST")return reply({error:"method_not_allowed"},405);
 if(!url||!service)return reply({error:"service_unavailable"},503);
 const bearer=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
 if(!bearer)return reply({error:"login_required"},401);
 const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:auth,error:authError}=await db.auth.getUser(bearer);
 if(authError||!auth.user?.id||!auth.user?.email_confirmed_at)return reply({error:"invalid_session"},401);
 const adminId=auth.user.id;
 const {data:admin,error:adminError}=await db.from("picgift_admin_users").select("user_id").eq("user_id",adminId).maybeSingle();
 if(adminError||!admin)return reply({error:"admin_forbidden"},403);
 let body:Record<string,unknown>={};
 try {body=await request.json();if(!body||typeof body!=="object"||Array.isArray(body))throw Error("not_object")}
 catch{return reply({error:"invalid_request"},400)}
 const action=body.action;
 if(action==="health")return reply({admin:true,scope:"web"});
 if(action==="set_premium_global"){
   if(!isInt(body.daily_limit,0,100))return reply({error:"invalid_premium_limit"},400);
   const {error}=await db.from("picgift_premium_settings").update({daily_limit:body.daily_limit,updated_at:new Date().toISOString()}).eq("singleton",true);
   return error?reply({error:"save_failed"},503):reply({ok:true});
 }
 if(action==="set_premium_user"){
   const userId=String(body.user_id||"");
   if(!/^[a-f0-9-]{36}$/i.test(userId)||!(body.daily_limit===null||isInt(body.daily_limit,0,100)))return reply({error:"invalid_premium_limit"},400);
   const {data:target,error:targetError}=await db.auth.admin.getUserById(userId);
   if(targetError||!target.user)return reply({error:"user_not_found"},404);
   const result=body.daily_limit===null
    ?await db.from("picgift_premium_user_limits").delete().eq("user_id",userId)
    :await db.from("picgift_premium_user_limits").upsert({user_id:userId,daily_limit:body.daily_limit,updated_at:new Date().toISOString()},{onConflict:"user_id"});
   return result.error?reply({error:"save_failed"},503):reply({ok:true});
 }
 if(action==="list"){
   const users:Array<{id:string,email:string,confirmed:boolean,created_at:string}>=[];
   for(let page=1;page<=5;page++){
     const {data,error}=await db.auth.admin.listUsers({page,perPage:200});
     if(error)return reply({error:"list_users_failed"},503);
     for(const u of data?.users||[]){
       users.push({id:u.id,email:u.email||"",confirmed:!!u.email_confirmed_at,created_at:u.created_at||""});
     }
     if((data?.users||[]).length<200)break;
   }
   const [limits,pilots,settings,usage]=await Promise.all([
     db.from("picgift_free_user_limits").select("user_id,daily_limit,enabled,updated_at"),
     db.from("picgift_ai_pilot_users").select("user_id"),
     db.from("picgift_free_settings").select("global_daily_limit,default_user_daily_limit,enabled").eq("singleton",true).single(),
     db.from("picgift_free_usage").select("user_id,state").eq("day_utc",today())
   ]);
   if(limits.error||pilots.error||settings.error||usage.error)
     return reply({error:"settings_unavailable"},503);
   const [premiumSettings,premiumLimits]=await Promise.all([
     db.from("picgift_premium_settings").select("daily_limit").eq("singleton",true).single(),
     db.from("picgift_premium_user_limits").select("user_id,daily_limit")
   ]);
   if(premiumSettings.error||premiumLimits.error)return reply({error:"premium_settings_unavailable"},503);
   const premiumMap=new Map((premiumLimits.data||[]).map((r:any)=>[r.user_id,r.daily_limit]));
   const limitsMap=new Map((limits.data||[]).map((r:any)=>[r.user_id,r]));
   const pilotsSet=new Set((pilots.data||[]).map((r:any)=>r.user_id));
   const todayCounts=new Map<string,number>();
   const total=(usage.data||[]).length;
   for(const r of usage.data||[]){
      if(r.state==="failed")continue;
      todayCounts.set(r.user_id,(todayCounts.get(r.user_id)||0)+1);
   }
   return reply({
     admin:true,utc_day:today(), settings:settings.data,premium_settings:premiumSettings.data,global_used:total,
     users:users.map(u=>{
       const record:any=limitsMap.get(u.id);
       return {...u,is_pilot:pilotsSet.has(u.id),has_override:!!record,premium_daily_limit:premiumMap.get(u.id)??null,
         daily_limit:record?.daily_limit??settings.data.default_user_daily_limit,
         enabled:record?.enabled??false,used_today:todayCounts.get(u.id)||0};
     })
   });
 }
 if(action==="set_user"){
   const userId=String(body.user_id||"");
   if(!/^[a-f0-9-]{36}$/i.test(userId) || !isInt(body.daily_limit,0,20) || typeof body.enabled!=="boolean")
     return reply({error:"invalid_user_settings"},400);
   const {data:target,error:targetError}=await db.auth.admin.getUserById(userId);
   if(targetError||!target.user)return reply({error:"user_not_found"},404);
   const {error}=await db.from("picgift_free_user_limits").upsert({
     user_id:userId,daily_limit:body.daily_limit,enabled:body.enabled,updated_at:new Date().toISOString()
   },{onConflict:"user_id"});
   if(error)return reply({error:"save_failed"},503);
   return reply({ok:true});
 }
 if(action==="set_global"){
   if(!isInt(body.global_daily_limit,0,48)||!isInt(body.default_user_daily_limit,0,20))
     return reply({error:"invalid_global_settings"},400);
   // Do not expose a switch that bypasses the unfinished integration.
   const {error}=await db.from("picgift_free_settings").update({
      global_daily_limit:body.global_daily_limit,
      default_user_daily_limit:body.default_user_daily_limit,
      updated_at:new Date().toISOString()
   }).eq("singleton",true);
   if(error)return reply({error:"save_failed"},503);
   return reply({ok:true});
 }
 return reply({error:"unknown_action"},400);
});
