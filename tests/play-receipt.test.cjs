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
async function runReceipt(purchase, {existing=null, consumeStatus=200, consumeThrows=false, orderTotal=null, ordersStatus=200, ordersThrows=false, amountSaveError=false, now='2026-11-01T12:00:00Z', salesEnabled='true', promoReady='true'} = {}) {
  const {validatePlayPurchase,isHalloweenPurchase} = await import('../supabase/functions/_shared/play-purchase.mjs');
  const {readPlayOrderMoney}=await import('../supabase/functions/_shared/play-order-money.mjs');
  const key = await webcrypto.subtle.exportKey('pkcs8',(await testKey).privateKey);
  const privateKey = '-----BEGIN PRIVATE KEY-----\n'+Buffer.from(key).toString('base64')+'\n-----END PRIVATE KEY-----';
  const env={SUPABASE_URL:'https://example.test',SUPABASE_SERVICE_ROLE_KEY:'test-only',PICGIFT_GOOGLE_PLAY_ENABLED:'true',PICGIFT_GOOGLE_PLAY_PROMO_READY:'true',GOOGLE_PLAY_PACKAGE_NAME:'com.picgift.myapp',GOOGLE_PLAY_SERVICE_ACCOUNT_JSON:JSON.stringify({private_key:privateKey,client_email:'local-test@example.test'})};
  env.PICGIFT_GOOGLE_PLAY_ENABLED=salesEnabled; env.PICGIFT_GOOGLE_PLAY_PROMO_READY=promoReady;
  const events={inserts:[],grants:[],updates:[],requests:[],errors:[]};
  let handler;
  const db={auth:{getUser:async()=>({data:{user:{id:userId}},error:null})},
    rpc:async(name,args)=>{events.grants.push({name,args});return {data:true,error:null}},
    from(table) {
      let operation='select',value;
      const query={select(){return query},eq(){return query},
        insert(v){operation='insert';value=v;events.inserts.push(v);return query},
        update(v){operation='update';value=v;return query},
        async maybeSingle(){if(operation==='update'){events.updates.push(value);return {data:{id:'local-order'},error:null}}return {data:table==='picgift_products'?{id:'magico',google_play_product_id:'picgift_magico_5',price_cents:2490}:existing,error:null}},
        async single(){return {data:{id:'local-order',user_id:userId},error:null}},
        then(resolve,reject){if(operation==='update')events.updates.push(value);return Promise.resolve({data:null,error:amountSaveError&&value?.amount_source?{message:'private-db-error'}:null}).then(resolve,reject)}};
      return query;
    }};
  class Clock extends Date {static now(){return Date.parse(now)}}
  const context={Deno:{env:{get:name=>env[name]},serve:fn=>handler=fn},createClient:()=>db,
    validatePlayPurchase,isHalloweenPurchase,readPlayOrderMoney:opts=>readPlayOrderMoney({...opts,request:context.fetch}),crypto:webcrypto,Date:Clock,TextEncoder,Uint8Array,URLSearchParams,Response,AbortSignal,
    btoa:v=>Buffer.from(v,'binary').toString('base64'),atob:v=>Buffer.from(v,'base64').toString('binary'),
    console:{error:(...args)=>events.errors.push(args)},
    fetch:async(url,options)=>{events.requests.push({url,method:options?.method||'GET'});
      if(url==='https://oauth2.googleapis.com/token')return Response.json({access_token:'local-oauth-token'});
      if(url.includes('/orders/')){if(ordersThrows)throw Error('private-transport-failure');return Response.json(orderTotal||{},{status:ordersStatus})}
      if(url.endsWith(':consume')){if(consumeThrows)throw new DOMException('Timed out','TimeoutError');return new Response(null,{status:consumeStatus})}
      return Response.json(purchase)}};
  const source=fs.readFileSync('supabase/functions/picgift-google-play/index.ts','utf8')
    .replace(/^import .*;\s*$/gm,'').replace(/:Uint8Array|:unknown|:any/g,'').replace(/ as string/g,'');
  vm.runInNewContext(source,context,{filename:'picgift-google-play/index.ts'});
  const response=await handler(new Request('https://example.test/billing',{method:'POST',headers:{Authorization:'Bearer local-user-token','Content-Type':'application/json'},body:JSON.stringify({product_id:'magico',purchase_token:'local-test-purchase-token'})}));
  return {status:response.status,body:await response.json(),events};
}

const providerOrder=(total={currencyCode:'EUR',units:'19',nanos:920000000},overrides={})=>({orderId:'GPA.test-order',purchaseToken:'local-test-purchase-token',lineItems:[{productId:'picgift_magico_5',oneTimePurchaseDetails:{quantity:1}}],total,...overrides});
test('verified purchase grants and consumes once and records the actual Google total',async()=>{
  const result=await runReceipt(receipt(),{orderTotal:providerOrder()});
  assert.equal(result.status,200);assert.equal(result.body.success,true);
  assert.equal(result.events.inserts[0].amount_cents,null);assert.equal(result.events.inserts[0].amount_source,'unavailable');
  assert.equal(result.events.updates.at(-1).amount_cents,1992);assert.equal(result.events.updates.at(-1).currency,'eur');
  assert.equal(result.events.grants.length,1);
  assert.equal(result.events.requests.filter(r=>r.url.endsWith(':consume')).length,1);
  assert.equal(result.events.updates.length,2);
});
test('purchase date never invents an EUR amount for another country or promotion',async()=>{
  const result=await runReceipt(receipt({purchaseCompletionTime:'2026-10-31T23:00:00Z'}),{orderTotal:providerOrder({currencyCode:'USD',units:'21',nanos:370000000})});
  assert.equal(result.status,200);assert.equal(result.events.updates.at(-1).amount_cents,2137);assert.equal(result.events.updates.at(-1).currency,'usd');
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
test('an already consumed order rechecks Google without granting or consuming again',async()=>{
  const purchase=receipt();purchase.productLineItem[0].productOfferDetails.consumptionState='CONSUMPTION_STATE_CONSUMED';
  const result=await runReceipt(purchase,{existing:{id:'existing-order',user_id:userId,status:'paid',play_consumed_at:'2026-10-10T12:00:00Z'}});
  assert.equal(result.status,200);assert.equal(result.body.order_id,'existing-order');
  assert.equal(result.events.inserts.length,0);assert.equal(result.events.grants.length,0);assert.equal(result.events.requests.length,3);
});
test('failed consumption leaves the verified order recoverable and does not mark it consumed',async()=>{
  const result=await runReceipt(receipt(),{existing:{id:'existing-order',user_id:userId,status:'paid',play_consumed_at:null},consumeStatus:503});
  assert.equal(result.status,200);assert.equal(result.events.inserts.length,0);assert.equal(result.events.grants.length,0);
  assert.equal(result.events.updates.length,0);assert.ok(result.events.errors.some(e=>e[0]==='PICGIFT_PLAY_CONSUME_NEEDS_RETRY'));
  assert.equal(result.body.consumption_pending,true);
});

test('a consumption timeout after credit delivery returns recoverable success rather than a failed payment',async()=>{
  const result=await runReceipt(receipt(),{consumeThrows:true});
  assert.equal(result.status,200);assert.equal(result.body.success,true);assert.equal(result.body.consumption_pending,true);
  assert.equal(result.events.grants.length,1);assert.equal(result.events.grants[0].name,'picgift_grant_order');assert.equal(result.events.updates.length,0);
});

test('restoring a consumed purchase checks for a later refund and reverses its credits',async()=>{
  for(const cancelled of [false,true]){
    const purchase=receipt();purchase.productLineItem[0].productOfferDetails.consumptionState='CONSUMPTION_STATE_CONSUMED';
    if(cancelled)purchase.purchaseStateContext.purchaseState='CANCELLED';else purchase.productLineItem[0].productOfferDetails.refundableQuantity=0;
    const result=await runReceipt(purchase,{existing:{id:'existing-order',user_id:userId,status:'paid',provider_payment_id:'GPA.test-order',play_consumed_at:'2026-10-10T12:00:00Z'}});
    assert.equal(result.status,409);assert.equal(result.events.grants.length,1);assert.equal(result.events.grants[0].name,'picgift_revoke_order');
    assert.equal(result.events.requests.filter(r=>r.url.endsWith(':consume')).length,0);
  }
});

test('refund evidence for another account or order cannot reverse a paid purchase',async()=>{
  for(const changes of [{obfuscatedExternalAccountId:'different-user'},{orderId:'GPA.other-order'}]){
    const purchase=receipt(changes);purchase.productLineItem[0].productOfferDetails.refundableQuantity=0;
    const result=await runReceipt(purchase,{existing:{id:'existing-order',user_id:userId,status:'paid',provider_payment_id:'GPA.test-order',play_consumed_at:'2026-10-10T12:00:00Z'}});
    assert.equal(result.status,422);assert.equal(result.events.grants.length,0);assert.equal(result.events.updates.length,0);
  }
});

test('closing sales and promotional checkout never blocks a valid purchase already paid to Google',async()=>{
  const result=await runReceipt(receipt(),{salesEnabled:'false',promoReady:'false',now:'2026-10-13T12:00:00Z'});
  assert.equal(result.status,200);assert.equal(result.events.grants.length,1);
  assert.equal(result.body.consumption_pending,false);
});

test('an existing token for another product or a refunded order never returns a paid success',async()=>{
  for(const existing of [
    {id:'other-product',user_id:userId,product_id:'esencial',status:'paid',play_consumed_at:'2026-10-10T12:00:00Z'},
    {id:'refunded-order',user_id:userId,product_id:'magico',status:'refunded',play_consumed_at:null}
  ]) {
    const result=await runReceipt(receipt(),{existing});
    assert.equal(result.status,409);assert.equal(result.events.grants.length,0);assert.equal(result.events.requests.length,0);
  }
});

test('missing, unavailable or timed-out Orders accounting never prevents credit delivery or consumption',async()=>{
 for(const options of [{},{ordersStatus:403},{ordersStatus:503},{ordersThrows:true}]){
  const r=await runReceipt(receipt(),options);
  assert.equal(r.status,200);assert.equal(r.body.success,true);assert.equal(r.body.consumption_pending,false);
  assert.equal(r.events.grants.length,1);assert.equal(r.events.inserts[0].amount_cents,null);assert.equal(r.events.inserts[0].currency,null);
  assert.equal(r.events.updates.some(x=>x.amount_source),false);assert.doesNotMatch(JSON.stringify(r.body),/private-/);
 }
});
test('an accounting save failure cannot turn an already credited purchase into a payment failure',async()=>{
 const r=await runReceipt(receipt(),{orderTotal:providerOrder(),amountSaveError:true});
 assert.equal(r.status,200);assert.equal(r.body.success,true);assert.equal(r.body.consumption_pending,false);assert.equal(r.events.grants.length,1);
 assert.ok(r.events.errors.some(x=>x[0]==='PICGIFT_PLAY_AMOUNT_NEEDS_RETRY'));
});
test('a consumed order can fill a missing total on restore without granting credits twice',async()=>{
 const purchase=receipt();purchase.productLineItem[0].productOfferDetails.consumptionState='CONSUMPTION_STATE_CONSUMED';
 const r=await runReceipt(purchase,{existing:{id:'existing',user_id:userId,status:'paid',provider_payment_id:'GPA.test-order',play_consumed_at:'saved',amount_source:'unavailable'},orderTotal:providerOrder()});
 assert.equal(r.status,200);assert.equal(r.events.grants.length,0);assert.equal(r.events.updates.at(-1).amount_source,'google_orders');
 assert.equal(r.events.requests.some(x=>x.url.endsWith(':consume')),false);
});
test('Google license tests stay identifiable and still receive usable credits',async()=>{
 const r=await runReceipt(receipt({testPurchaseContext:{fopType:'TEST'}}));
 assert.equal(r.status,200);assert.equal(r.events.inserts[0].play_test_purchase,true);assert.equal(r.events.grants.length,1);
});
test('Google Money preserves precision and never accepts another receipt or invalid amount',async()=>{
 const {playOrderMoney}=await import('../supabase/functions/_shared/play-order-money.mjs');
 const identity={orderId:'GPA.test-order',purchaseToken:'local-test-purchase-token',productId:'picgift_magico_5'};
 const threeDecimals=playOrderMoney(providerOrder({currencyCode:'KWD',units:'2',nanos:123000000}),identity);
 assert.equal(threeDecimals.amount_cents,null);assert.equal(threeDecimals.play_order_total.nanos,123000000);assert.equal(threeDecimals.currency,'kwd');
 assert.equal(playOrderMoney(providerOrder({currencyCode:'JPY',units:'580'}),identity).amount_cents,58000);
 assert.equal(playOrderMoney(providerOrder({currencyCode:'EUR'}),identity).amount_cents,0);
 assert.equal(playOrderMoney(providerOrder({currencyCode:'EUR',units:'9999999999999999999'}),identity).amount_cents,null);
 for(const money of [{currencyCode:'eur',units:'2'},{currencyCode:'EUR',units:'-1'},{currencyCode:'EUR',units:2},{currencyCode:'EUR',units:'2',nanos:-1},{currencyCode:'EUR',units:'2',nanos:1000000000}])assert.equal(playOrderMoney(providerOrder(money),identity),null);
 for(const changes of [{orderId:'another'},{purchaseToken:'another'},{lineItems:[]},{lineItems:[{productId:'other',oneTimePurchaseDetails:{quantity:1}}]}])assert.equal(playOrderMoney(providerOrder(undefined,changes),identity),null);
 assert.deepEqual(Object.keys(threeDecimals).sort(),['amount_cents','amount_source','currency','play_order_total']);
});
