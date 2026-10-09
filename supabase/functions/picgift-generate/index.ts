import { buildPortraitPrompt } from "../_shared/portrait-prompt.ts";
import { assessPhoto } from "../_shared/photo-preflight.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
const url=Deno.env.get("SUPABASE_URL")||"";
const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
const cors={"Access-Control-Allow-Origin":"https://picgift.onrender.com","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json","Cache-Control":"no-store"};
const respond=(v:unknown,s=200)=>new Response(JSON.stringify(v),{status:s,headers:cors});
const formats:Record<string,string>={vertical:"1024x1536",horizontal:"1536x1024"};
const MODELS=["gpt-image-2.5-sunburst","gpt-image-2.5-flare"] as const;
function imageModel(){const value=Deno.env.get("PICGIFT_IMAGE_MODEL")||MODELS[0];return MODELS.includes(value as typeof MODELS[number])?value:MODELS[0]}
function imageQuality(){const quality=Deno.env.get("PICGIFT_IMAGE_QUALITY")||"high";return ["medium","high","xhigh","max"].includes(quality)?quality:"high"}
async function pilotAllowed(user:any):Promise<boolean>{
 if(!user?.id||!user?.email_confirmed_at)return false;
 const email=String(user.email||"").toLowerCase().trim();
 const allow=(Deno.env.get("PICGIFT_PILOT_EMAILS")||"").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
 if(email&&allow.includes(email))return true;
 const {data,error}=await db.from("picgift_ai_pilot_users").select("user_id").eq("user_id",user.id).maybeSingle();
 if(error){console.error("PICGIFT_PILOT_ACCESS_CHECK_FAILED");return false}
 return !!data;
}
function publicAllowed(){return Deno.env.get("PICGIFT_PUBLIC_GENERATION_ENABLED")==="true"&&Deno.env.get("PICGIFT_SALES_ENABLED")==="true"}
async function engineReady(user:any){return Boolean(Deno.env.get("OPENAI_API_KEY")&&Deno.env.get("PICGIFT_GENERATION_ENABLED")==="true"&&(await pilotAllowed(user)||publicAllowed()))}

const allowedPoses:Record<string,string[]>={
"golden-christmas":["Sentado sobre madera","De pie"],
"reading-corner":["Sentado leyendo"],
"santa-workshop":["Sentado trabajando","De pie"],
"christmas-armchair":["Sentado en sillón","De pie junto al árbol"],
"white-door":["Sentado sobre el baúl","De pie junto a baúl"],
"winter-window":["Asomado a la ventana","Sentado delante"],
"cozy-cabinet":["Sentado en suelo","Tumbado sobre manta","De pie"]
};
Object.assign(allowedPoses,{"halloween-potions":["De pie tras el caldero"],"halloween-autumn-arch":["De pie"],"halloween-pumpkin-bench":["Sentado en el banco"],"halloween-lantern-street":["De pie"]});
const halloweenOutfits=["Automático para la escena","Brujita de cuento","Pequeño mago","Conservar ropa original"];
const allowedOutfits=["Automático para la escena","Invierno elegante","Navidad clásica","Pequeño elfo"];
async function classifiedOpenAiError(response:Response):Promise<string>{
 let code="",message="";
 try{const b=await response.json();code=String(b?.error?.code||b?.error?.type||"").toLowerCase();message=String(b?.error?.message||"").toLowerCase().slice(0,220)}catch{}
 if(/insufficient_quota|billing_hard_limit|payment_required|credit_balance/.test(code+" "+message))return "openai_billing";
 if(/model_not_found|does not exist|no access to model/.test(code+" "+message))return "openai_model_access";
 if(/verification|verify your organization|verify organization/.test(code+" "+message))return "openai_verification";
 if(response.status===401)return "openai_invalid_key";
 if(response.status===403)return "openai_access";
 if(response.status===429)return "openai_rate_limit";
 if(response.status>=500)return "openai_unavailable";
 return "openai_request";
}

const safe=(v:unknown,m=90)=>typeof v==="string"?v.slice(0,m).replace(/[<>]/g,"").trim():"";
function b64(data:Uint8Array){let chars="";for(let i=0;i<data.length;i+=8192)chars+=String.fromCharCode(...data.subarray(i,i+8192));return btoa(chars)}
function un64(s:string){return Uint8Array.from(atob(s),c=>c.charCodeAt(0))}
function words(p:any){return p?.output?.flatMap((x:any)=>(x.content||[]).map((c:any)=>c.text||"")).join("")||p?.output_text||""}
async function analyze(bytes:Uint8Array,mime:string,key:string,references:Array<{kind:string,blob:Blob}>=[]){
 const context=await Promise.all(references.map(async ref=>({type:"input_image",image_url:"data:"+ref.blob.type+";base64,"+b64(new Uint8Array(await ref.blob.arrayBuffer())),detail:"high"})));
 const req={model:"gpt-4.1-mini",store:false,max_output_tokens:750,text:{format:{type:"json_object"}},input:[{role:"user",content:[
 {type:"input_text",text:"Analyze only VISIBLE photographic attributes for a faithful family studio portrait. Image 1 is the primary portrait. Subsequent references in order are: "+references.map(r=>r.kind).join(",")+". Face references provide visible facial detail; body references provide posture and proportions, not extra subjects. Do not identify people or infer sensitive traits. Return ONLY a JSON object: visible_subjects (integer from image 1), stage (baby/toddler/child/adult/unknown), face (visible eye shape, nose, lips, mouth, expression, head shape, hair texture), pose, body_visibility, clothing, orientation, lighting, occlusions, anatomy_precautions, body_proportions (only visible relative head/torso/limbs proportions; null when uncertain), head_alignment (roll/yaw/pitch qualitatively), reference_observations (per reference: visible details, limitations), source_quality (sharpness, exposure, cropping, recommended corrections). Do not invent unseen anatomy, measurements or exact real-world dimensions. Respect perspective, foreshortening and uncertainty."},
 {type:"input_image",image_url:"data:"+mime+";base64,"+b64(bytes),detail:"high"},...context]}]};
 const res=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify(req),signal:AbortSignal.timeout(45000)});
 if(!res.ok){const code=await classifiedOpenAiError(res);console.error("PICGIFT_ANALYSIS_HTTP",res.status,code);throw new Error(code)}
 try{
  const text=words(await res.json()).trim().replace(/^\`\`\`(?:json)?\s*|\s*\`\`\`$/gi,"");
  const traits=JSON.parse(text);if(!traits||typeof traits!=="object")throw Error("bad_analysis");
  return traits;
 }catch{throw new Error("Análisis visual incompleto")}
}
async function edit(subject:Blob,scene:Blob,prompt:string,size:string,key:string,references:Array<{kind:string,blob:Blob}>=[]){
 const form=new FormData();form.append("model",imageModel());form.append("prompt",prompt);form.append("quality",imageQuality());form.append("size",size);form.append("output_format","jpeg");form.append("output_compression","85");
 form.append("image[]",new File([subject],"portrait.jpg",{type:subject.type}));
 form.append("image[]",new File([scene],"scene.jpg",{type:scene.type}));
 for(const ref of references)form.append("image[]",new File([ref.blob],"reference-"+ref.kind+".jpg",{type:ref.blob.type}));
 const res=await fetch("https://api.openai.com/v1/images/edits",{method:"POST",headers:{"Authorization":"Bearer "+key},body:form,signal:AbortSignal.timeout(170000)});
 if(!res.ok){const code=await classifiedOpenAiError(res);console.error("PICGIFT_EDIT_HTTP",res.status,code);throw new Error(code)}
 const body=await res.json();const img=body?.data?.[0]?.b64_json;
 if(!img)throw new Error("Generador sin imagen");return un64(img);
}
async function qualityCheck(subject:Uint8Array,result:Uint8Array,mime:string,key:string){
 const body={model:"gpt-4.1-mini",store:false,max_output_tokens:20,input:[{role:"user",content:[
 {type:"input_text",text:"Evaluate the second photo relative to the first photo. Does the edited photo contain obvious extra fingers or arms, very distorted anatomy, changed face proportions/expression, or an unsafe infant pose? Do NOT identify the person. Reply exactly PASS or REVIEW. Respond REVIEW for obvious flaws including unrealistic head/body scale, changed facial features, plastic skin, inconsistent eye gaze, severe changed expression, disconnected limbs, implausible support, or clearly inconsistent contact shadows."},
 {type:"input_image",image_url:"data:"+mime+";base64,"+b64(subject),detail:"low"},
 {type:"input_image",image_url:"data:image/jpeg;base64,"+b64(result),detail:"low"}]}]};
 try{const res=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(26000)});if(!res.ok)return "unverified";const verdict=words(await res.json()).trim().toUpperCase();return verdict==="PASS"?"passed":verdict==="REVIEW"?"needs_review":"unverified"}catch{return "unverified"}
}
async function mail(recipient:string,scene:string,path:string,language="es"){
 const key=Deno.env.get("RESEND_API_KEY"),from=Deno.env.get("PICGIFT_FROM_EMAIL");if(!key||!from||!recipient)return "skipped";
 const {data,error}=await db.storage.from("picgift-generated").createSignedUrl(path,86400);
 if(error||!data?.signedUrl)return "failed";
 const link=data.signedUrl.replaceAll("&","&amp;");
 const spanishHtml='<div style="font-family:Arial,sans-serif;background:#241b17;color:#f8f2e7;padding:32px"><h1>Tu foto PICGIFT está lista</h1><p>Tu retrato de cuento ya está disponible en tu cuenta.</p><p><a href="'+link+'" style="color:#efd4a3">Ver y descargar con enlace privado (24 horas)</a></p><p>Tus recuerdos empiezan aquí.</p></div>';
 const englishHtml='<div style="font-family:Arial,sans-serif;background:#241b17;color:#f8f2e7;padding:32px"><h1>Your PICGIFT photo is ready</h1><p>Your storybook portrait is available in your account.</p><p><a href="'+link+'" style="color:#efd4a3">View and download privately (24-hour link)</a></p><p>Your memories start here.</p></div>';
 const html=language==="en"?englishHtml:spanishHtml;
 try{const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({from,to:recipient,subject:language==="en"?"Your PICGIFT photo is ready":"Tu foto PICGIFT está lista",html}),signal:AbortSignal.timeout(15000)});return r.ok?"sent":"failed"}catch{return "failed"}
}
async function run(jobId:string,owner:string,email:string){
 const key=Deno.env.get("OPENAI_API_KEY");let phase="queued",isTest=false;
 try{
  if(!key)throw new Error("openai_invalid_key");
  const {data:j}=await db.from("picgift_photo_jobs").select("*").eq("id",jobId).eq("user_id",owner).single();
  if(!j||j.status!=="queued")return;
  isTest=j.is_test===true;
  if(!Deno.env.get("OPENAI_API_KEY")||Deno.env.get("PICGIFT_GENERATION_ENABLED")!=="true")throw new Error("IA no activada");
  if(j.is_test&&!await pilotAllowed({id:owner,email,email_confirmed_at:new Date().toISOString()}))throw new Error("Piloto no autorizado");
  const {data:recipe}=await db.from("picgift_scene_recipes").select("recipe,scene_image_url,enabled").eq("scene_id",j.scene_id).single();
  if(!recipe?.enabled)throw new Error("Escenario no disponible");
  phase="analyzing";
  await db.from("picgift_photo_jobs").update({status:"analyzing",updated_at:new Date().toISOString()}).eq("id",jobId);
  const {data:photo,error:photoError}=await db.storage.from("picgift-uploads").download(j.source_path);
  if(photoError||!photo||photo.size>15728640||!["image/jpeg","image/png","image/webp"].includes(photo.type))throw new Error("Archivo inválido");
  const raw=new Uint8Array(await photo.arrayBuffer());
  const references:Array<{kind:string,blob:Blob}>=[];
  for(const kind of ["face","body"]){const path=j.reference_paths?.[kind];if(!path)continue;const {data:blob,error}=await db.storage.from("picgift-uploads").download(path);if(error||!blob||blob.size>15728640||!["image/jpeg","image/png","image/webp"].includes(blob.type))throw Error("reference_invalid");references.push({kind,blob});}
  const traits=await analyze(raw,photo.type,key,references);
  if(!Number.isInteger(traits.visible_subjects)||traits.visible_subjects<1||traits.visible_subjects>4)throw new Error("No se detectó un grupo compatible");
  phase="generating";
  await db.from("picgift_photo_jobs").update({status:"generating",updated_at:new Date().toISOString()}).eq("id",jobId);
  const sceneURL=String(recipe.scene_image_url);
  if(!/^https:\/\/picgift\.onrender\.com\/assets\/(?:scenes|halloween\/backdrops)\/[a-z-]+\.(?:jpg|webp)$/.test(sceneURL))throw new Error("Escenario no verificado");
  const response=await fetch(sceneURL,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error("Escenario no accesible");
  const scene=await response.blob();
  const prompt=buildPortraitPrompt(recipe,traits,j,references);
  console.log("PICGIFT_JOB",jobId,"generate");
  const result=await edit(photo,scene,prompt,formats[j.requested_format],key,references);
  phase="reviewing";
  await db.from("picgift_photo_jobs").update({status:"reviewing",updated_at:new Date().toISOString()}).eq("id",jobId);
  const check=await qualityCheck(raw,result,photo.type,key);
  const resultPath=owner+"/"+jobId+"/final.jpg";
  const uploaded=await db.storage.from("picgift-generated").upload(resultPath,result,{contentType:"image/jpeg",cacheControl:"0",upsert:false});
  if(uploaded.error)throw new Error("No se pudo guardar la imagen");
  const status=check==="passed"?"completed":"needs_review";
  if(status==="needs_review"&&!j.is_test)await db.rpc("picgift_refund_failed_job",{p_user:owner,p_job:jobId});
  await db.from("picgift_photo_jobs").update({status,result_path:resultPath,result_quality:check,email_status:j.email_requested&&status==="completed"?"pending":"not_requested",updated_at:new Date().toISOString()}).eq("id",jobId);
  if(j.email_requested&&status==="completed"){
   const delivery=await mail(email,j.scene_id,resultPath,j.request_language);
   await db.from("picgift_photo_jobs").update({email_status:delivery,updated_at:new Date().toISOString()}).eq("id",jobId);
  }
  console.log("PICGIFT_JOB",jobId,status);
  }catch(e){
  const m=e instanceof Error?e.message:"";
  const codes=["openai_invalid_key","openai_rate_limit","openai_access","openai_billing","openai_model_access","openai_verification","openai_unavailable","openai_request","analysis_api_error","image_api_error","reference_invalid"];
  const code=codes.includes(m)?m:/Análisis visual incompleto/.test(m)?"analysis_incomplete":/Archivo inválido/.test(m)?"source_invalid":/Escenario/.test(m)?"scene_unavailable":/guardar la imagen/.test(m)?"storage_error":/AbortError|TimeoutError|timed out/.test(m)?"timeout":"unexpected_error";
  console.error("PICGIFT_JOB_FAILED",jobId,phase,code);
  await db.from("picgift_photo_jobs").update({status:"failed",failure_message:"No se pudo completar la fotografía. Puedes consultar el tipo de error en PICGIFT.",failure_code:code,failure_stage:phase,updated_at:new Date().toISOString()}).eq("id",jobId).eq("user_id",owner);
  if(!isTest)await db.rpc("picgift_refund_failed_job",{p_user:owner,p_job:jobId});
 }
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{headers:cors});
 if(req.method!=="POST")return respond({error:"Método no admitido"},405);
 if(!url||!service)return respond({error:"Servicio en configuración"},503);
 const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
 if(!token)return respond({error:"Inicia sesión para continuar."},401);
 const {data:auth,error:authError}=await db.auth.getUser(token);
 if(authError||!auth.user)return respond({error:"Sesión no válida"},401);
 let body:any;try{body=await req.json()}catch{return respond({error:"Solicitud inválida"},400)}
 const action=String(body?.action||"health");
 if(action==="health"){const pilot=await pilotAllowed(auth.user);const {data:campaign}=await db.from("picgift_campaign_state").select("active_campaign").eq("singleton",true).maybeSingle();const active=campaign?.active_campaign||"halloween";const {count,error:catalogError}=await db.from("picgift_scene_recipes").select("scene_id",{count:"exact",head:true}).eq("enabled",true).like("scene_id",active==="halloween"?"halloween-%":"%christmas%");return respond({available:!catalogError&&(count||0)>0&&["christmas","halloween"].includes(active)&&await engineReady(auth.user),references_supported:true,pilot,campaign:active,image_model:imageModel(),email_available:!!Deno.env.get("RESEND_API_KEY")&&!!Deno.env.get("PICGIFT_FROM_EMAIL")})}
 if(action==="diagnose"){
   if(!(await pilotAllowed(auth.user)))return respond({error:"Diagnóstico reservado a una cuenta de prueba autorizada"},403);
   if(!Deno.env.get("OPENAI_API_KEY"))return respond({ready:false,error:"Falta configurar la clave privada de OpenAI"},503);
   const checks=await Promise.all([
     {name:"analysis",model:"gpt-4.1-mini"},
     {name:"image",model:imageModel()}
   ].map(async ({name,model})=>{
     try{
       const r=await fetch("https://api.openai.com/v1/models/"+encodeURIComponent(model),{
         headers:{Authorization:"Bearer "+Deno.env.get("OPENAI_API_KEY")},signal:AbortSignal.timeout(13000)
       });
       if(!r.ok){const code=await classifiedOpenAiError(r);return {name,ok:false,error:code}}
       return {name,ok:true};
     }catch{return {name,ok:false,error:"connection_error"}}
   }));
   return respond({ready:checks.every(x=>x.ok),checks,billing_verified:false,message:"Esta comprobación no genera imágenes ni comprueba el saldo de facturación."});
 }
 if(action==="status"){
  const cutoff=new Date(Date.now()-8*60*1000).toISOString();
  const active=["queued","analyzing","generating","reviewing"];
  const {data:stuck,error:listError}=await db.from("picgift_photo_jobs")
   .select("id,is_test,status").eq("user_id",auth.user.id).in("status",active).lt("updated_at",cutoff).limit(3);
  if(listError)return respond({error:"No se pudo comprobar el estado"},503);
  let recovered=0;
  for(const j of stuck||[]){
   const {data:updated,error:updateError}=await db.from("picgift_photo_jobs")
    .update({status:"failed",failure_code:"stale_timeout",failure_stage:j.status,
      failure_message:"Se agotó el tiempo de espera de la generación. No debes seguir esperando.",
      updated_at:new Date().toISOString()})
    .eq("id",j.id).eq("user_id",auth.user.id).in("status",active)
    .lt("updated_at",cutoff).select("id").maybeSingle();
   if(!updateError&&updated){
     recovered++;
     if(!j.is_test)await db.rpc("picgift_refund_failed_job",{p_user:auth.user.id,p_job:j.id});
   }
  }
  return respond({ok:true,stale_recovered:recovered});
 }
 if(action==="delete"){
  const id=safe(body?.job_id,36);
  const {data:j}=await db.from("picgift_photo_jobs").select("id,source_path,result_path,status,reference_paths").eq("id",id).eq("user_id",auth.user.id).single();
  if(!j)return respond({error:"Trabajo no encontrado"},404);
  if(["queued","analyzing","generating","reviewing"].includes(j.status))return respond({error:"Por seguridad, espera a que finalice el procesamiento antes de borrar este trabajo."},409);
  if(j.source_path){const paths=[j.source_path,...Object.values(j.reference_paths||{}).filter((v):v is string=>typeof v==="string"&&v.startsWith(auth.user.id+"/"))];const r=await db.storage.from("picgift-uploads").remove(paths);if(r.error)return respond({error:"No se pudo borrar el original"},500)}
  if(j.result_path){const r=await db.storage.from("picgift-generated").remove([j.result_path]);if(r.error)return respond({error:"No se pudo borrar el resultado"},500)}
  const r=await db.from("picgift_photo_jobs").delete().eq("id",id).eq("user_id",auth.user.id);
  return r.error?respond({error:"No se pudo borrar el registro"},500):respond({ok:true});
 }
 if(action!=="start")return respond({error:"Acción desconocida"},400);
 const {data:currentCampaign,error:campaignError}=await db.from("picgift_campaign_state").select("active_campaign").eq("singleton",true).maybeSingle();
 if(campaignError||!["christmas","halloween"].includes(currentCampaign?.active_campaign))return respond({error:"Esta colección no está disponible para crear retratos."},503);

 if(!await engineReady(auth.user))return respond({error:"El estudio está disponible únicamente para las cuentas autorizadas para la prueba privada. No se ha procesado ninguna fotografía."},503);
 const testMode=await pilotAllowed(auth.user);
 if(body.consent!==true)return respond({error:"Debes autorizar expresamente el procesamiento de las fotografías"},400);
 const scene=safe(body.scene_id,60),path=safe(body.source_path,160),format=safe(body.format,25),pose=safe(body.pose,90),outfit=safe(body.outfit,90);
 const prefix=auth.user.id+"/";
 if(!path.startsWith(prefix)||!new RegExp("^[0-9a-f-]{36}/[0-9a-f-]{36}/source\\.(jpg|png|webp)$").test(path)||!(format in formats)||!scene||!pose||!outfit)return respond({error:"Configuración o ruta de archivo incorrecta"},400);
 const {data:sceneData}=await db.from("picgift_scene_recipes").select("scene_id,enabled").eq("scene_id",scene).maybeSingle();
 if((currentCampaign.active_campaign==="halloween")!==scene.startsWith("halloween-"))return respond({error:"Escenario de otra colección"},400);
 if(!sceneData?.enabled)return respond({error:"Escenario no disponible para generar"},400);
 if(!allowedPoses[scene]?.includes(pose)||!(currentCampaign.active_campaign==="halloween"?halloweenOutfits:allowedOutfits).includes(outfit))return respond({error:"Pose o vestuario no disponibles para este escenario"},400);
 const {data:ongoing}=await db.from("picgift_photo_jobs").select("id").eq("user_id",auth.user.id).in("status",["queued","analyzing","generating","reviewing"]).limit(1);
 if(ongoing?.length){
  const tenMinutesAgo=new Date(Date.now()-10*60*1000).toISOString();
  const {data:stale}=await db.from("picgift_photo_jobs").select("id").eq("user_id",auth.user.id).in("status",["queued","analyzing","generating","reviewing"]).lt("updated_at",tenMinutesAgo);
  if(stale?.length){await db.from("picgift_photo_jobs").update({status:"failed",failure_message:"La generación excedió el tiempo de espera. Contacta con soporte antes de volver a intentarlo.",updated_at:new Date().toISOString()}).in("id",stale.map(x=>x.id)).eq("user_id",auth.user.id);}
  if(stale?.length){for(const j of stale)await db.rpc("picgift_refund_failed_job",{p_user:auth.user.id,p_job:j.id});}
  else return respond({error:"Espera a que termine tu trabajo anterior"},429);
 }
 const parts=path.split("/"),folder=parts.slice(0,2).join("/");
 const {data:objects,error:listError}=await db.storage.from("picgift-uploads").list(folder,{limit:25});
 if(listError||!objects?.some(x=>x.name===parts[2]))return respond({error:"La fotografía todavía no está subida"},400);
 const referencePaths:Record<string,string>={};
 if(body.reference_paths!==undefined){if(!body.reference_paths||Array.isArray(body.reference_paths)||typeof body.reference_paths!=="object"||Object.keys(body.reference_paths).some(k=>!["face","body"].includes(k)))return respond({error:"Referencias inválidas"},400);for(const kind of ["face","body"]){const value=body.reference_paths[kind];if(value===undefined)continue;if(typeof value!=="string"||!["jpg","png","webp"].some(ext=>value===folder+"/reference-"+kind+"."+ext)||!objects?.some(x=>folder+"/"+x.name===value))return respond({error:"La referencia no pertenece a esta solicitud o no está subida"},400);referencePaths[kind]=value;}}
 // Server-authoritative preflight: never reserve quota or spend a credit on a clearly unusable photo.
 // It operates on the authenticated user's private source, not on a client-provided verdict.
 const {data:sourcePhoto,error:sourceError}=await db.storage.from("picgift-uploads").download(path);
 if(sourceError||!sourcePhoto)return respond({code:"photo_source_unavailable",error:"No se pudo leer la fotografía original. Prueba a subirla de nuevo.",credit_spent:false},422);
 let photoCheck;
 try{photoCheck=await assessPhoto(sourcePhoto,Deno.env.get("OPENAI_API_KEY")||"")}
 catch{return respond({code:"photo_preflight_unavailable",error:"No hemos podido comprobar la calidad de tu foto. No se ha gastado ningún crédito; inténtalo de nuevo más tarde.",credit_spent:false},503)}
 if(!photoCheck.approved)return respond({code:"photo_not_suitable",reason:photoCheck.code,issues:photoCheck.issues,error:photoCheck.message,credit_spent:false},422);
 const emailRequested=body.email_requested===true;
 const {data:job,error:createError}=await db.from("picgift_photo_jobs").insert({user_id:auth.user.id,scene_id:scene,source_path:path,reference_paths:referencePaths,requested_format:format,requested_pose:pose,requested_outfit:outfit,email_requested:emailRequested,email_status:emailRequested?"pending":"not_requested",request_language:body.request_language==="en"?"en":"es",processing_consent:true,consent_at:new Date().toISOString(),status:"queued",is_test:testMode,image_model:imageModel()}).select("id").single();
 if(createError||!job)return respond({error:"No se pudo crear la solicitud"},500);
 const {data:quota,error:quotaError}=await db.rpc("picgift_claim_premium_photo",{p_user:auth.user.id,p_job:job.id});
 if(quotaError||quota?.accepted!==true){
  await db.from("picgift_photo_jobs").delete().eq("id",job.id).eq("user_id",auth.user.id);
  return respond({error:"Has alcanzado tu límite diario de generaciones Premium. Se renueva a las 00:00 UTC."},429);
 }
 if(!testMode){
  const {data:spent,error:creditError}=await db.rpc("picgift_spend_credit",{p_user:auth.user.id,p_job:job.id});
  if(creditError||!spent){
    await db.from("picgift_premium_usage").delete().eq("job_id",job.id).eq("user_id",auth.user.id);
    await db.from("picgift_photo_jobs").delete().eq("id",job.id).eq("user_id",auth.user.id);
    return respond({error:"Necesitas un crédito disponible para generar esta fotografía. Consulta nuestros packs."},402);
  }
 }
 EdgeRuntime.waitUntil(run(job.id,auth.user.id,auth.user.email||""));
 return respond({id:job.id,status:"queued"},202);
});
