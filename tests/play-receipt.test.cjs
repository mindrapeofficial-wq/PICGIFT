const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto, createHash } = require('node:crypto');

const userId = '11111111-1111-4111-8111-111111111111';
const accountHash = createHash('sha256').update(userId).digest('hex');
const testKey = webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
function receipt(overrides = {}) {
  return {purchaseStateContext:{purchaseState:'PURCHASED'},
    productLineItem:[{productId:'picgift_magico_5',productOfferDetails:{quantity:1,refundableQuantity:1,consumptionState:'CONSUMPTION_STATE_YET_TO_BE_CONSUMED'}}],
    obfuscatedExternalAccountId:accountHash, purchaseCompletionTime:'2026-10-10T10:00:00Z',orderId:'GPA.test-order',...overrides};
}
async function runReceipt(purchase, {existing=null, consumeStatus=200, now='2026-11-01T12:00:00Z'} = {}) {
  const {validatePlayPurchase,isHalloweenPurchase} = await import('../supabase/functions/_shared/play-purchase.mjs');
  const key = await webcrypto.subtle.exportKey('pkcs8',(await testKey).privateKey);
  const privateKey = '-----BEGIN PRIVATE KEY-----\n'+Buffer.from(key).toString('base64')+'\n-----END PRIVATE KEY-----';
  const env={SUPABASE_URL:'https://example.test',SUPABASE_SERVICE_ROLE_KEY:'test-only',PICGIFT_GOOGLE_PLAY_ENABLED:'true',PICGIFT_GOOGLE_PLAY_PROMO_READY:'true',GOOGLE_PLAY_PACKAGE_NAME:'com.picgift.myapp',GOOGLE_PLAY_SERVICE_ACCOUNT_JSON:JSON.stringify({private_key:privateKey,client_email:'local-test@example.test'})};
  const events={inserts:[],grants:[],updates:[],requests:[],errors:[]};
  let handler;
  const db={auth:{getUser:async()=>({data:{user:{id:userId}},error:null})},
    rpc:async(name,args)=>{events.grants.push({name,args});return {data:true,error:null}},
    from(table) {
      let operation='select',value;
      const query={select(){return query},eq(){return query},
        insert(v){operation='insert';value=v;events.inserts.push(v);return query},
        update(v){operation='update';value=v;return query},
        async maybeSingle(){return {data:table==='picgift_products'?{id:'magico',google_play_product_id:'picgift_magico_5',price_cents:2490}:existing,error:null}},
        async single(){return {data:{id:'local-order',user_id:userId},error:null}},
        then(resolve,reject){if(operation==='update')events.updates.push(value);return Promise.resolve({data:null,error:null}).then(resolve,reject)}};
      return query;
    }};
  class Clock extends Date {static now(){return Date.parse(now)}}
  const context={Deno:{env:{get:name=>env[name]},serve:fn=>handler=fn},createClient:()=>db,
    validatePlayPurchase,isHalloweenPurchase,crypto:webcrypto,Date:Clock,TextEncoder,Uint8Array,URLSearchParams,Response,AbortSignal,
    btoa:v=>Buffer.from(v,'binary').toString('base64'),atob:v=>Buffer.from(v,'base64').toString('binary'),
    console:{error:(...args)=>events.errors.push(args)},
    fetch:async(url,options)=>{events.requests.push({url,method:options?.method||'GET'});
      if(url==='https://oauth2.googleapis.com/token')return Response.json({access_token:'local-oauth-token'});
      if(url.endsWith(':consume'))return new Response(null,{status:consumeStatus});
      return Response.json(purchase)}};
  const source=fs.readFileSync('supabase/functions/picgift-google-play/index.ts','utf8')
    .replace(/^import .*;\s*$/gm,'').replace(/:Uint8Array|:unknown|:any/g,'').replace(/ as string/g,'');
  vm.runInNewContext(source,context,{filename:'picgift-google-play/index.ts'});
  const response=await handler(new Request('https://example.test/billing',{method:'POST',headers:{Authorization:'Bearer local-user-token','Content-Type':'application/json'},body:JSON.stringify({product_id:'magico',purchase_token:'local-test-purchase-token'})}));
  return {status:response.status,body:await response.json(),events};
}

test('verified purchase grants and consumes once using the original promotional date after the campaign ends',async()=>{
  const result=await runReceipt(receipt());
  assert.equal(result.status,200);assert.equal(result.body.success,true);
  assert.equal(result.events.inserts[0].amount_cents,1992);
  assert.equal(result.events.grants.length,1);
  assert.equal(result.events.requests.filter(r=>r.url.endsWith(':consume')).length,1);
  assert.equal(result.events.updates.length,1);
});
test('a purchase completed after the campaign uses the regular price even when restoring an old client',async()=>{
  const result=await runReceipt(receipt({purchaseCompletionTime:'2026-10-31T23:00:00Z'}));
  assert.equal(result.status,200);assert.equal(result.events.inserts[0].amount_cents,2490);
});
test('refunded, missing and invalid quantities do not create an order, grant credits or consume a receipt',async()=>{
  for(const [quantity,refundableQuantity] of [[1,0],[1,undefined],[1,-1],[0,1],[2,2],[undefined,1]]) {
    const result=await runReceipt(receipt({productLineItem:[{productId:'picgift_magico_5',productOfferDetails:{quantity,refundableQuantity}}]}));
    assert.equal(result.status,422);assert.equal(result.events.inserts.length,0);
    assert.equal(result.events.grants.length,0);assert.equal(result.events.requests.some(r=>r.url.endsWith(':consume')),false);
  }
});
test('pending, cancelled, wrong product, missing date and a different account never grant credits',async()=>{
  const invalid=[receipt({purchaseStateContext:{purchaseState:'PENDING'}}),receipt({purchaseStateContext:{purchaseState:'CANCELLED'}}),
    receipt({productLineItem:[{productId:'wrong-product'}]}),receipt({purchaseCompletionTime:undefined}),
    receipt({purchaseCompletionTime:'invalid'}),receipt({obfuscatedExternalAccountId:'different-user'})];
  for(const purchase of invalid){const result=await runReceipt(purchase);assert.ok([403,422].includes(result.status));assert.equal(result.events.inserts.length,0);assert.equal(result.events.grants.length,0)}
});
test('an already verified and consumed order does not grant or consume again',async()=>{
  const result=await runReceipt(receipt(),{existing:{id:'existing-order',user_id:userId,status:'paid',play_consumed_at:'2026-10-10T12:00:00Z'}});
  assert.equal(result.status,200);assert.equal(result.body.order_id,'existing-order');
  assert.equal(result.events.inserts.length,0);assert.equal(result.events.grants.length,0);assert.equal(result.events.requests.length,0);
});
test('failed consumption leaves the verified order recoverable and does not mark it consumed',async()=>{
  const result=await runReceipt(receipt(),{existing:{id:'existing-order',user_id:userId,status:'paid',play_consumed_at:null},consumeStatus:503});
  assert.equal(result.status,200);assert.equal(result.events.inserts.length,0);assert.equal(result.events.grants.length,1);
  assert.equal(result.events.updates.length,0);assert.ok(result.events.errors.some(e=>e[0]==='PICGIFT_PLAY_CONSUME_NEEDS_RETRY'));
});
