# PICGIFT FLUX free beta limits

Updated 2026-10-08. The product owner chose **15 personal photo attempts per authorized tester per UTC day**.

## Current deployment status

- Supabase project: `uimrvgrpenccijumyiek`
- Migration: `picgift_flux_beta_15_daily_per_tester_global_free_budget`
- Config table: `public.picgift_flux_beta_config`
- `per_tester_daily_limit = 15`
- `daily_estimated_neuron_budget = 7500.00`
- `enabled = false` (**not generating personal photos yet**).
- Users must be explicitly authorized in `picgift_ai_pilot_users`.
- Claimed free-photo attempts will be recorded atomically in `picgift_flux_free_usage`, via service-role-only RPC `picgift_claim_flux_free_photo(p_user, p_job, p_format)`.
- This server-side claim must be called only after authenticated ownership and source/scene permissions are checked. Do not accept job IDs, paths or recipes without validating ownership.
- The RPC requires an existing `picgift_photo_jobs` entry belonging to the same user with `is_test = true`. Repeated claims for the same job are idempotent.
- Each claim uses an estimated quota allocation (vertical/horizontal 167.04 neurons, square 114.94 neurons, each with two input image tiles) and serializes requests to prevent exceeding the configured **estimated** shared free budget.
- The budget is deliberately smaller than the Cloudflare free account allotment of 10,000 neurons/day to reserve space for smoke tests, variability, and other usage. Other Workers AI projects on the same Cloudflare account could still use neurons outside PICGIFT's counters.
- All quota counters reset at 00:00 UTC, not local midnight. Failed attempts remain counted conservatively until a safe retry/refund design is tested.

## Important economics and user experience

Cloudflare bills 26.05 neurons per 512x512 output tile and 5.37 neurons per 512x512 input tile for `@cf/black-forest-labs/flux-2-klein-4b`. The 10,000-neuron free allotment is shared across the account. At a professional 1024x1536 output with two reference tiles, 180 requests/day would require about 30,067 neurons, above the free allotment. **A per-tester 15/day setting is not a guarantee of 15 completed free photos per person** when a global budget is enforced.

For an optional low-resolution beta preview at 512x512 with two input tiles, estimated use is 36.79 neurons each; 180/day = about 6,622 neurons, which could fit within the 7,500-neuron pool. Such previews have substantially lower detail and are not equivalent to finished premium portraits. Do not silently lower photo quality to meet quota. Decide and communicate output quality before enabling.

Official model: https://developers.cloudflare.com/workers-ai/models/flux-2-klein-4b/
Official pricing: https://developers.cloudflare.com/workers-ai/platform/pricing/

## Activation checklist

1. Verify an authenticated and limited FLUX smoke inference with fictional images.
2. Implement and test a private free-image editor route: same-user portrait and scene, strict short-lived private files, genuine consent for minors, input images downsized to Cloudflare's <512x512 input limit, quality and identity review, transparent free-resolution expectations.
3. Wire it to an idempotent `picgift_photo_jobs` job and invoke the service-role-only quota claim **before** the Cloudflare image request.
4. Confirm global daily budget and actual Cloudflare billing usage; add an explicit kill switch. Existing premium generator remains untouched.
5. Set `picgift_flux_beta_config.enabled = true` only after the above tests pass. Do not enable merely because Cloudflare token validation succeeds.
6. Populate tester allowlist with the remaining authorized tester accounts. At the time of setting the limits, only 2 users were listed, not 12.

The separate `picgift-flux-smoke` function still limits fictional sample requests to two total per user and 20 across all testers in 24 hours; it is **not** the personal-photo beta quota.
