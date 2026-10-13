const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash,webcrypto}=require('node:crypto');
const fs=require('node:fs');
const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const userId='11111111-1111-4111-8111-111111111111';
const accountHash=createHash('sha256').update(userId).digest('hex');
const orderId='22222222-2222-4222-8222-222222222222';
const order=(changes={})=>({id:orderId,user_id:userId,product_id:'magico',provider:'google_play',provider_checkout_id:'test-purchase-token',provider_payment_id:'GPA.test-order',status:'paid',credits_awarded:5,play_consumed_at:null,...changes});
const purchase=(changes={})=>({orderId:'GPA.test-order',obfuscatedExternalAccountId:accountHash,purchaseStateContext:{purchaseState:'PURCHASED'},purchaseCompletionTime:'2026-10-13T10:00:00Z',productLineItem:[{productId:'picgift_magico_5',productOfferDetails:{quantity:1,refundableQuantity:1,consumptionState:'CONSUMPTION_STATE_YET_TO_BE_CONSUMED'}}],...changes});
const voided=(changes={})=>({purchaseToken:'test-purchase-token',orderId:'GPA.test-order',...changes});

function fixture({orders=[order()],pages=[{}],receipt=purchase(),consumeStatus=200,beforeUpdate=null,databaseError=false}={}){
 const rows=orders.map(value=>({...value}));const ledger=[],requests=[],rpcs=[];
 let consumeCalls=0;
 const db={from(table){
  let operation='read',change,filters=[],limit=Infinity,sort;
  const q={select(){return q},eq(k,v){filters.push(row=>row[k]===v);return q},is(k,v){filters.push(row=>(row[k]??null)===v);return q},in(k,values){filters.push(row=>values.includes(row[k]));return q},gt(k,v){filters.push(row=>row[k]>v);return q},order(k){sort=k;return q},limit(n){limit=n;return q},update(value){operation='update';change=value;return q},
   async execute(single){
    if(databaseError)return {data:null,error:{code:'test-unavailable'}};
    if(operation==='update'&&beforeUpdate){const callback=beforeUpdate;beforeUpdate=null;await callback(rows,db)}
    const data=(table==='picgift_products'?[{id:'magico',google_play_product_id:'picgift_magico_5'}]:rows).filter(row=>filters.every(filter=>filter(row)));
    if(sort)data.sort((a,b)=>String(a[sort]).localeCompare(String(b[sort])));
    const selected=data.slice(0,limit);
    if(operation==='update')selected.forEach(row=>Object.assign(row,change));
    return {data:single?(selected[0]?{...selected[0]}:null):selected.map(row=>({...row})),error:null};
   },maybeSingle(){return q.execute(true)},then(resolve,reject){return q.execute(false).then(resolve,reject)}};
  return q;
 },async rpc(name,args){
  rpcs.push({name,args});const row=rows.find(row=>row.id===args.p_order);
  if(!row)return {data:false};
  if(name==='picgift_grant_order'){
   if(row.status==='paid')return {data:true};
   if(row.status!=='pending')return {data:false};
   row.status='paid';row.credits_awarded=5;row.provider_payment_id=args.p_provider_ref;ledger.push(5);return {data:true};
  }
  if(name==='picgift_revoke_order'){
   if(row.status==='refunded')return {data:true};
   if(row.status!=='paid')return {data:false};
   row.status='refunded';ledger.push(-row.credits_awarded);return {data:true};
  }
  throw Error('unexpected-rpc');
 }};
 const request=async(url,options)=>{
  requests.push({url,options});const parsed=new URL(url);
  if(parsed.pathname.endsWith('/voidedpurchases')){
   const page=Number(parsed.searchParams.get('pageSelection.token')||0);
   const value=pages[page]||{};return value instanceof Response?value:Response.json(value);
  }
  if(parsed.pathname.endsWith(':consume')){consumeCalls++;return new Response(null,{status:typeof consumeStatus==='function'?consumeStatus(consumeCalls):consumeStatus})}
  if(parsed.pathname.includes('/productsv2/tokens/'))return receipt instanceof Response?receipt:Response.json(receipt);
  throw Error('unexpected-provider-route');
 };
 return {db,rows,ledger,requests,rpcs,request,get consumeCalls(){return consumeCalls},async run(extra={}){
  const {reconcilePlayPurchases}=await import('../supabase/functions/_shared/play-reconciliation.mjs');
  return reconcilePlayPurchases({db,access:'local-test-access',packageName:'com.picgift.myapp',request,now:Date.parse('2026-10-13T12:00:00Z'),...extra});
 }};
}

test('full refunds of consumed purchases are paginated and reversed exactly once across repeated runs',async()=>{
 const f=fixture({orders:[order({play_consumed_at:'2026-10-13T11:00:00Z'})],pages:[{voidedPurchases:[voided()],tokenPagination:{nextPageToken:'1'}},{voidedPurchases:[voided()]}]});
 const result=await f.run();await f.run();
 assert.equal(result.complete,true);assert.equal(result.checked_voided,2);
 assert.equal(f.rows[0].status,'refunded');assert.deepEqual(f.ledger,[-5]);assert.equal(f.consumeCalls,0);
 assert.ok(f.requests.some(r=>new URL(r.url).searchParams.get('pageSelection.token')==='1'));
});

test('a refund before credit delivery blocks a later grant without creating a negative ledger entry',async()=>{
 const f=fixture({orders:[order({status:'pending',credits_awarded:0,provider_payment_id:null})],pages:[{voidedPurchases:[voided()]}]});
 assert.equal((await f.run()).complete,true);
 const lateGrant=await f.db.rpc('picgift_grant_order',{p_order:orderId,p_provider_ref:'GPA.test-order'});
 assert.equal(lateGrant.data,false);assert.deepEqual(f.ledger,[]);assert.equal(f.rows[0].status,'refunded');
});

test('a concurrent grant winning the row update is revoked through the locking RPC',async()=>{
 const f=fixture({orders:[order({status:'pending',credits_awarded:0,provider_payment_id:null})],pages:[{voidedPurchases:[voided()]}],
  beforeUpdate:async(_rows,db)=>{await db.rpc('picgift_grant_order',{p_order:orderId,p_provider_ref:'GPA.test-order'})}});
 assert.equal((await f.run()).complete,true);assert.deepEqual(f.ledger,[5,-5]);assert.equal(f.rows[0].status,'refunded');
});

test('failed consumption retries without granting twice and only records successful consumption',async()=>{
 const f=fixture({orders:[order({status:'pending',credits_awarded:0,provider_payment_id:null})],consumeStatus:attempt=>attempt===1?503:200});
 const first=await f.run();assert.equal(first.complete,false);assert.equal(first.errors[0].code,'play_consume_pending');
 assert.equal(f.rows[0].play_consumed_at,null);assert.deepEqual(f.ledger,[5]);
 const second=await f.run();assert.equal(second.complete,true);assert.ok(f.rows[0].play_consumed_at);assert.deepEqual(f.ledger,[5]);assert.equal(f.consumeCalls,2);
});

test('Google already consumed a valid receipt: repair the local marker without consuming or granting again',async()=>{
 const receipt=purchase();receipt.productLineItem[0].productOfferDetails.consumptionState='CONSUMPTION_STATE_CONSUMED';
 const f=fixture({receipt});assert.equal((await f.run()).complete,true);
 assert.equal(f.consumeCalls,0);assert.equal(f.rpcs.length,0);assert.ok(f.rows[0].play_consumed_at);
});

test('a cancelled receipt missed by the voided feed reverses a paid order instead of consuming it',async()=>{
 const f=fixture({receipt:purchase({purchaseStateContext:{purchaseState:'CANCELLED'}})});
 assert.equal((await f.run()).complete,true);assert.equal(f.rows[0].status,'refunded');assert.deepEqual(f.ledger,[-5]);assert.equal(f.consumeCalls,0);
});

test('wrong account, product, order, quantity or pending payment never grants or consumes',async()=>{
 const variants=[purchase({obfuscatedExternalAccountId:'other-account'}),purchase({orderId:'GPA.wrong'}),purchase({purchaseStateContext:{purchaseState:'PENDING'}})];
 const wrongProduct=purchase();wrongProduct.productLineItem[0].productId='other-product';variants.push(wrongProduct);
 const wrongQuantity=purchase();wrongQuantity.productLineItem[0].productOfferDetails.quantity=2;variants.push(wrongQuantity);
 for(const receipt of variants){const f=fixture({orders:[order({status:'pending',credits_awarded:0})],receipt});
  assert.equal((await f.run()).complete,false);assert.deepEqual(f.ledger,[]);assert.equal(f.consumeCalls,0);assert.equal(f.rows[0].status,'pending');
 }
});

test('refund metadata mismatch and partial multi-quantity refunds never revoke an unrelated order',async()=>{
 for(const item of [voided({orderId:'GPA.other'}),voided({voidedQuantity:2})]){
  const f=fixture({orders:[order({play_consumed_at:'already'})],pages:[{voidedPurchases:[item]}]});
  assert.equal((await f.run()).complete,false);assert.deepEqual(f.ledger,[]);assert.equal(f.rows[0].status,'paid');
 }
 const stripe=fixture({orders:[order({provider:'stripe'})],pages:[{voidedPurchases:[voided()]}]});
 assert.equal((await stripe.run()).complete,true);assert.deepEqual(stripe.ledger,[]);
});

test('provider and database failures never report reconciliation as complete or reveal private tokens',async()=>{
 const provider=fixture({pages:[new Response(null,{status:503})]});const providerResult=await provider.run();assert.equal(providerResult.complete,false);assert.equal(providerResult.errors[0].code,'play_api_503');assert.deepEqual(provider.ledger,[]);
 const database=fixture({databaseError:true});await assert.rejects(()=>database.run(),/play_database_unavailable/);
 const failure=fixture();failure.request=async()=>{throw Error('private-test-token-secret')};
 const result=await failure.run({request:async(url,options)=>url.includes('voidedpurchases')?Response.json({}):Promise.reject(Error('private-test-token-secret'))});
 assert.equal(result.complete,false);assert.doesNotMatch(JSON.stringify(result),/private-test-token/);
});

test('bounded batches return continuation cursors rather than claiming all purchases are reconciled',async()=>{
 const f=fixture({orders:[order(),order({id:'33333333-3333-4333-8333-333333333333'})],pages:[{tokenPagination:{nextPageToken:'1'}}]});
 const result=await f.run({maxPages:1,maxOrders:1});
 assert.equal(result.complete,false);assert.equal(result.next_voided_page_token,'1');assert.equal(result.next_pending_order_id,orderId);
});

function persistentFixture(f,{state={},beforeCAS=null}={}){
 const row={version:0,state};const original=f.db.from.bind(f.db);
 f.db.from=table=>{
  if(table!=='picgift_play_reconciliation_state')return original(table);
  let version,change;
  const query={select(){return query},eq(key,value){if(key==='version')version=value;return query},update(value){change=value;return query},
   single:async()=>({data:structuredClone(row),error:null}),
   async maybeSingle(){if(beforeCAS){const callback=beforeCAS;beforeCAS=null;callback(row)}
    if(version!==row.version)return {data:null,error:null};Object.assign(row,change);return {data:{version:row.version},error:null};}};
  return query;
 };
 return {row,async run(extra={}){
  const {reconcilePlayBatch}=await import('../supabase/functions/_shared/play-reconciliation.mjs');
  return reconcilePlayBatch({db:f.db,access:'local-access',packageName:'com.picgift.myapp',request:f.request,now:Date.parse('2026-10-13T12:00:00Z'),...extra});
 }};
}

test('persisted delivery cursor moves past 30 failing purchases and wraps for their later retry',async()=>{
 const orders=Array.from({length:31},(_,index)=>order({id:String(index+1).padStart(8,'0')+'-2222-4222-8222-222222222222',provider_checkout_id:'receipt-'+index}));
 const f=fixture({orders});const persistence=persistentFixture(f);
 const request=async(url,options)=>url.includes('/productsv2/')?Response.json(purchase({obfuscatedExternalAccountId:url.endsWith('/receipt-30')?accountHash:'other-account'})):f.request(url,options);
 const first=await persistence.run({request});assert.equal(first.complete,false);assert.equal(persistence.row.state.pending_after,orders[29].id);
 const second=await persistence.run({request});assert.equal(second.complete,true);assert.ok(f.rows[30].play_consumed_at);assert.equal(persistence.row.state.pending_after,'');
 const third=await persistence.run({request});assert.equal(third.errors.length,30);assert.equal(f.consumeCalls,1);
});

test('persisted refund cursor resumes later pages using its original window',async()=>{
 const f=fixture({orders:[order({play_consumed_at:'already'})],pages:[{tokenPagination:{nextPageToken:'1'}},{voidedPurchases:[voided()]}]});
 const persistence=persistentFixture(f);const first=await persistence.run({maxPages:1});
 assert.equal(first.complete,false);assert.equal(persistence.row.state.voided_page_token,'1');
 const windowEnd=persistence.row.state.window_end;
 const second=await persistence.run({maxPages:1,now:windowEnd+600000});assert.equal(second.complete,true);assert.deepEqual(f.ledger,[-5]);
 const resumed=f.requests.map(r=>new URL(r.url)).find(url=>url.searchParams.get('pageSelection.token')==='1');
 assert.equal(resumed.searchParams.get('endTime'),String(windowEnd));assert.equal(persistence.row.state.window_end,null);
});

test('deadline saves an intra-page refund cursor and finishes remaining refunds next run',async()=>{
 let elapsed=0;
 const f=fixture({orders:[order({play_consumed_at:'already'})],pages:[{voidedPurchases:[voided(),voided()]}],beforeUpdate:async()=>{elapsed=30000}});
 const persistence=persistentFixture(f);const first=await persistence.run({clock:()=>elapsed});
 assert.equal(first.complete,false);assert.equal(persistence.row.state.voided_item_index,1);assert.equal(first.checked_voided,1);
 elapsed=0;const second=await persistence.run({clock:()=>elapsed});assert.equal(second.complete,true);assert.equal(second.checked_voided,1);assert.deepEqual(f.ledger,[-5]);
});

test('deadline stops further provider calls and preserves the last delivery cursor',async()=>{
 let elapsed=0;const f=fixture({orders:[order(),order({id:'33333333-3333-4333-8333-333333333333'})]});
 const request=async(url,options)=>{const response=await f.request(url,options);if(url.includes('/productsv2/'))elapsed=45001;return response};
 const result=await f.run({clock:()=>elapsed,request});
 assert.equal(result.complete,false);assert.equal(result.next_pending_order_id,orderId);assert.equal(f.requests.length,2);assert.equal(f.consumeCalls,0);
});

test('concurrent progress uses compare-and-swap rather than overwriting a newer cursor',async()=>{
 const f=fixture({orders:[]});const persistence=persistentFixture(f,{beforeCAS:row=>{row.version=1;row.state={pending_after:'newer-cursor'}}});
 const result=await persistence.run();assert.equal(result.complete,false);assert.equal(result.errors.at(-1).code,'play_state_concurrent_retry');
 assert.equal(persistence.row.state.pending_after,'newer-cursor');assert.equal(persistence.row.version,1);
});

test('an old scan restarts within Google’s date limit and does not skip first-page records',async()=>{
 const now=Date.parse('2026-10-13T12:00:00Z');
 const f=fixture({orders:[order({play_consumed_at:'already'})],pages:[{voidedPurchases:[voided()]}]});
 const persistence=persistentFixture(f,{state:{window_end:now-21*3600000,voided_page_token:'',voided_item_index:1}});
 const result=await persistence.run({now});assert.equal(result.complete,true);assert.deepEqual(f.ledger,[-5]);
 const url=new URL(f.requests[0].url);assert.equal(url.searchParams.get('endTime'),String(now));
 assert.equal(url.searchParams.get('startTime'),String(now-29*86400000));
});

test('reconciliation is inaccessible to ordinary callers and accepts only the existing private cron token or an admin',async()=>{
 const secret='local-cron-test-'.repeat(4);let handler,calls=0;
 const tokenHash=createHash('sha256').update(secret).digest('hex');
 const db={auth:{getUser:async()=>({data:{user:{id:userId,email_confirmed_at:'2026-10-13'}}})},from(table){return {select(){return this},eq(){return this},maybeSingle:async()=>({data:table==='picgift_ai_cron_auth'?{token_hash:tokenHash}:null,error:null})}}};
 const env={SUPABASE_URL:'https://example.test',SUPABASE_SERVICE_ROLE_KEY:'local-test-service',GOOGLE_PLAY_SERVICE_ACCOUNT_JSON:'{}',GOOGLE_PLAY_PACKAGE_NAME:'com.picgift.myapp'};
 const context={Deno:{env:{get:key=>env[key]},serve:fn=>handler=fn},createClient:()=>db,crypto:webcrypto,TextEncoder,Uint8Array,Response,Date,Intl,
  googlePlayAccessToken:async()=> 'local-access',reconcilePlayBatch:async()=>{calls++;return {complete:true}}};
 const source=fs.readFileSync('supabase/functions/picgift-ai-director/index.ts','utf8').replace(/^import .*;\s*$/gm,'');
 vm.runInNewContext(stripTypeScriptTypes(source),context);
 const send=headers=>handler(new Request('https://example.test/director',{method:'POST',headers,body:JSON.stringify({action:'reconcile_purchases'})}));
 assert.equal((await send({})).status,403);assert.equal((await send({Authorization:'Bearer normal-user','x-picgift-cron':'wrong'})).status,403);assert.equal(calls,0);
 assert.equal((await send({'x-picgift-cron':secret})).status,200);assert.equal(calls,1);
});
