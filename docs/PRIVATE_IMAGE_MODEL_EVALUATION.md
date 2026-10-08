# PICGIFT: private open-weight image editing evaluation

Status: candidate selection only. NOT deployed or enabled in production.

## Candidate
- Model: Qwen/Qwen-Image-Edit-2511
- Official weights: https://huggingface.co/Qwen/Qwen-Image-Edit-2511
- License: Apache-2.0 (verify dependencies and hosting separately).
- Download: approximately 57.7 GB of model files in the official repository.
- Run on a dedicated GPU service, NOT in the Android bundle, static website or client browser.

## Intended PICGIFT behavior
1. Accept an authenticated user-uploaded portrait and selected, authorized scene.
2. Edit/composite a photograph, rather than generate an unrelated new person's face.
3. Prioritize the identity and age-appropriate appearance of the source subject: facial geometry, eyes, nose, mouth, ears, hair, head/body proportions.
4. Preserve natural skin tones, realistic lens perspective, believable shadows, proper scale, clean hands, edges, background integration and neutral white balance.
5. Respect pose and clothing requests when feasible; avoid inventing unnecessary people or objects.
6. For seasonal scenes, render convincing professional photography, not cartoons or obvious CGI.
7. If identity or anatomical quality fails, return REVIEW/FAIL; do not falsely label output as a successful portrait.
8. Never store or log raw private prompts, original photos, credentials or personal information in the public repository.

## Architecture and rollout checklist
- Keep all proprietary scene recipes and prompt templates server-side in the private generation service.
- Introduce a server-side configurable `image_edit_provider` with an independent adapter for this model.
- Preserve existing paid generation/provider configuration until comparative quality and costs are proven.
- Use a server-side authenticated generation endpoint, server-side authorization of reference files, short-lived object URLs, consent and retention controls.
- Enforce concurrency, inference timeout, spending cap, and daily per-tester quotas.
- Do not grant production credits for failed/review-required paid generations.
- Test a representative permissioned evaluation set across children, adults, angles, curly hair, diverse lighting, seated/standing poses, busy Christmas/Halloween scenes. Check face consistency, body anatomy, fabric, lighting, scene fit and usability.
- Compare total GPU costs per successful PASS image against the current standard provider baseline of EUR 0.07 per image, including reruns, idle GPU, storage, and bandwidth.
- Only enable a small beta cohort after GPU availability, licensing, privacy review, deployment and quality acceptance.

## Minimal inference example (isolated GPU host, not an app dependency)

```python
import torch
from diffusers import DiffusionPipeline
from diffusers.utils import load_image

model_id = "Qwen/Qwen-Image-Edit-2511"
pipe = DiffusionPipeline.from_pretrained(model_id, dtype=torch.bfloat16, device_map="cuda")
# Replace example paths with secure, consented files in private infrastructure.
source = load_image("/private/input.jpg")
result = pipe(image=source, prompt="Professional photorealistic image editing. Preserve the subject's recognizable identity and natural lighting.").images[0]
result.save("/private/output.png")
```

Do not run this unbounded in a public web request. Set a measured resolution, inference parameters, hardware profile and maximum job duration when building the private worker.
