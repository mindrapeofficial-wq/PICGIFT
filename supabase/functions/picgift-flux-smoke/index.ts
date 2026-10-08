import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const projectUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const allowedOrigin = "https://picgift.onrender.com";
const headers = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};
const json = (data: unknown, code = 200) => new Response(JSON.stringify(data), {headers,status:code});
const model = "@cf/black-forest-labs/flux-2-klein-4b";
const samplePrompt = "Produce a hyperrealistic professional photography studio test image, a single miniature handcrafted pumpkin carriage surrounded by natural autumn leaves and two traditional vintage lanterns, magical elegant Halloween atmosphere, finely detailed realistic materials, subtle balanced candlelight with natural whites, professionally controlled soft shadows and true photographic depth of field. No people, no faces, no text, no watermarks, no graphics, no illustration, no CGI.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null,{headers});
  if (req.method !== "POST") return json({error:"method_not_allowed"},405);
  if (!projectUrl || !serviceKey) return json({error:"service_unavailable"},503);
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i,"");
  if (!token) return json({error:"login_required"},401);
  const db = createClient(projectUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:auth,error:authError} = await db.auth.getUser(token);
  if (authError || !auth?.user?.id || !auth.user.email_confirmed_at) return json({error:"session_invalid"},401);
  const userId = auth.user.id;
  const {data:pilot,error:pilotError} = await db.from("picgift_ai_pilot_users").select("user_id").eq("user_id",userId).maybeSingle();
  if (pilotError || !pilot) return json({error:"restricted_to_testers"},403);
  let body: unknown;
  try { body = await req.json(); } catch { return json({error:"invalid_request"},400); }
  const action = typeof body === "object" && body && "action" in body ? String(body.action) : "health";
  const {count} = await db.from("picgift_flux_smoke_attempts").select("id",{count:"exact",head:true}).eq("user_id",userId);
  if (action === "health") return json({available:true,remaining:Math.max(0,2-(count||0)),sample_only:true,personal_photos_enabled:false,model:"FLUX.2 Klein 4B"});
  if (action !== "run") return json({error:"unknown_action"},400);
  const account = Deno.env.get("CLOUDFLARE_ACCOUNT_ID") || "";
  const cloudflareToken = Deno.env.get("CLOUDFLARE_API_TOKEN") || "";
  if (!/^[a-f0-9]{32}$/i.test(account) || !cloudflareToken) return json({error:"cloudflare_not_configured"},503);

  // The RPC atomically authorizes and counts paid-provider invocations.
  const {data:attemptId,error:claimError} = await db.rpc("picgift_claim_flux_smoke",{p_user:userId});
  if (claimError || !attemptId) return json({error:"test_limit_reached"},429);
  let status = "failed";
  try {
    const multipart = new FormData();
    multipart.set("prompt",samplePrompt);
    multipart.set("width","1024");
    multipart.set("height","1024");
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`,
      {method:"POST",headers:{Authorization:`Bearer ${cloudflareToken.trim()}`},body:multipart,signal:AbortSignal.timeout(75000)}
    );
    if (!response.ok) {
      console.error("PICGIFT_FLUX_SMOKE_HTTP",response.status);
      return json({error:response.status===429?"provider_rate_limit":"provider_unavailable",http_status:response.status},502);
    }
    const payload = await response.json();
    const raw = payload?.result?.image || payload?.image;
    if (payload?.success===false || typeof raw !== "string" || raw.length<100 || raw.length>12_000_000)
      return json({error:"provider_invalid_image"},502);
    const normalized = raw.replace(/^data:image\/(png|jpeg);base64,/,"");
    if (!/^[A-Za-z0-9+/]+=*$/.test(normalized)) return json({error:"provider_invalid_image"},502);
    const format = normalized.startsWith("iVBOR") ? "image/png" : normalized.startsWith("/9j/") ? "image/jpeg" : null;
    if (!format) return json({error:"provider_unknown_format"},502);
    status="completed";
    return json({ok:true,model:"FLUX.2 Klein 4B",sample_only:true,image:"data:"+format+";base64,"+normalized});
  }catch(e){
    console.error("PICGIFT_FLUX_SMOKE_FAILED",e instanceof Error ? e.name : "UnknownError");
    return json({error:"provider_connection_error"},503);
  }finally{
    await db.from("picgift_flux_smoke_attempts").update({status,finished_at:new Date().toISOString()}).eq("id",attemptId);
  }
});
