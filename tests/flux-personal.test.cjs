const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const backend=read('supabase/functions/picgift-flux-personal/index.ts');
const frontend=read('generator.js');
const index=read('index.html');
const review=read('flux-review-admin.js');

test('Personal FLUX worker requires verified login and a server quota claim',()=>{
 assert.match(backend,/auth\.getUser\(token\)/);
 assert.match(backend,/email_confirmed_at/);
 assert.match(backend,/picgift_claim_flux_free_photo/);
 assert.doesNotMatch(backend,/restricted_to_testers/);
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
test('Free beta portraits remain private to their owner and manual review stays admin-protected',()=>{
 assert.match(backend,/resultPath=owner\+"\/"\+id/);
 assert.match(backend,/mark\(id,owner,"completed",\{result_path:resultPath,result_quality:"unverified"\}\)/);
 assert.match(backend,/job\.status!=="needs_review"/);
 assert.match(backend,/confirmed!==true/);
 assert.match(backend,/picgift_admin_users/);
 assert.match(review,/action:'review'/);
 assert.match(review,/decision:'preview'/);
});
test('The former free worker stays private while the browser no longer invokes it',()=>{
 assert.doesNotMatch(frontend,/picgift-flux-personal|fluxMode|smallFluxImage/);
 assert.match(frontend,/picgift-uploads/);
 assert.match(frontend,/guardian_consent:consent===true/);
});
test('Only Premium remains selectable and billing mode is explicit',()=>{
 assert.match(frontend,/service!=='premium'/);
 assert.match(frontend,/premiumTrialRemaining>0\?'pilot':'credits'/);
 assert.doesNotMatch(frontend,/confirm_fictional_samples/);
 assert.doesNotMatch(index,/id="choose-free-photo"/);
 assert.match(index,/id="choose-premium-photo"/);
 assert.match(index,/para menores o personas que requieran representaci.n, soy su representante legal facultado o cuento con su autorizaci.n expresa/i);
});
test('Both references retain their semantic roles and complete recipe instructions',async()=>{
 const {buildPortraitPrompt}=await import('../supabase/functions/_shared/portrait-prompt.ts');
 const recipe={recipe:{identity_rules:{preserve:['unique-face-marker']},photography:{composition:'body-proportion-marker'},quality:{review:'quality-marker'},flux_prompt:'scene-marker'}};
 const job={requested_format:'vertical',requested_pose:'standing',requested_outfit:'wizard'};
 const prompt=buildPortraitPrompt(recipe,{analysis_available:false},job,[{kind:'body'}]);
 for(const marker of ['unique-face-marker','body-proportion-marker','quality-marker','scene-marker'])assert.ok(prompt.includes(marker));
 assert.ok(prompt.includes('in this order: body.'));
 assert.match(backend,/buildPortraitPrompt\(scene,/);
 assert.match(backend,/extras\.push\(\{kind,blob:/);
});
