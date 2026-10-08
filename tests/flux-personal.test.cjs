const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const backend=read('supabase/functions/picgift-flux-personal/index.ts');
const frontend=read('generator.js');
const index=read('index.html');
const review=read('flux-review-admin.js');

test('Personal FLUX worker requires verified login and pilot membership',()=>{
 assert.match(backend,/auth\.getUser\(token\)/);
 assert.match(backend,/email_confirmed_at/);
 assert.match(backend,/picgift_ai_pilot_users/);
});
test('Server kill switch, recipe allowlist and quota guard all precede provider invocation',()=>{
 assert.match(backend,/config\?\.enabled===true/);
 assert.match(backend,/const SCENES=/);
 assert.match(backend,/SCENES\.includes\(scene\)/);
 assert.match(backend,/picgift_claim_flux_free_photo/);
 assert.ok(backend.indexOf('picgift_claim_flux_free_photo')<backend.lastIndexOf('EdgeRuntime.waitUntil(generate('));
});
test('Source files and FLUX reference paths are scoped to the session user',()=>{
 assert.match(backend,/parts\[0\]!==user\.id/);
 assert.match(backend,/uuid\.test\(parts\[1\]\)/);
 assert.match(backend,/flux_subject/);
 assert.match(backend,/flux_scene/);
 assert.match(backend,/jpegDimensions/);
 assert.match(backend,/size\[0\]>511\|\|size\[1\]>511/);
});
test('No automatic access to generated portraits before quality review',()=>{
 assert.match(backend,/mark\(id,owner,"needs_review"/);
 assert.match(backend,/job\.status!=="needs_review"/);
 assert.match(backend,/confirmed!==true/);
 assert.match(backend,/picgift_admin_users/);
 assert.match(review,/action:'review'/);
 assert.match(review,/decision:'preview'/);
});
test('Browser scales each personal and scene reference without leaving the private bucket',()=>{
 assert.match(frontend,/480\/Math\.max\(bitmap\.width,bitmap\.height\)/);
 assert.match(frontend,/picgift-uploads/);
 assert.match(frontend,/flux-scene\.jpg/);
 assert.match(frontend,/flux-subject\.jpg/);
 assert.match(frontend,/guardian_consent:consent===true/);
});
test('Halloween never falls back to the paid OpenAI engine',()=>{
 assert.match(frontend,/const halloween=document\.documentElement\.dataset\.campaign==='halloween'/);
 assert.match(frontend,/const data=halloween\?\(fluxChecked\?beta\.data:/);
 assert.match(index,/autorizaci.n expresa de sus representantes/i);
});
