const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const source=stripTypeScriptTypes(fs.readFileSync('supabase/functions/picgift-checkout/index.ts','utf8').replace(/^import .*;\r?$/gm,''));

function fixture({productsError=null,ledgerError=null,signedIn=true}={}){
 let handler;
 const queries=[];
 const user={id:'11111111-1111-4111-8111-111111111111'};
 const products=[{id:'esencial',name:'Essential',price_cents:790,photo_credits:1,currency:'eur',enabled:true}];
 const ledger=[{delta:10},{delta:-1},{delta:-1}];
 const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'private-test-key',
  PICGIFT_SALES_ENABLED:'false',PICGIFT_GOOGLE_PLAY_ENABLED:'true',PICGIFT_GOOGLE_PLAY_PROMO_READY:'true',
  GOOGLE_PLAY_SERVICE_ACCOUNT_JSON:'configured-test-account',GOOGLE_PLAY_PACKAGE_NAME:'com.picgift.myapp'};
 const db={auth:{getUser:async()=>({data:{user:signedIn?user:null},error:null})},from(table){
  return {select(columns){return {eq:async(column,value)=>{
   queries.push({table,column,value});
   return table==='picgift_products'?{data:productsError?null:products,error:productsError}:{data:ledgerError?null:ledger,error:ledgerError};
  }}}};
 }};
 vm.runInNewContext(source,{createClient:()=>db,Response,Date,URLSearchParams,console,
  Deno:{env:{get:key=>env[key]},serve:fn=>{handler=fn}},fetch:()=>{throw Error('Status must not contact Stripe')}});
 return {queries,request:async(action='status')=>{
  const response=await handler(new Request('https://example.test/functions/v1/picgift-checkout',{
   method:'POST',headers:{Authorization:'Bearer test-session','Content-Type':'application/json'},body:JSON.stringify({action,product_id:'esencial'})
  }));
  return {status:response.status,body:await response.json()};
 }};
}

test('status returns a retryable error instead of zero credits when the ledger fails',async()=>{
 const h=fixture({ledgerError:{message:'internal database detail'}}),result=await h.request();
 assert.equal(result.status,503);assert.match(result.body.error,/saldo/);
 assert.equal('credits' in result.body,false);assert.doesNotMatch(JSON.stringify(result),/internal database detail/);
 assert.deepEqual(h.queries.at(-1),{table:'picgift_credit_ledger',column:'user_id',value:'11111111-1111-4111-8111-111111111111'});
});

test('status returns a retryable error instead of an empty catalog when products fail',async()=>{
 const result=await fixture({productsError:{message:'private diagnostic'}}).request();
 assert.equal(result.status,503);assert.match(result.body.error,/catálogo/);
 assert.equal('products' in result.body,false);assert.doesNotMatch(JSON.stringify(result),/private diagnostic/);
});

test('status still provides credits and Play availability while Stripe remains disabled',async()=>{
 const h=fixture(),result=await h.request();
 assert.equal(result.status,200);assert.equal(result.body.credits,8);
 assert.equal(result.body.checkout_available,false);assert.equal(result.body.google_play_available,true);
 assert.equal(result.body.products[0].id,'esencial');
 const checkout=await h.request('checkout');assert.equal(checkout.status,503);
 assert.equal(h.queries.length,2,'a disabled checkout must not create an order');
});

test('unauthenticated status requests cannot query credit or product tables',async()=>{
 const h=fixture({signedIn:false}),result=await h.request();
 assert.equal(result.status,401);assert.equal(h.queries.length,0);
});
