const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const premium=read('supabase/functions/picgift-generate/index.ts');
const free=read('supabase/functions/picgift-flux-personal/index.ts');
const frontend=read('generator.js');

test('Premium checks the authenticated private photo before reserving quota or spending credit',()=>{
 const preflight=premium.lastIndexOf('photoCheck=await assessPhoto(');
 assert.ok(preflight>=0);
 assert.ok(preflight<premium.lastIndexOf('picgift_claim_premium_photo'));
 assert.ok(preflight<premium.lastIndexOf('picgift_spend_credit'));
 assert.match(premium,/if\(!photoCheck\.approved\)return respond\(\{code:"photo_not_suitable"/);
 assert.match(premium,/credit_spent:false/);
});

test('Free FLUX validates the private original before using its daily allowance',()=>{
 const preflight=free.lastIndexOf('photoCheck=await assessPhoto(');
 assert.ok(preflight>=0);
 assert.ok(preflight<free.lastIndexOf('picgift_claim_flux_free_photo'));
 assert.ok(preflight<free.lastIndexOf('EdgeRuntime.waitUntil(generate('));
 assert.match(free,/if\(!photoCheck\.approved\)return reply\(\{code:"photo_not_suitable"/);
});

test('The browser displays the real preflight reason, explains no credit was spent and discards rejected uploads',()=>{
 assert.match(frontend,/code=j\.code\|\|''/);
 assert.match(frontend,/preflightStopped/);
 assert.match(frontend,/No se han consumido créditos ni intentos/);
 assert.match(frontend,/preflightStopped\)&&uploadedPaths\.length/);
});

test('Conservative model policy only rejects serious flaws without discriminating by age or pose',()=>{
 const policy=read('supabase/functions/_shared/photo-preflight.ts');
 assert.match(policy,/full-body shot is preferable but NOT mandatory/i);
 assert.match(policy,/children and adults/);
 assert.match(policy,/Do not identify/);
 assert.match(policy,/store:false/);
 assert.match(policy,/if\(!apiKey\)throw Error\("photo_preflight_unavailable"\)/);
 assert.match(policy,/result\.decision==="pass"/);
 assert.match(policy,/Object\.prototype\.hasOwnProperty\.call\(REASONS,item\)/);
});

test('AI photo preflight does not send images if the private analysis service is not configured',async()=>{
 const {assessPhoto}=await import('../supabase/functions/_shared/photo-preflight.ts');
 await assert.rejects(()=>assessPhoto(new Blob(['image'],{type:'image/jpeg'}),''),/photo_preflight_unavailable/);
});

test('Preflight accepts suitable images and blocks bad or uncertain photos',async()=>{
 const {assessPhoto}=await import('../supabase/functions/_shared/photo-preflight.ts');
 const original=globalThis.fetch;
 const photo=new Blob([new Uint8Array(3000)],{type:'image/jpeg'});
 try{
  for(const [decision,reasons,approved,code] of [
   ['pass',[],true,'pass'],
   ['reject',['very_blurry'],false,'very_blurry'],
   ['review',['uncertain'],false,'uncertain']
  ]){
   globalThis.fetch=async(_url,init)=>{
    const body=JSON.parse(init.body);
    assert.equal(body.model,'gpt-4.1-mini');
    assert.equal(body.store,false);
    assert.equal(body.input[0].content[1].type,'input_image');
    return new Response(JSON.stringify({output:[{content:[{text:JSON.stringify({decision,reasons})}]}]}),{status:200});
   };
   const result=await assessPhoto(photo,'private-test-key');
   assert.equal(result.approved,approved);
   assert.equal(result.code,code);
  }
 }finally{globalThis.fetch=original}
});
