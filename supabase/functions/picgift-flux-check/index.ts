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

  // Diagnostics only. No inference or user photos; credentials stay server-side.
  // Distinguish auth, permission, network, and timeout errors rather than guessing.
  const since = Date.now();
  const checks = await Promise.all([
    ["token", "https://api.cloudflare.com/client/v4/user/tokens/verify"],
    ["models", `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models/search?search=flux-2-klein-4b&per_page=20`],
  ].map(async ([name, endpoint]) => {
    try {
      const response = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token.trim()}` },
        signal: AbortSignal.timeout(10000),
      });
      let payload: any;
      try { payload = await response.json(); }
      catch { return { name, status: "invalid_response", http_status: response.status }; }
      return {
        name,
        status: response.ok && payload?.success === true ? "ok" : "api_error",
        http_status: response.status,
        active: name === "token" ? payload?.result?.status === "active" : undefined,
        listed: name === "models" && Array.isArray(payload?.result)
          ? payload.result.some((m: any) =>
              String(m?.name || m?.id || m?.model || "").includes("flux-2-klein-4b"))
          : undefined,
      };
    } catch (err) {
      const code = err instanceof Error ? err.name : "UnknownError";
      return { name, status: code === "TimeoutError" || code === "AbortError" ? "timeout" : "network_error",
        error_type: ["TimeoutError", "AbortError", "TypeError"].includes(code) ? code : "other" };
    }
  }));
  const byName: Record<string, any> = Object.fromEntries(checks.map(c => [c.name, c]));
  const a = byName.token, m = byName.models;
  const verified = a?.status === "ok" && a.active === true && m?.status === "ok" && m.listed === true;
  let status = "connected";
  if (a.status === "timeout" || m.status === "timeout") status = "connection_timeout";
  else if (a.status === "network_error" || m.status === "network_error") status = "network_error";
  else if (a.status !== "ok" || a.active !== true) status = "token_invalid";
  else if (m.http_status === 401 || m.http_status === 403) status = "cloudflare_permission_error";
  else if (m.status !== "ok") status = "cloudflare_unavailable";
  else if (!m.listed) status = "model_not_listed";
  // Only safe diagnostic codes and timings leave the server. Never expose credentials or raw responses.
  return respond({
    configured: true, verified, status, model: "FLUX.2 Klein 4B",
    token_check: a.status, model_check: m.status, token_http: a.http_status ?? null,
    model_http: m.http_status ?? null, elapsed_ms: Date.now() - since,
    generation_enabled: false,
  });
});
