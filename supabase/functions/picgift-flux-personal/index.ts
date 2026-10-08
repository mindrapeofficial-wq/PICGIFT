import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.57.4";

const URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const db=createClient(URL,SERVICE,{auth:{persistSession:false,autoRefreshToken:false}});
const cors={"Access-Control-Allow-Origin":"https://picgift.onrender.com","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:cors});
const MODEL="@cf/black-forest-labs/flux-2-klein-4b";
const TAG="cloudflare-flux-2-klein-4b";
const SCENES=["halloween-potions","halloween-autumn-arch","halloween-pumpkin-bench","halloween-lantern-street"];
const POSES:Record<string,string[]>={"halloween-potions":["De pie tras el caldero"],"halloween-autumn-arch":["De pie"],"halloween-pumpkin-bench":["Sentado en el banco"],"halloween-lantern-street":["De pie"]};
const OUTFITS=["Automático para la escena","Brujita de cuento","Pequeño mago","Conservar ropa original"];
const SIZES:Record<string,[number,number]>={square:[1024,1024],vertical:[1024,1536],horizontal:[1536,1024]};
const safe=(value:unknown,max=100)=>typeof value==="string"?value.slice(0,max).trim():"";
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function jpegDimensions(bytes:Uint8Array):[number,number]|null{
 if(bytes.length<32||bytes[0]!==255||bytes[1]!==216)return null;
 let i=2;
 while(i+9<bytes.length){
  if(bytes[i]!==255)return null;
  const marker=bytes[i+1];i+=2;
  if(marker===217||marker===218)break;
  if(marker===255||marker===1||marker>=208&&marker<=215)continue;
  if(i+2>bytes.length)return null;
  const n=(bytes[i]<<8)|bytes[i+1];
  if(n<2||i+n>bytes.length)return null;
  if([192,193,194,195,198,199,201,202,203,205,206,207].includes(marker)){
   if(n<7)return null;
   return [(bytes[i+5]<<8)|bytes[i+6],(bytes[i+3]<<8)|bytes[i+4]];
  }
  i+=n;
 }
 return null;
}
function b64bytes(base64:string):Uint8Array{
 const trimmed=base64.replace(/^data:image\/(png|jpeg);base64,/,"");
 if(trimmed.length<2000||trimmed.length>15_000_000||!/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed))throw Error("provider_invalid_image");
 return Uint8Array.from(atob(trimmed),char=>char.charCodeAt(0));
}
async function preview(path:string):Promise<Blob>{
 const {data,error}=await db.storage.from("picgift-uploads").download(path);
 if(error||!data||data.size>550000||data.size<1000||data.type!=="image/jpeg")throw Error("source_invalid");
 const bytes=new Uint8Array(await data.arrayBuffer());
 const size=jpegDimensions(bytes);
 if(!size||size[0]>511||size[1]>511||size[0]<64||size[1]<64)throw Error("reference_invalid");
 return new Blob([bytes],{type:"image/jpeg"});
}
async function mark(id:string,owner:string,status:string,extra:Record<string,unknown>={}){
 const {error}=await db.from("picgift_photo_jobs").update({status,...extra,updated_at:new Date().toISOString()}).eq("id",id).eq("user_id",owner);
 if(error)throw Error("job_update_failed");
}
async function generate(id:string,owner:string){
 let phase="queued";
 try{
  const {data:job,error:jobError}=await db.from("picgift_photo_jobs").select("*").eq("id",id).eq("user_id",owner).eq("image_model",TAG).single();
  if(jobError||!job||job.status!=="queued"||!job.processing_consent||!job.is_test)throw Error("job_not_authorized");
  const {data:cfg}=await db.from("picgift_flux_beta_config").select("enabled").eq("singleton",true).single();
  if(cfg?.enabled!==true)throw Error("flux_disabled");
  const {data:scene}=await db.from("picgift_scene_recipes").select("recipe,enabled").eq("scene_id",job.scene_id).single();
  if(!scene?.enabled||!safe(scene.recipe?.flux_prompt,3500))throw Error("scene_unavailable");
  phase="analyzing";await mark(id,owner,phase);
  const paths=job.reference_paths||{};
  const subject=await preview(paths.flux_subject);
  const backdrop=await preview(paths.flux_scene);
  const extras:Blob[]=[];
  for(const kind of ["flux_face","flux_body"])if(paths[kind])extras.push(await preview(paths[kind]));
  const prompt=[
   "Create a realistic professional family portrait photograph from supplied reference images.",
   "Input image 0 is the specific person; retain their visible face structure, eyes, nose, mouth, hairstyle, skin tone, age appearance and realistic body proportions as faithfully as possible.",
   "Input image 1 is the authorized seasonal set to recreate in perspective, architectural layout, lighting and detail.",
   extras.length?"Any additional input images of the same person are supporting face/body references, never extra people.":"",
   "Place that same person believably in the following scene:",safe(scene.recipe.flux_prompt,3500),
   "Desired pose:",safe(job.requested_pose,90),"Wardrobe:",safe(job.requested_outfit,90),
   "Maintain photorealism, anatomically correct hands, natural head-body scaling, grounded feet or seated contact shadows, natural neutral-balanced skin color. Avoid face swapping artifacts, extra limbs, deformed fingers, illustrations, text, watermarks or logos.",
   "Do not invent extra people. This is an editorially directed family photograph."
  ].filter(Boolean).join(" ");
  if(prompt.length>7500)throw Error("prompt_invalid");
  phase="generating";await mark(id,owner,phase);
  const form=new FormData();form.set("prompt",prompt);
  const [width,height]=SIZES[job.requested_format]||SIZES.square;
  form.set("width",String(width));form.set("height",String(height));
  for(const [idx,img] of [subject,backdrop,...extras].entries())form.set("input_image_"+idx,new File([img],"reference-"+idx+".jpg",{type:"image/jpeg"}));
  const account=Deno.env.get("CLOUDFLARE_ACCOUNT_ID")||"";
  const token=Deno.env.get("CLOUDFLARE_API_TOKEN")||"";
  if(!/^[a-f0-9]{32}$/i.test(account)||!token)throw Error("cloudflare_unavailable");
  const response=await fetch("https://api.cloudflare.com/client/v4/accounts/"+account+"/ai/run/"+MODEL,{
   method:"POST",headers:{Authorization:"Bearer "+token.trim()},body:form,signal:AbortSignal.timeout(85000)
  });
  if(!response.ok){console.error("PICGIFT_FLUX_EDIT_HTTP",response.status);throw Error(response.status===429?"cloudflare_rate_limit":"cloudflare_unavailable")}
  const body=await response.json();
  if(body.success===false)throw Error("cloudflare_unavailable");
  const bytes=b64bytes(body?.result?.image||body?.image||"");
  const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71;
  const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  if(!png&&!jpg)throw Error("provider_invalid_image");
  phase="reviewing";await mark(id,owner,phase);
  const resultPath=owner+"/"+id+"/final."+(png?"png":"jpg");
  const {error:uploadError}=await db.storage.from("picgift-generated").upload(resultPath,bytes,{contentType:png?"image/png":"image/jpeg",cacheControl:"0",upsert:false});
  if(uploadError)throw Error("storage_error");
  // No result is released until an administrator has actually inspected fidelity and safety.
  await mark(id,owner,"needs_review",{result_path:resultPath,result_quality:"unverified"});
  await db.from("picgift_flux_free_usage").update({status:"completed"}).eq("job_id",id).eq("user_id",owner);
  console.log("PICGIFT_FLUX_JOB_PENDING_REVIEW",id);
 }catch(error){
  const reason=error instanceof Error?error.message:"unexpected_error";
  const codes=["source_invalid","reference_invalid","scene_unavailable","cloudflare_unavailable","cloudflare_rate_limit","provider_invalid_image","storage_error","flux_disabled"];
  const failure=codes.includes(reason)?reason:"unexpected_error";
  console.error("PICGIFT_FLUX_JOB_FAILED",id,phase,failure);
  await db.from("picgift_photo_jobs").update({status:"failed",failure_stage:phase,failure_code:failure,failure_message:"No se pudo completar el retrato.",updated_at:new Date().toISOString()}).eq("id",id).eq("user_id",owner).in("status",["queued","analyzing","generating","reviewing"]);
  await db.from("picgift_flux_free_usage").update({status:"failed"}).eq("job_id",id).eq("user_id",owner);
 }
}
Deno.serve(async request=>{
 if(request.method==="OPTIONS")return new Response(null,{headers:cors});
 if(request.method!=="POST")return reply({error:"method_not_allowed"},405);
 if(!URL||!SERVICE)return reply({error:"service_unavailable"},503);
 const token=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
 if(!token)return reply({error:"login_required"},401);
 const {data:auth,error:authError}=await db.auth.getUser(token);
 if(authError||!auth.user?.id||!auth.user.email_confirmed_at)return reply({error:"invalid_session"},401);
 const user=auth.user;
 const {data:pilot,error:pilotError}=await db.from("picgift_ai_pilot_users").select("user_id").eq("user_id",user.id).maybeSingle();
 if(pilotError)return reply({error:"service_unavailable"},503);
 let body:any={};
 try{body=await request.json();if(!body||typeof body!=="object"||Array.isArray(body))throw Error("invalid")}catch{return reply({error:"invalid_request"},400)}
 const action=safe(body.action,20)||"health";
 if(action==="list_reviews"){
  const {data:admin}=await db.from("picgift_admin_users").select("user_id").eq("user_id",user.id).maybeSingle();
  if(!admin)return reply({error:"admin_forbidden"},403);
  const {data,error}=await db.from("picgift_photo_jobs")
   .select("id,scene_id,status,created_at,result_quality")
   .eq("image_model",TAG).eq("status","needs_review")
   .order("created_at",{ascending:true}).limit(40);
  return error?reply({error:"review_list_unavailable"},503):reply({jobs:data||[],quality_review_required:true});
 }
 if(action==="review"){
  const {data:admin}=await db.from("picgift_admin_users").select("user_id").eq("user_id",user.id).maybeSingle();
  if(!admin)return reply({error:"admin_forbidden"},403);
  const id=safe(body.job_id,36);
  if(!uuid.test(id))return reply({error:"invalid_job"},400);
  const {data:job}=await db.from("picgift_photo_jobs").select("id,user_id,result_path,status,image_model").eq("id",id).eq("image_model",TAG).single();
  if(!job||job.status!=="needs_review"||!job.result_path)return reply({error:"job_not_reviewable"},404);
  if(body.decision==="preview"){
   const {data,error}=await db.storage.from("picgift-generated").createSignedUrl(job.result_path,600);
   return error?reply({error:"preview_unavailable"},503):reply({url:data.signedUrl,expires_seconds:600});
  }
  if(!["approve","reject"].includes(body.decision)||body.confirmed!==true)return reply({error:"explicit_review_required"},400);
  const approved=body.decision==="approve";
  const {error}=await db.from("picgift_photo_jobs").update({status:approved?"completed":"failed",result_quality:approved?"passed":"needs_review",failure_code:approved?null:"quality_rejected",failure_stage:approved?null:"reviewing",updated_at:new Date().toISOString()}).eq("id",id).eq("status","needs_review").eq("image_model",TAG);
  return error?reply({error:"review_failed"},503):reply({ok:true,approved});
 }
 if(!pilot)return reply({available:false,pilot:false,error:"restricted_to_testers"},403);
 const {data:config,error:configError}=await db.from("picgift_flux_beta_config").select("enabled,per_tester_daily_limit,daily_estimated_neuron_budget").eq("singleton",true).single();
 const {data:campaign}=await db.from("picgift_campaign_state").select("active_campaign").eq("singleton",true).single();
 const {count:scenesCount}=await db.from("picgift_scene_recipes").select("scene_id",{count:"exact",head:true}).eq("enabled",true).in("scene_id",SCENES);
 const account=Deno.env.get("CLOUDFLARE_ACCOUNT_ID")||"";
 const available=!configError&&config?.enabled===true&&campaign?.active_campaign==="halloween"&&scenesCount===4&&/^[a-f0-9]{32}$/i.test(account)&&!!Deno.env.get("CLOUDFLARE_API_TOKEN");
 if(action==="health")return reply({available,pilot:true,free_beta:true,engine:"FLUX.2 Klein 4B",references_supported:true,email_available:false,quality_review:true,remaining_daily_limit:config?.per_tester_daily_limit||0});
 if(action!=="start")return reply({error:"unknown_action"},400);
 if(!available)return reply({error:"La prueba de retratos aún no está activada. No se ha procesado ninguna fotografía."},503);
 if(body.consent!==true||body.guardian_consent!==true)return reply({error:"Se requiere autorización expresa del adulto responsable de la fotografía y del menor, si lo hay."},400);
 if(body.email_requested===true)return reply({error:"La entrega por correo no está disponible en esta beta."},400);
 const scene=safe(body.scene_id,60),format=safe(body.format,15),pose=safe(body.pose,90),outfit=safe(body.outfit,90),source=safe(body.source_path,180);
 if(!SCENES.includes(scene)||!SIZES[format]||!POSES[scene]?.includes(pose)||!OUTFITS.includes(outfit))return reply({error:"Escenario o ajustes no permitidos."},400);
 const prefix=user.id+"/",parts=source.split("/");
 if(parts.length!==3||parts[0]!==user.id||!uuid.test(parts[1])||!/^source\.(jpg|png|webp)$/.test(parts[2]))return reply({error:"Ruta de foto incorrecta."},400);
 const folder=parts[0]+"/"+parts[1];
 const refs=body.reference_paths;
 if(!refs||typeof refs!=="object"||Array.isArray(refs)||Object.keys(refs).some(k=>!["flux_subject","flux_scene","flux_face","flux_body"].includes(k)))return reply({error:"Referencias inválidas."},400);
 for(const kind of ["flux_subject","flux_scene"]){if(refs[kind]!==folder+"/"+kind.replace("_","-")+".jpg")return reply({error:"Faltan referencias privadas."},400)}
 for(const kind of ["flux_face","flux_body"]){if(refs[kind]&&refs[kind]!==folder+"/"+kind.replace("_","-")+".jpg")return reply({error:"Ruta de referencia no permitida."},400)}
 const {data:objects,error:storageError}=await db.storage.from("picgift-uploads").list(folder,{limit:20});
 const required=[parts[2],...Object.values(refs).map(v=>String(v).split("/").pop())];
 if(storageError||!objects||required.some(name=>!objects.some(o=>o.name===name)))return reply({error:"Sube antes las referencias de la fotografía."},400);
 const {data:recipe}=await db.from("picgift_scene_recipes").select("enabled,recipe").eq("scene_id",scene).single();
 if(!recipe?.enabled||!safe(recipe.recipe?.flux_prompt,3500))return reply({error:"Escenario no preparado para FLUX."},400);
 const {data:existing}=await db.from("picgift_photo_jobs").select("id,status").eq("user_id",user.id).eq("source_path",source).eq("image_model",TAG).maybeSingle();
 if(existing)return reply({id:existing.id,status:existing.status,already_submitted:true},200);
 const {data:ongoing}=await db.from("picgift_photo_jobs").select("id").eq("user_id",user.id).in("status",["queued","analyzing","generating","reviewing"]).limit(1);
 if(ongoing?.length)return reply({error:"Espera a que termine tu retrato anterior."},429);
 const {data:job,error:insertError}=await db.from("picgift_photo_jobs").insert({
   user_id:user.id,scene_id:scene,source_path:source,reference_paths:refs,
   requested_format:format,requested_pose:pose,requested_outfit:outfit,
   processing_consent:true,consent_at:new Date().toISOString(),
   status:"queued",is_test:true,image_model:TAG,email_requested:false,email_status:"not_requested",
   request_language:body.request_language==="en"?"en":"es"
 }).select("id").single();
 if(insertError||!job)return reply({error:"No se pudo registrar la solicitud."},409);
 const {data:claimed,error:quotaError}=await db.rpc("picgift_claim_flux_free_photo",{p_user:user.id,p_job:job.id,p_format:format});
 if(quotaError||claimed?.accepted!==true){
  await mark(job.id,user.id,"failed",{failure_code:"flux_quota_exceeded",failure_stage:"queued",failure_message:"Se agotó la cuota gratuita de pruebas."});
  return reply({error:"Se alcanzó el límite gratuito de intentos de hoy (o el presupuesto compartido). No se ha generado ninguna foto."},429);
 }
 EdgeRuntime.waitUntil(generate(job.id,user.id));
 return reply({id:job.id,status:"queued",review_required:true},202);
});
