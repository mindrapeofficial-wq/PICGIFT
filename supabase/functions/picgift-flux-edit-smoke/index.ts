import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.57.4";

// Pilot-only, TWO IMAGE compositing smoke-test with FICTIONAL sample photos.
// Independent of the personal-photo beta switch, to verify before enabling it.
const url=Deno.env.get("SUPABASE_URL")||"";
const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
const cors={
 "Access-Control-Allow-Origin":"https://picgift.onrender.com",
 "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info",
 "Access-Control-Allow-Methods":"POST,OPTIONS",
 "Content-Type":"application/json; charset=utf-8",
 "Cache-Control":"no-store"
};
const reply=(v:unknown,s=200)=>new Response(JSON.stringify(v),{status:s,headers:cors});
const model="@cf/black-forest-labs/flux-2-klein-4b";
function dimensions(b:Uint8Array):[number,number]|null{
 if(b.length<32||b[0]!==255||b[1]!==216)return null;
 let i=2;
 while(i+9<b.length){
  if(b[i]!==255)return null;
  const m=b[i+1];i+=2;
  if(m===217||m===218)break;
  if(m===255||m===1||(m>=208&&m<=215))continue;
  if(i+2>b.length)return null;
  const n=(b[i]<<8)|b[i+1];
  if(n<2||i+n>b.length)return null;
  if([192,193,194,195,198,199,201,202,203,205,206,207].includes(m)){
   if(n<7)return null;
   return [(b[i+5]<<8)|b[i+6],(b[i+3]<<8)|b[i+4]];
  }
  i+=n;
 }
 return null;
}
function input(data:unknown):Uint8Array{
 if(typeof data!=="string"||data.length<1200||data.length>750000||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(data))throw Error("invalid_test_reference");
 const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));
 const d=dimensions(bytes);
 if(!d||d[0]<64||d[1]<64||d[0]>511||d[1]>511||bytes.length>550000)throw Error("invalid_test_reference_dimensions");
 return bytes;
}
function output(data:unknown):{mime:string,base64:string}{
 if(typeof data!=="string")throw Error("provider_invalid_image");
 const b64=data.replace(/^data:image\/(png|jpeg);base64,/,"");
 if(b64.length<2000||b64.length>15000000||!/^[A-Za-z0-9+/]+={0,2}$/.test(b64))throw Error("provider_invalid_image");
 const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
 const mime=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71?"image/png":
  bytes[0]===255&&bytes[1]===216&&bytes[2]===255?"image/jpeg":null;
 if(!mime)throw Error("provider_invalid_image");
 return {mime,base64:b64};
}
Deno.serve(async request=>{
 if(request.method==="OPTIONS")return new Response(null,{headers:cors});
 if(request.method!=="POST")return reply({error:"method_not_allowed"},405);
 if(!url||!service)return reply({error:"service_unavailable"},503);
 const jwt=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
 if(!jwt)return reply({error:"login_required"},401);
 const {data:auth,error:authError}=await db.auth.getUser(jwt);
 if(authError||!auth?.user?.id||!auth.user.email_confirmed_at)return reply({error:"invalid_session"},401);
 const userId=auth.user.id;
 const {data:admin,error:adminError}=await db.from("picgift_admin_users").select("user_id").eq("user_id",userId).maybeSingle();
 const {data:pilot,error:pilotError}=await db.from("picgift_ai_pilot_users").select("user_id").eq("user_id",userId).maybeSingle();
 if(adminError||pilotError)return reply({error:"service_unavailable"},503);
 if(!admin||!pilot)return reply({error:"admin_pilot_only"},403);
 const cfAccount=Deno.env.get("CLOUDFLARE_ACCOUNT_ID")||"";
 const cfToken=(Deno.env.get("CLOUDFLARE_API_TOKEN")||"").trim();
 const configured=/^[a-f0-9]{32}$/i.test(cfAccount)&&!!cfToken;
 const {count}=await db.from("picgift_flux_edit_smoke_attempts").select("id",{head:true,count:"exact"}).eq("user_id",userId);
 let body:any={};
 try{
  if(Number(request.headers.get("content-length")||0)>1600000)return reply({error:"request_too_large"},413);
  body=await request.json();
 }catch{return reply({error:"invalid_request"},400)}
 if(!body||typeof body!=="object"||Array.isArray(body))return reply({error:"invalid_request"},400);
 if(body.action==="health")return reply({available:configured,remaining:Math.max(0,2-(count||0)),sample_only:true,personal_photos_enabled:false});
 if(body.action!=="run")return reply({error:"unknown_action"},400);
 if(!configured)return reply({error:"cloudflare_not_configured"},503);
 if(body.confirm_fictional_samples!==true)return reply({error:"fictional_sample_confirmation_required"},400);
 let subject:Uint8Array,scene:Uint8Array;
 try{subject=input(body.subject_b64);scene=input(body.scene_b64)}catch{return reply({error:"invalid_test_reference"},400)}
 const {data:attempt,error:claimError}=await db.rpc("picgift_claim_flux_edit_smoke",{p_user:userId});
 if(claimError||!attempt)return reply({error:"edit_smoke_limit_reached"},429);
 let resultStatus="failed";
 try{
  const form=new FormData();
  form.set("prompt","Create a photorealistic Halloween fine-art studio composite. Image 0 contains a FICTIONAL child model whose visible facial characteristics, age appearance, proportions and expression should remain as faithful as possible. Image 1 provides the autumn magic workshop set, lighting, perspective and props. Place the SAME fictional model naturally within that scene, with normal hands and limbs, natural contact shadows and consistent illumination. Do not invent extra people. No text, logos, CGI or cartoons.");
  form.set("width","1024");form.set("height","1536");
  form.set("input_image_0",new File([subject],"fictional-subject.jpg",{type:"image/jpeg"}));
  form.set("input_image_1",new File([scene],"official-scene.jpg",{type:"image/jpeg"}));
  const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${cfAccount}/ai/run/${model}`,{
   method:"POST",headers:{Authorization:"Bearer "+cfToken},body:form,signal:AbortSignal.timeout(90000)
  });
  if(!response.ok){
   console.error("PICGIFT_FLUX_EDIT_SMOKE_HTTP",response.status);
   return reply({error:response.status===429?"provider_rate_limit":"provider_unavailable"},502);
  }
  const payload=await response.json();
  if(payload?.success===false)return reply({error:"provider_unavailable"},502);
  const img=output(payload?.result?.image??payload?.image);
  resultStatus="completed";
  return reply({ok:true,sample_only:true,personal_photos_enabled:false,model:"FLUX.2 Klein 4B",image:`data:${img.mime};base64,${img.base64}`});
 }catch(e){
  console.error("PICGIFT_FLUX_EDIT_SMOKE_FAILED",e instanceof Error?e.name:"UnknownError");
  return reply({error:"provider_connection_error"},503);
 }finally{
  await db.from("picgift_flux_edit_smoke_attempts").update({status:resultStatus}).eq("id",attempt).eq("user_id",userId);
 }
});
