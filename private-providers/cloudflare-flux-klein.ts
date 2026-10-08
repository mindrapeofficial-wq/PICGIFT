/**
 * PICGIFT private server-side adapter. Never import in the browser / Android bundle.
 * Requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN set on the private server.
 * This file does not route customer jobs or alter paid generation.
 */
const MODEL = "@cf/black-forest-labs/flux-2-klein-4b";
export type FluxInput = {
  prompt: string;
  subject: { mime: "image/jpeg" | "image/png" | "image/webp"; base64: string };
  scene?: { mime: "image/jpeg" | "image/png" | "image/webp"; base64: string };
};
export type FluxResult = { bytes: Uint8Array; mime: "image/png" };
function validateBase64(value: string) {
  if (!value || value.length > 18_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error("invalid_image_payload");
  }
}
export async function editWithCloudflareFlux(input: FluxInput): Promise<FluxResult> {
  const account = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
  const token = Deno.env.get("CLOUDFLARE_API_TOKEN");
  if (!account || !token || Deno.env.get("PICGIFT_FREE_FLUX_ENABLED") !== "true") {
    throw new Error("free_flux_not_configured");
  }
  if (!/^[a-f0-9]{32}$/i.test(account)) throw new Error("invalid_cloudflare_account");
  if (!input.prompt?.trim() || input.prompt.length > 8000) throw new Error("invalid_prompt");
  validateBase64(input.subject.base64);
  if (input.scene) validateBase64(input.scene.base64);

  // The API expects reference images as objects with image content in multipart.
  // Check the live Cloudflare model schema before enabling any beta traffic.
  const multipart = new FormData();
  multipart.set("prompt", input.prompt);
  const asFile = (image: FluxInput["subject"], name: string) =>
    new File([Uint8Array.from(atob(image.base64), c => c.charCodeAt(0))], name, { type: image.mime });
  multipart.append("image", asFile(input.subject, "subject.jpg"));
  if (input.scene) multipart.append("image", asFile(input.scene, "scene.jpg"));

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${MODEL}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: multipart,
      signal: AbortSignal.timeout(90_000),
    },
  );
  if (!response.ok) {
    console.error("PICGIFT_FREE_FLUX_HTTP", response.status);
    throw new Error(response.status === 429 ? "free_flux_rate_limited" : "free_flux_unavailable");
  }
  const data = await response.json();
  // Workers AI REST responses can wrap output in result. Only accept the documented
  // image base64 value; never store arbitrary API/error text as a customer image.
  const image = data?.result?.image ?? data?.image;
  if (typeof image !== "string" || !image) throw new Error("free_flux_no_image");
  validateBase64(image);
  return { bytes: Uint8Array.from(atob(image), c => c.charCodeAt(0)), mime: "image/png" };
}
