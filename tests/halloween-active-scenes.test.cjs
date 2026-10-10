const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('Halloween featured scenarios shown in Create are supported end to end',()=>{
 const app=fs.readFileSync('app.js','utf8');
 const generator=fs.readFileSync('generator.js','utf8');
 const openai=fs.readFileSync('supabase/functions/picgift-generate/index.ts','utf8');
 const flux=fs.readFileSync('supabase/functions/picgift-flux-personal/index.ts','utf8');
 const migration=fs.readFileSync('supabase/migrations/20261010205500_activate_halloween_reference_scenes.sql','utf8');
 const match=app.match(/const referenceScenes=(\[[^\n]*\]);/);
 assert.ok(match,'missing featured reference scenes');
 const featured=JSON.parse(match[1]);
 assert.equal(featured.length,4);
 for(const scene of featured){
  assert.match(scene.id,/^halloween-[a-z-]+$/);
  assert.equal(scene.source,'picgift');
  assert.equal(scene.previewOnly,false);
  assert.equal(scene.status,'pilot');
  assert.ok(fs.existsSync(scene.image),scene.image);
  assert.ok(generator.includes("'"+scene.id+"'"),'missing generator scene '+scene.id);
  assert.ok(openai.includes('"'+scene.id+'"'),'missing premium backend pose '+scene.id);
  assert.ok(flux.includes('"'+scene.id+'"'),'missing FLUX backend allowlist '+scene.id);
  assert.ok(migration.includes("'"+scene.id+"'"),'missing server recipe '+scene.id);
 }
 assert.ok(app.includes("scenes.filter(scene=>scene.source==='picgift')"),'creator must exclude non-usable concept previews');
 assert.ok(app.includes('!featuredIds.has(scene.id)'),'repeated catalog renders must not duplicate active scenes');
 assert.ok(openai.includes('(?:backdrops|reference)'),'premium backend must accept supplied reference assets');
 assert.ok(flux.includes('scenesCount===SCENES.length'),'FLUX health must validate all enabled sets');
});
