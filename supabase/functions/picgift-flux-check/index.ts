import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const cors = {
  "Access-Control-Allow-Origin": "https://picgift.onrender.com",
  "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};
const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers: cors, status });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return respond({ error: "method_not_allowed" }, 405);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return respond({ error: "server_unavailable" }, 503);
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return respond({ error: "login_required" }, 401);
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userResult, error: authError } = await db.auth.getUser(jwt);
  const user = userResult?.user;
  if (authError || !user?.id || !user.email_confirmed_at) return respond({ error: "invalid_session" }, 401);

  const accountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID") || "";
  const token = Deno.env.get("CLOUDFLARE_API_TOKEN") || "";
  if (!accountId || !token) return respond({
    configured: false, verified: false, status: "missing_secrets",
    message: "Faltan las credenciales privadas de Cloudflare en Supabase.",
  });
  if (!/^[a-f0-9]{32}$/i.test(accountId)) return respond({
    configured: false, verified: false, status: "invalid_account_id",
    message: "El Account ID no tiene el formato esperado.",
  });

  // Health check uses Workers AI model search only. No user images, prompts,
  // chargeable inference, or secrets are returned or logged.
  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models/search?search=flux-2-klein-4b&per_page=20`;
    const cf = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(12000),
    });
    if (!cf.ok) return respond({
      configured: true, verified: false,
      status: cf.status === 401 || cf.status === 403 ? "cloudflare_permission_error" : "cloudflare_unavailable",
      message: cf.status === 401 || cf.status === 403
        ? "Cloudflare no autorizó el token para esta cuenta. Revisa Account ID y permisos Workers AI."
        : "No se pudo validar el acceso a Cloudflare.",
    });
    const data = await cf.json();
    const models = Array.isArray(data?.result) ? data.result : [];
    const listed = models.some((m: any) =>
      String(m?.name || m?.id || m?.model || "").includes("flux-2-klein-4b")
    );
    return respond({
      configured: true,
      verified: data?.success === true && listed,
      status: data?.success !== true ? "cloudflare_error" : listed ? "connected" : "model_not_listed",
      model: "FLUX.2 Klein 4B",
      generation_enabled: false,
      message: data?.success === true && listed
        ? "Cuenta y token de Workers AI conectados. Aún falta activar y probar la generación."
        : "Cloudflare respondió, pero no pudimos confirmar el modelo en la búsqueda.",
    });
  } catch {
    return respond({ configured: true, verified: false,
      status: "connection_timeout", message: "No fue posible contactar con Cloudflare." });
  }
});
