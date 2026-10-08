# PICGIFT free image editor: controlled rollout

## Scope
- Free or beta traffic only: Cloudflare Workers AI model `@cf/black-forest-labs/flux-2-klein-4b`.
- Keep the existing `picgift-generate` paid provider unchanged.
- The adapter at `private-providers/cloudflare-flux-klein.ts` is **not connected to production**, nor does its existence enable generation.
- Private prompts and scene recipes remain in Supabase / private server configuration, never exposed here.

## Required private configuration
1. Create or select a Cloudflare account with Workers AI availability and verify current model quota and pricing.
2. Create a narrowly scoped API token permitted to run Workers AI. Store `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` only in Supabase Edge Function secrets (or another private worker host).
3. Verify live model request/response schema at https://developers.cloudflare.com/workers-ai/models/flux-2-klein-4b/ and make one synthetic-image smoke test. The supplied adapter is an integration starting point; multipart fields and response format have **not** been tested against an authenticated account.
4. Wire the adapter into a **separate authenticated** free-generation route. Never accept raw prompt text, scene URLs, storage paths for other users, or model choice directly from the browser. Use the existing verified private recipe, scene allowlist and ownership authorization.
5. Add a server-side atomic per-user grant/consumption mechanism (e.g. 5 beta photo attempts total), global daily cost/attempt ceiling and abuse rate limits before allowing traffic. Enforce double-submit/idempotency and refund failed credits appropriately.
6. Keep tests separated from Play Billing: beta free entitlement must not grant paid credits or bypass paid provider billing logic.
7. Use consistent source/ref ownership checks and explicit parental permission for images of children, short-lived signed URLs, and private storage. Verify processor privacy policy and cross-border data handling.
8. Compare face fidelity and scene consistency against the current EUR 0.07 paid standard image. Fail/review poor-quality results rather than presenting them as completed.
9. Enable `PICGIFT_FREE_FLUX_ENABLED=true` **only after** credentials, budgets, quotas, schema smoke test, privacy review, and signed-image delivery tests pass.

## Important
Workers AI free allotments are **quota-limited, not a guarantee of zero costs or zero failures**. Paid provider and purchases remain unaffected. Do not show “free generation ready” to users until a real server-side authenticated image generation succeeds.
