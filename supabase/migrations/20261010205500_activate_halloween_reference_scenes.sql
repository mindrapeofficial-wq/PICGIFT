-- Four owner-provided Halloween reference backgrounds are now genuine portrait sets.
-- Reuse the validated Halloween photo/identity rules, but give each set its own physical composition.
-- Keep the ID, private-generation allowlist, public asset and prompt consistent.
WITH additions(scene_id, asset, setting, pose_safety, composition_prompt) AS (
 VALUES
 ('halloween-pumpkin-forest','pumpkin-forest',
 'Woodland path at dusk with glowing carved pumpkins, orange autumn trees, lanterns, leaves, stone steps and a distant fairy-tale castle',
 'Place subject on a clear path or stone step with accurate foot contact, depth and amber light. Preserve foreground pumpkins; keep face unobstructed.',
 'Integrate the photographed subject into the supplied empty pumpkin forest set. Keep its glowing jack-o-lanterns, golden autumn foliage, stone path, perspective, atmospheric castle and warm evening lighting. Ground feet naturally on the pathway, realistic skin and hair, no illustrated face, no added people.'),
 ('halloween-haunted-castle','haunted-castle',
 'Dramatic moonlit gothic castle on a rocky hill with warm orange windows, clouds, bare trees and foreground pathway',
 'Position the subject on an accessible foreground path with clear floor contact; do not suspend anyone above the cliff or obscure their face.',
 'Place the photographed subject naturally on the foreground path of the supplied empty haunted castle set. Preserve gothic spires, warm window glow, dark rocky landscape and moonlit sky. Match perspective and rim lighting, photographic face and hands, physically coherent shadows, no extra people.'),
 ('halloween-portrait-hall','portrait-hall',
 'Victorian portrait gallery with antique wooden frames, ornate walls, gilded candelabras, candlelight and a stone-floor aisle',
 'Subject stands on the clear gallery floor, never inside or painted into a framed portrait. Match candlelight and avoid hiding the face.',
 'Place the photographed subject in the foreground of the supplied empty historic portrait hall, standing on the real floor. Preserve framed paintings as architectural set dressing, gilded sconces and warm candlelight; maintain realistic depth and natural facial detail, realistic contact shadows, no new portraits of the subject or added people.'),
 ('halloween-enchanted-city','enchanted-city',
 'Moonlit fantasy cobblestone street, glowing amber windows, gothic rooftops, lanterns, pumpkins and autumn ivy',
 'Stand on the street with natural contact shadows and safe distance from props; preserve perspective and original visible people.',
 'Integrate the photographed subject on the street of the supplied empty enchanted city background. Preserve moody blue night lighting, amber lamps, atmospheric architecture, cobblestones and pumpkins. Blend authentic photographic skin, fabric and face with coherent warm/cool lighting and natural ground contact, no extra people.')
)
INSERT INTO public.picgift_scene_recipes(scene_id,scene_image_url,recipe,enabled,updated_at)
SELECT
 a.scene_id,
 'https://picgift.onrender.com/assets/halloween/reference/'||a.asset||'.webp',
 base.recipe || jsonb_build_object(
  'version','2026.3',
  'scene',base.recipe->'scene'||jsonb_build_object('description',a.setting,'safety',a.pose_safety),
  'flux_prompt',a.composition_prompt,
  'scene_image_url','https://picgift.onrender.com/assets/halloween/reference/'||a.asset||'.webp'
 ),
 true,now()
FROM additions a
CROSS JOIN public.picgift_scene_recipes base
WHERE base.scene_id='halloween-autumn-arch' AND base.enabled=true
ON CONFLICT(scene_id) DO UPDATE SET
 scene_image_url=excluded.scene_image_url,
 recipe=excluded.recipe,
 enabled=excluded.enabled,
 updated_at=now();
