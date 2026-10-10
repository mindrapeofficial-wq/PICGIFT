import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { importPKCS8, SignJWT } from "npm:jose@5.9.6";

const url = Deno.env.get("SUPABASE_URL") || "";
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const db = createClient(url, service, {auth:{persistSession:false,autoRefreshToken:false}});
const cors = {"Access-Control-Allow-Origin":"https://picgift.onrender.com",
 "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info,x-picgift-cron",
 "Access-Control-Allow-Methods":"POST,OPTIONS",
 "Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
const reply = (body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
const routeSet = new Set(["crear","inspiracion","cuenta","precios"]);
const safe = (value:unknown,max=300)=>typeof value==="string"?value.trim().slice(0,max):"";
const formatDay=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Madrid",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const daysId=()=>formatDay().replace(/-/g,"");
async function requireAdmin(request:Request){
 const bearer=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
 if(!bearer)return null;
 const {data,error}=await db.auth.getUser(bearer);
 if(error||!data.user?.id||!data.user.email_confirmed_at)return null;
 const {data:admin}=await db.from("picgift_admin_users").select("user_id").eq("user_id",data.user.id).maybeSingle();
 return admin?data.user:null;
}
async function requireCron(request:Request){
 const token=request.headers.get("x-picgift-cron")||"";
 if(token.length<40||token.length>200)return false;
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token)))).map(x=>x.toString(16).padStart(2,"0")).join("");
 const {data,error}=await db.from("picgift_ai_cron_auth").select("token_hash").eq("singleton",true).maybeSingle();
 return !error&&!!data?.token_hash&&data.token_hash===hash;
}
function parseTextJSON(value:string){
 let data;
 try{data=JSON.parse(value)}catch{throw Error("ai_invalid_json")}
 if(!data||typeof data!=="object"||Array.isArray(data))throw Error("ai_invalid_json");
 return data;
}
async function freeCreativeIdea(catalogue:string[]):Promise<string>{
 const account=Deno.env.get("CLOUDFLARE_ACCOUNT_ID")||"";
 const token=Deno.env.get("CLOUDFLARE_API_TOKEN")||"";
 const model=Deno.env.get("PICGIFT_FREE_CREATIVE_MODEL")||"@cf/meta/llama-3.1-8b-instruct-fast";
 if(!/^[a-f0-9]{32}$/i.test(account)||!token)throw Error("free_ai_not_configured");
 if(!/^@cf\/[a-z0-9./_-]{3,100}$/.test(model))throw Error("free_ai_model_invalid");
 const prompt=[
  "Eres el segundo director creativo de PICGIFT: revisas el catálogo Halloween activo y propones UNA dirección fotográfica distinta que conserve la estética familiar fine art.",
  "Trabajas como revisor independiente ANTES de que la IA Premium cree la propuesta definitiva. Evalúa nombres y descripciones, NO afirmes haber examinado píxeles de fotos.",
  "Evita repetir sujeto, escena, perspectiva o accesorios dominantes de las escenas existentes. Mantén un escenario vacío apto para retrato, fotorrealista, luz y suelo físicos coherentes.",
  "No inventes ofertas ni personajes protegidos. Devuelve un brief en español de 3 a 5 frases: qué se repite, qué proponer, cómo diferenciar composición, luz y atrezo.",
  "Catálogo existente: "+catalogue.join("; ")
 ].join("\n");
 const response=await fetch("https://api.cloudflare.com/client/v4/accounts/"+account+"/ai/run/"+model,{
  method:"POST",
  headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
  body:JSON.stringify({messages:[{role:"system",content:"Director creativo revisor. Conciso, específico, respetuoso y profesional."},{role:"user",content:prompt}],max_tokens:390,temperature:0.5}),
  signal:AbortSignal.timeout(35000)
 });
 if(!response.ok)throw Error("free_ai_api_"+response.status);
 const body=await response.json();
 const brief=body?.result?.response;
 if(body?.success!==true||typeof brief!=="string"||brief.trim().length<45)throw Error("free_ai_invalid_response");
 return brief.trim().slice(0,1800);
}

async function creativePlan(){
 const key=Deno.env.get("OPENAI_API_KEY");
 if(!key)throw Error("openai_not_configured");
 const [{data:recent},{count:users},{count:jobs},{count:orders}]=await Promise.all([
  db.from("picgift_ai_proposals").select("title").eq("kind","scene").order("created_at",{ascending:false}).limit(20),
  db.from("picgift_admin_users").select("user_id",{head:true,count:"exact"}),
  db.from("picgift_photo_jobs").select("id",{head:true,count:"exact"}),
  db.from("picgift_orders").select("id",{head:true,count:"exact"}).eq("status","paid")
 ]);
 const {data:published,error:catalogueError}=await db.from("picgift_catalog_scenes")
   .select("name,description,category").order("published_at",{ascending:false}).limit(60);
 if(catalogueError)throw Error("catalogue_read_failed");
 // The existing visual samples live in the static frontend catalogue.
 const catalogue=[
  "Bosque de calabazas: bosque otoñal, calabazas iluminadas, senderos y luces naranjas",
  "Castillo embrujado: castillo gótico al atardecer y luna",
  "Salón de retratos: retratos antiguos, madera, velas",
  "Ciudad encantada: calle empedrada nocturna y faroles",
  "La escuela de magia: pociones y libros antiguos",
  "El bosque encantado: hojas otoñales y farolillos",
  "El rincón de las calabazas: banco, calabazas y gatos negros",
  "La calle de los farolillos: paseo otoñal entre faroles",
  ...(published||[]).map(x=>[x.name,x.category,x.description].filter(Boolean).join(": ")),
  ...(recent||[]).map(x=>x.title)
 ].map(x=>safe(x,200)).slice(0,95);
 const freeBrief=await freeCreativeIdea(catalogue);
 const prompt=[
  "Actúas como director creativo y responsable ético del crecimiento de PICGIFT, app española de retratos fotográficos familiares de fantasía.",
  "Objetivo: excelente calidad, confianza, retención, recomendaciones y conversiones genuinas, sin publicidad engañosa ni spam.",
  "Colección activa: Halloween. Cada día diseña UN FONDO FOTO REALISTA totalmente nuevo, sin niños ni adultos dentro de la imagen, con espacio central para integrar luego a la persona aportada por el usuario.",
  "No copies películas, marcas, obras ni personajes protegidos. Calidad de estudio profesional y coherencia de luz, suelo, sombras y perspectiva.",
  "Devuelve SOLO JSON con campos: scene_title, scene_description, category, prompt_en, notification_title, notification_body, promotion_title, promotion_body, strategy.",
  "La promoción debe ser una campaña editorial o propuesta de uso creativo SIN DESCUENTOS, OFERTAS DE PRECIO, CUPONES, REGALOS, DISPONIBILIDAD GARANTIZADA ni cifras falsas.",
  "La notificación debe aportar valor real, estar ligada a la colección y no dar a entender que ya se ha publicado lo que aún está pendiente.",
  "Títulos <=70 caracteres, mensaje notificación <=180, body promoción <=240. Categorías cortas en español. Ideas respetuosas con familias.",
  "Catálogo existente. No repitas estos escenarios, sus composiciones ni su atrezo: "+catalogue.join("; "),
  "Brief independiente de la IA gratuita de PICGIFT: "+freeBrief,
  "Colabora con esa revisión, pero tú decides la propuesta final. El concepto debe ser distinto incluso si el brief inicial es repetitivo.",
  "Indicadores agregados disponibles (no deduzcas comportamiento de usuarios individuales): trabajos="+(jobs||0)+", ventas="+(orders||0)+", admins="+(users||0),
  "No exageres resultados de IA ni inventes testimonios."
 ].join("\n");
 const response=await fetch("https://api.openai.com/v1/chat/completions",{
  method:"POST",headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},
  body:JSON.stringify({model:"gpt-4.1-mini",temperature:0.9,response_format:{type:"json_object"},
   messages:[{role:"system",content:"Responde con un único JSON válido. Eres un editor creativo y de marketing transparente."},{role:"user",content:prompt}]}),
  signal:AbortSignal.timeout(45000)
 });
 if(!response.ok)throw Error("creative_api_"+response.status);
 const result=await response.json();
 return {idea:parseTextJSON(result.choices?.[0]?.message?.content||""),freeBrief};
}
function sceneRecipe(title:string,description:string,category:string,prompt:string){
 return {version:"picgift-ai-2026.1",
  scene:{description,props:"Elementos coherentes del decorado: "+title,safety:"Mantener un espacio libre para la persona, perspectiva y contacto realistas."},
  photography:{genre:"fotografía de estudio familiar fotorrealista",camera:"perspectiva frontal a la altura de los ojos",
    realism:"decorado fotográfico auténtico, sin estilo ilustración",
    lighting:"luz suave de estudio coherente con el fondo",
    composition:"espacio central vertical para una persona, pies apoyados en el suelo",
    aesthetic:category},
  quality:{look:"fotografía natural premium, texturas realistas",edge:"sombras de contacto, cabello y manos naturales"},
  ai_direction:prompt};
}
async function createDaily(){
 const day=formatDay();
 const {data:existing}=await db.from("picgift_ai_proposals").select("id").eq("kind","scene").eq("day_key",day).maybeSingle();
 if(existing)return {already_created:true,day};
 const {idea,freeBrief}=await creativePlan();
 const sceneTitle=safe(idea.scene_title,70),description=safe(idea.scene_description,260);
 const category=safe(idea.category,40)||"Fantasía";
 const imagePrompt=safe(idea.prompt_en,1700);
 if(!sceneTitle||!description||!imagePrompt)throw Error("incomplete_creative_plan");
 const key=Deno.env.get("OPENAI_API_KEY")!;
 const prompt="Create a PREMIUM REALISTIC photographic portrait studio BACKDROP only. No person, no face, no human silhouette, no lettering, no logos, no watermark. "+imagePrompt+
  ". Perfect foreground-to-background scale, portrait vertical 2:3, frontal eye-level view, realistic ground contact, natural physically consistent lighting, center kept clear for a future real person's full body. Artistic quality suitable for professional paid family photography. Distinctively original Halloween environment.";
 const imageResult=await fetch("https://api.openai.com/v1/images/generations",{
  method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},
  body:JSON.stringify({model:"gpt-image-1.5",size:"1024x1536",quality:"high",output_format:"png",n:1,prompt}),
  signal:AbortSignal.timeout(170000)
 });
 if(!imageResult.ok)throw Error("image_api_"+imageResult.status);
 const result=await imageResult.json();
 const encoded=result.data?.[0]?.b64_json;
 if(typeof encoded!=="string"||encoded.length>24000000)throw Error("image_response_invalid");
 const image=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
 const id=crypto.randomUUID();
 const path="halloween/"+day+"/"+id+".png";
 const {error:uploadError}=await db.storage.from("picgift-ai-drafts").upload(path,image,{contentType:"image/png",upsert:false});
 if(uploadError)throw Error("draft_image_upload_failed");
 const recipe={...sceneRecipe(sceneTitle,description,category,imagePrompt),ai_collaboration:{
  premium_model:"gpt-4.1-mini",free_model:"cloudflare-workers-ai",free_brief:freeBrief,
  catalogue_sources:["static_visual_scenes","approved_ai_scenes","prior_proposals"]
 }};
 const {error:sceneError}=await db.from("picgift_ai_proposals").insert({
   id,kind:"scene",day_key:day,title:sceneTitle,description,category,image_path:path,creative_prompt:imagePrompt,
   recipe,status:"pending",route:"inspiracion"
 });
 if(sceneError)throw Error("proposal_save_failed");

 // Suggest an original category only when it is not yet present or awaiting review.
 if(!["Fantasía","Bosques","Clásicos"].includes(category)){
  const [{data:existingCategory},{data:existingProposal}]=await Promise.all([
   db.from("picgift_catalog_categories").select("name").eq("name",category).maybeSingle(),
   db.from("picgift_ai_proposals").select("id").eq("kind","category").eq("title",category)
    .in("status",["pending","processing","approved"]).limit(1)
  ]);
  if(!existingCategory&&!existingProposal?.length){
   const {data:suggested}=await db.from("picgift_ai_proposals").insert({
    kind:"category",day_key:day,title:category,description:"Nueva categoría temática sugerida por IA para ordenar el catálogo.",
    status:"pending",route:"inspiracion"
   }).select("id").single();
   if(suggested)await db.from("picgift_ai_notifications_outbox").insert({
    proposal_id:suggested.id,target:"admin",title:"PICGIFT · Nueva categoría sugerida",
    body:"Revisa la categoría «"+category+"»",route:"cuenta"
   });
  }
 }
 const notices=[
  {kind:"notification",title:safe(idea.notification_title,80)||"Un poco de magia en PICGIFT",
   message:safe(idea.notification_body,280)||"Descubre nuestras escenas de Halloween.",route:"inspiracion"},
  {kind:"promotion",title:safe(idea.promotion_title,80)||"Ideas para tus retratos",
   message:safe(idea.promotion_body,280)||"Descubre nuevas ideas para tu sesión fotográfica.",route:"crear"}
 ];
 for(const item of notices){
  const {data:proposal,error}=await db.from("picgift_ai_proposals").insert({...item,day_key:day,status:"pending",
   description:item.kind==="promotion"?"Campaña creativa propuesta por IA para revisión humana.":""}).select("id").single();
  if(!error&&proposal)await db.from("picgift_ai_notifications_outbox").insert({
   proposal_id:proposal.id,target:"admin",title:"PICGIFT · Propuesta de comunicación",
   body:item.title+" lista para revisar",route:"cuenta"});
 }
 await db.from("picgift_ai_notifications_outbox").insert({proposal_id:id,target:"admin",
  title:"PICGIFT · Nuevo fondo por aprobar",body:sceneTitle+" está listo para tu revisión.",route:"cuenta"});
 return {ok:true,day,scene_id:id,proposals:3,strategy:safe(idea.strategy,240)};
}
async function fcmAuth(){
 let config;
 try{config=JSON.parse(Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON")||"null")}
 catch{throw Error("firebase_config_invalid_json")}
 if(config?.project_id!=="picgift-a7fda"||!config?.private_key||!config?.client_email)throw Error("firebase_not_configured");
 const key=await importPKCS8(config.private_key,"RS256");
 const assertion=await new SignJWT({scope:"https://www.googleapis.com/auth/firebase.messaging"})
  .setProtectedHeader({alg:"RS256",typ:"JWT"}).setIssuer(config.client_email)
  .setAudience("https://oauth2.googleapis.com/token").setIssuedAt().setExpirationTime("1h").sign(key);
 const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
  body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion}),signal:AbortSignal.timeout(15000)});
 const data=await response.json();
 if(!response.ok||!data.access_token)throw Error("firebase_credentials_invalid");
 return {token:String(data.access_token),projectId:config.project_id};
}
async function sendOutbox(limit=6){
 const {data:pending,error}=await db.from("picgift_ai_notifications_outbox").select("*")
  .eq("state","pending").order("created_at",{ascending:true}).limit(limit);
 if(error)throw Error("outbox_read_failed");
 const outcome:{id:string,state:string,delivered?:number}[]=[];
 for(const item of pending||[]){
  const {data:claimed}=await db.from("picgift_ai_notifications_outbox").update({state:"sending",tries:item.tries+1})
   .eq("id",item.id).eq("state","pending").select("id").maybeSingle();
  if(!claimed)continue;
  try{
   let userIds:string[]=[];
   if(item.target==="admin"){
    const {data:admins,error:adminErr}=await db.from("picgift_admin_users").select("user_id");
    if(adminErr)throw Error("admin_lookup_failed");
    userIds=(admins||[]).map(x=>x.user_id);
   }
   let query=db.from("picgift_notification_devices").select("installation_id,token")
     .eq("enabled",true).gt("updated_at",new Date(Date.now()-90*86400000).toISOString()).limit(501);
   if(item.target==="admin"){
    if(!userIds.length)throw Error("no_admin_accounts");
    query=query.in("user_id",userIds);
   }
   const {data:devices,error:deviceError}=await query;
   if(deviceError)throw Error("devices_unavailable");
   if((devices||[]).length>500)throw Error("batch_requires_pagination");
   let delivered=0;
   let lastFailure:string|null=null;
   if(devices?.length){
    const access=await fcmAuth();
    for(const device of devices){
     try{
      const response=await fetch("https://fcm.googleapis.com/v1/projects/"+access.projectId+"/messages:send",{
       method:"POST",headers:{Authorization:"Bearer "+access.token,"Content-Type":"application/json"},
       body:JSON.stringify({message:{token:device.token,data:{
        title:item.title,body:item.body,route:item.route,campaign_id:item.id
       },android:{priority:"HIGH",ttl:"86400s",collapse_key:item.id}}}),
       signal:AbortSignal.timeout(15000)});
      if(response.ok)delivered++;
      else{
       lastFailure="fcm_rejected_"+response.status;
       // A generic 404 can also be an endpoint/project error; only retire a
       // token when FCM explicitly reports it as unregistered.
       if(response.status===404){
        const rejection=await response.json().catch(()=>null);
        if(rejection?.error?.details?.some((detail:{errorCode?:string})=>detail.errorCode==="UNREGISTERED")){
         const {error:retireError}=await db.from("picgift_notification_devices").update({enabled:false})
          .eq("installation_id",device.installation_id).eq("token",device.token);
         if(retireError)lastFailure="fcm_unregistered_retirement_failed";
        }
       }
      }
     }catch{lastFailure="fcm_network_error"}
    }
   }
   const recipients=devices?.length||0;
   const state=recipients>0&&delivered===0?"failed":"sent";
   // Preserve accepted counts for partial delivery. Retrying the whole partial
   // campaign would duplicate notifications on devices that already accepted it.
   const deliveryError=recipients===0?"no_eligible_devices":
    delivered<recipients?(lastFailure||"fcm_delivery_failed"):null;
   const {error:saveError}=await db.from("picgift_ai_notifications_outbox").update({state,recipient_count:recipients,
    delivered_count:delivered,sent_at:delivered>0?new Date().toISOString():null,last_error:deliveryError}).eq("id",item.id);
   if(saveError)throw Error("delivery_status_save_failed");
   outcome.push({id:item.id,state,delivered});
  }catch(e){
   const reason=e instanceof Error?e.message:"send_failed";
   await db.from("picgift_ai_notifications_outbox").update({state:"failed",last_error:reason.slice(0,200)})
    .eq("id",item.id);
   outcome.push({id:item.id,state:"failed"});
  }
 }
 return outcome;
}
async function checkProviders(){
 const free=await freeCreativeIdea(["Bosque de calabazas, Halloween", "Castillo embrujado, Halloween"]);
 const key=Deno.env.get("OPENAI_API_KEY")||"";
 if(!key)throw Error("premium_ai_not_configured");
 const response=await fetch("https://api.openai.com/v1/chat/completions",{
  method:"POST",headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},
  body:JSON.stringify({model:"gpt-4.1-mini",messages:[{role:"user",content:"Responde solamente OK"}],max_tokens:8}),
  signal:AbortSignal.timeout(18000)
 });
 if(!response.ok)throw Error("premium_ai_api_"+response.status);
 const result=await response.json();
 if(!result.choices?.[0]?.message?.content)throw Error("premium_ai_invalid_response");
 return {ok:true,free:"ready",premium:"ready",free_response_length:free.length};
}
async function dashboard(){
 const [{data:records,error},{data:outbox}]=await Promise.all([
  db.from("picgift_ai_proposals").select("id,kind,day_key,title,description,category,image_path,message,route,status,error_message,created_at,reviewed_at,recipe")
   .order("created_at",{ascending:false}).limit(50),
  db.from("picgift_ai_notifications_outbox").select("id,proposal_id,target,title,state,recipient_count,delivered_count,last_error,created_at")
   .order("created_at",{ascending:false}).limit(30)
 ]);
 if(error)throw Error("proposals_unavailable");
 const proposals=[];
 for(const record of records||[]){
  let preview_url=null;
  if(record.image_path){
   const {data}=await db.storage.from("picgift-ai-drafts").createSignedUrl(record.image_path,900);
   preview_url=data?.signedUrl||null;
  }
  const {recipe,...visible}=record;
  proposals.push({...visible,review_summary:safe(recipe?.ai_collaboration?.free_brief,700),preview_url});
 }
 return {proposals,outbox:outbox||[],pending:proposals.filter(p=>p.status==="pending").length,
  providers:{premium_configured:!!Deno.env.get("OPENAI_API_KEY"),
   free_configured:!!Deno.env.get("CLOUDFLARE_ACCOUNT_ID")&&!!Deno.env.get("CLOUDFLARE_API_TOKEN")}};
}
async function review(id:string,decision:string,adminId:string,overrides:Record<string,unknown>){
 if(!/^[a-f0-9-]{36}$/i.test(id)||!["approve","reject"].includes(decision))throw Error("invalid_review");
 const {data:proposal,error:lookupError}=await db.from("picgift_ai_proposals").select("*").eq("id",id).maybeSingle();
 if(lookupError||!proposal||proposal.status!=="pending")throw Error("proposal_not_pending");
 // Communication for a new scene cannot be approved before that scene is published.
 if(decision==="approve"&&["notification","promotion"].includes(proposal.kind)){
  const {data:scene,error:sceneError}=await db.from("picgift_ai_proposals")
   .select("status").eq("kind","scene").eq("day_key",proposal.day_key).maybeSingle();
  if(sceneError||scene?.status!=="approved")throw Error("approve_scene_first");
 }
 const {data:claimed,error:claimError}=await db.from("picgift_ai_proposals").update({status:"processing"})
  .eq("id",id).eq("status","pending").select("id").maybeSingle();
 if(claimError||!claimed)throw Error("already_reviewed");
 const title=safe(overrides.title,80)||proposal.title;
 const message=safe(overrides.message,300)||proposal.message;
 const category=safe(overrides.category,50)||proposal.category;
 try{
  if(decision==="approve"){
   if(proposal.kind==="scene"){
    if(!proposal.image_path||!proposal.recipe)throw Error("incomplete_scene");
    const slug="halloween-ai-"+(proposal.day_key||formatDay()).replace(/-/g,"")+"-"+id.slice(0,8);
    const {data:file,error:downloadError}=await db.storage.from("picgift-ai-drafts").download(proposal.image_path);
    if(downloadError||!file)throw Error("preview_unavailable");
    const path="scenes/"+slug+".png";
    const {error:uploadError}=await db.storage.from("picgift-catalog").upload(path,file,{upsert:false,contentType:"image/png"});
    if(uploadError)throw Error("public_image_upload_failed");
    const imageUrl=db.storage.from("picgift-catalog").getPublicUrl(path).data.publicUrl;
    // The generator still maintains its own pose allowlist: keep new recipes disabled
    // until end-to-end generation with a test account has been verified.
    const {error:recipeError}=await db.from("picgift_scene_recipes").insert({
     scene_id:slug,scene_image_url:imageUrl,recipe:proposal.recipe,enabled:false
    });
    if(recipeError)throw Error("recipe_save_failed");
    const {error:catalogError}=await db.from("picgift_catalog_scenes").insert({
     id:slug,name:title,description:proposal.description,category:category||"Fantasía",
     image_url:imageUrl,proposal_id:id,enabled:false
    });
    if(catalogError)throw Error("catalog_publish_failed");
   }else if(proposal.kind==="category"){
    const {error}=await db.from("picgift_catalog_categories").insert({name:title,proposal_id:id});
    if(error)throw Error("category_publish_failed");
   }else{
    if(!title||!message||title.length>80||message.length>300||!routeSet.has(proposal.route))throw Error("invalid_message");
    const {error}=await db.from("picgift_ai_notifications_outbox").insert({
     proposal_id:id,target:"all",title,body:message,route:proposal.route
    });
    if(error)throw Error("broadcast_enqueue_failed");
   }
  }
  const {error:updateError}=await db.from("picgift_ai_proposals").update({
   status:decision==="approve"?"approved":"rejected",reviewed_at:new Date().toISOString(),reviewed_by:adminId,
   title,category:category||null,message:message||null
  }).eq("id",id);
  if(updateError)throw Error("review_save_failed");
  return {ok:true,status:decision==="approve"?"approved":"rejected",kind:proposal.kind};
 }catch(e){
  // Do not silently declare approval if a publish stage failed.
  await db.from("picgift_ai_proposals").update({status:"failed",error_message:(e instanceof Error?e.message:"publish_failed").slice(0,180)})
   .eq("id",id);
  throw e;
 }
}
Deno.serve(async(request:Request)=>{
 if(request.method==="OPTIONS")return new Response(null,{headers:cors});
 if(request.method!=="POST")return reply({error:"method_not_allowed"},405);
 if(!url||!service)return reply({error:"service_unavailable"},503);
 let body:Record<string,unknown>;
 try{body=await request.json();if(!body||typeof body!=="object"||Array.isArray(body))throw Error()}catch{return reply({error:"invalid_json"},400)}
 const action=safe(body.action,30);
 const isCron=(["daily","dispatch","check_providers"].includes(action)) && await requireCron(request);
 let adminId:string|null=null;
 if(!isCron){
  const admin=await requireAdmin(request);
  if(!admin)return reply({error:"admin_forbidden"},403);
  adminId=admin.id;
 }
 try{
  if(action==="dashboard")return reply(await dashboard());
  if(action==="check_providers")return reply(await checkProviders());
  if(action==="daily"){
   const result=await createDaily();
   const dispatch=await sendOutbox(8);
   return reply({...result,dispatch});
  }
  if(action==="review"){
   const result=await review(safe(body.id,36),safe(body.decision,15),adminId!,{
    title:body.title,message:body.message,category:body.category
   });
   const dispatch=await sendOutbox(8);
   return reply({...result,dispatch});
  }
  if(action==="dispatch"){
   // This is a manual fallback if a daily cron or Firebase delivery fails.
   const {data}=await db.from("picgift_ai_notifications_outbox").select("id").eq("state","failed").limit(15);
   if(body.retry_failed===true&&data?.length)await db.from("picgift_ai_notifications_outbox").update({state:"pending"})
    .in("id",data.map(x=>x.id));
   return reply({ok:true,dispatch:await sendOutbox(12)});
  }
  return reply({error:"unknown_action"},400);
 }catch(e){const code=e instanceof Error?e.message:"unexpected_failure";
  return reply({error:code.slice(0,180)},503);
 }
});
