const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function mockStore() {
 const listeners={},ids=['esencial','magico','familiar'],sent=[];
 const amounts=new Map(ids.map(id=>[id,{children:[],replaceChildren(...v){this.children=v},append(...v){this.children.push(...v)}}]));
 const buttons=ids.map(id=>({
  dataset:{buy:id},disabled:false,textContent:'',closest:()=>({querySelector:()=>amounts.get(id)})
 }));
 const els=new Map();
 const el=id=>{if(!els.has(id))els.set(id,{textContent:'',hidden:false,classList:{toggle(){},add(){},remove(){}}});return els.get(id)};
 const document={
  readyState:'loading',
  documentElement:{dataset:{campaign:'none'}},
  getElementById:el,
  querySelectorAll(sel){return sel==='[data-buy]'?buttons:[]},
  querySelector(sel){const m=sel.match(/\[data-buy="(.*?)"\]/);return m?buttons.find(b=>b.dataset.buy===m[1]):null},
  createElement:()=>({dataset:{},textContent:''}),
  addEventListener:(name,fn)=>{listeners['document:'+name]=fn}
 };
 const native={postMessage:v=>sent.push(JSON.parse(v))};
 const window={
  PicgiftNative:native,
  picgiftStudioUpdate:()=>{},
  picgiftI18n:{language:'es',t:s=>s},
  addEventListener:(name,fn)=>{listeners[name]=fn}
 };
 const user={id:'11111111-1111-4111-8111-111111111111',email:'tester@example.test'};
 const client={
  auth:{
   getUser:async()=>({data:{user}}),
   getSession:async()=>({data:{session:{user}}})
  },
  functions:{invoke:async(name,opts)=>({data:{checkout_available:false,google_play_available:true,credits:0},error:null})},
  from:()=>({select:()=>({order:()=>({limit:async()=>({data:[],error:null})})})})
 };
 const context={document,window,createClient:()=>client,SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',setInterval:()=>{},Intl,Date,URL};
 return {context,listeners,buttons,amounts,sent,el,client};
}

const settle=()=>new Promise(resolve=>setImmediate(resolve));
async function readyStore(){
 const env=mockStore();
 vm.runInNewContext(fs.readFileSync('payments.js','utf8').replace(/^import .*;\s*$/gm,''),env.context,{filename:'payments.js'});
 env.listeners['document:DOMContentLoaded']();await settle();await settle();
 env.listeners['picgift:play-prices']({detail:{esencial:'7,90 €',magico:'19,92 €',familiar:'31,92 €'}});
 return env;
}
const clickPack=(env,id)=>env.listeners['document:click']({target:{closest:()=>env.buttons.find(b=>b.dataset.buy===id)}});
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve};}
function logout(env){
 env.client.auth.getSession=async()=>({data:{session:null}});
 env.client.auth.getUser=async()=>({data:{user:null}});
 env.listeners['picgift:auth']({detail:{user:null}});
}

test('payment availability and credits cannot return after logout during a status request',async()=>{
 const env=await readyStore(),pending=deferred();
 env.client.functions.invoke=()=>pending.promise;
 env.listeners['document:visibilitychange']();await settle();
 logout(env);await settle();
 pending.resolve({data:{google_play_available:true,credits:77},error:null});await settle();
 assert.equal(env.context.window.picgiftCreditsAvailable,null);
 assert.equal(env.el('account-credits').textContent,'—');
 assert.equal(env.el('account-orders').textContent,'—');
 assert.ok(env.buttons.every(b=>b.disabled));
 assert.match(env.el('payment-status').textContent,/Inicia sesión/);
});

test('a delayed order list does not put the previous account totals in the new account',async()=>{
 const env=await readyStore(),pending=deferred();
 env.client.from=()=>({select:()=>({order:()=>({limit:()=>pending.promise})})});
 env.listeners['document:visibilitychange']();await settle();
 const user={id:'22222222-2222-4222-8222-222222222222'};
 env.client.auth.getSession=async()=>({data:{session:{user}}});
 env.client.from=()=>({select:()=>({order:()=>({limit:async()=>({data:[]})})})});
 env.listeners['picgift:auth']({detail:{user}});await settle();
 pending.resolve({data:[{status:'paid'},{status:'paid'}]});await settle();
 assert.equal(env.el('account-orders').textContent,'0 pagos confirmados');
 assert.equal(env.sent.filter(x=>x.action==='account').at(-1).user_id,user.id);
});

test('logout while checking a purchase identity prevents opening a Play dialog',async()=>{
 const env=await readyStore(),pending=deferred();
 env.client.auth.getUser=()=>pending.promise;
 clickPack(env,'esencial');logout(env);await settle();
 pending.resolve({data:{user:{id:'11111111-1111-4111-8111-111111111111'}}});await settle();
 assert.equal(env.sent.filter(x=>x.action==='purchase').length,0);
 assert.ok(env.buttons.every(b=>b.disabled));
});

test('an old receipt response cannot overwrite logout or release another account controls',async()=>{
 const env=await readyStore(),pending=deferred();
 env.client.functions.invoke=()=>pending.promise;
 env.listeners['picgift:play-purchase']({detail:{product_id:'esencial',purchase_token:'old-token'}});
 logout(env);await settle();
 pending.resolve({data:{success:true},error:null});await settle();await settle();
 assert.match(env.el('payment-status').textContent,/Inicia sesión/);
 assert.ok(env.buttons.every(b=>b.disabled));
 assert.equal(env.context.window.picgiftCreditsAvailable,null);
});

test('the latest payment refresh wins when status replies arrive in reverse order',async()=>{
 const env=await readyStore(),first=deferred(),second=deferred();let calls=0;
 env.client.functions.invoke=()=>++calls===1?first.promise:second.promise;
 env.listeners['document:visibilitychange']();await settle();
 env.listeners['document:visibilitychange']();await settle();
 second.resolve({data:{google_play_available:true,credits:3},error:null});await settle();
 first.resolve({data:{google_play_available:true,credits:50},error:null});await settle();
 assert.equal(env.context.window.picgiftCreditsAvailable,3);
 assert.equal(env.el('account-credits').textContent,'3 fotografías');
});

test('a Stripe checkout response cannot redirect the browser after logout',async()=>{
 const env=await readyStore(),pending=deferred(),redirects=[];
 delete env.context.window.PicgiftNative;
 env.context.window.location={assign:url=>redirects.push(url)};
 env.client.functions.invoke=async(name,opts)=>opts.body.action==='checkout'
  ?pending.promise:{data:{checkout_available:true,credits:0},error:null};
 env.listeners['document:visibilitychange']();await settle();
 clickPack(env,'esencial');await settle();
 logout(env);await settle();
 pending.resolve({data:{url:'https://checkout.stripe.com/c/pay/test'},error:null});await settle();
 assert.equal(redirects.length,0);
 assert.ok(env.buttons.every(b=>b.disabled));
});

test('a delayed initial identity check does not disable the current account',async()=>{
 const env=mockStore(),pending=deferred();env.client.auth.getUser=()=>pending.promise;
 vm.runInNewContext(fs.readFileSync('payments.js','utf8').replace(/^import .*;\s*$/gm,''),env.context);
 env.listeners['document:DOMContentLoaded']();
 env.listeners['picgift:auth']({detail:{user:{id:'11111111-1111-4111-8111-111111111111'}}});await settle();
 env.listeners['picgift:play-prices']({detail:{esencial:'7,90 €',magico:'19,92 €',familiar:'31,92 €'}});
 pending.resolve({data:{user:null}});await settle();
 assert.ok(env.buttons.every(b=>!b.disabled));
});

test('failed identity lookup gives a retry message without opening a payment',async()=>{
 const env=await readyStore();env.client.auth.getUser=async()=>{throw Error('offline')};
 clickPack(env,'esencial');await settle();
 assert.equal(env.sent.filter(x=>x.action==='purchase').length,0);
 assert.match(env.el('payment-status').textContent,/Vuelve a intentarlo/);
 assert.ok(env.buttons.every(b=>!b.disabled));
});

test('cancelled and pending Play dialogs release the checkout without granting credits',async()=>{
 const env=await readyStore();
 let verifications=0;
 const invoke=env.client.functions.invoke;
 env.client.functions.invoke=async(name,opts)=>{if(name==='picgift-google-play')verifications++;return invoke(name,opts)};
 clickPack(env,'esencial');clickPack(env,'magico');await settle();
 assert.equal(env.sent.filter(x=>x.action==='purchase').length,1,'only one dialog can start');
 assert.ok(env.buttons.every(b=>b.disabled));
 env.listeners['picgift:play-prices']({detail:{esencial:'7,90 €',magico:'19,92 €',familiar:'31,92 €'}});
 assert.ok(env.buttons.every(b=>b.disabled),'a catalog callback cannot release an active checkout');
 assert.match(env.el('payment-status').textContent,/Solicitando/);
 env.listeners['picgift:play-cancelled']();
 assert.ok(env.buttons.every(b=>!b.disabled));
 assert.match(env.el('payment-status').textContent,/cancelada/);
 clickPack(env,'esencial');await settle();env.listeners['picgift:play-pending']();
 assert.ok(env.buttons.every(b=>!b.disabled));
 assert.match(env.el('payment-status').textContent,/Pendiente/);
 assert.equal(verifications,0,'cancelled and pending payments are never credited');
 assert.equal(env.context.window.picgiftCreditsAvailable,0);
});

test('failed receipt validation unlocks retry and duplicate callbacks do not revalidate concurrently',async()=>{
 const env=await readyStore();
 let finish,verifications=0;
 const invoke=env.client.functions.invoke;
 env.client.functions.invoke=(name,opts)=>name==='picgift-google-play'
  ?(verifications++,new Promise(resolve=>{finish=resolve})):invoke(name,opts);
 const detail={product_id:'esencial',purchase_token:'test-token'};
 env.listeners['picgift:play-purchase']({detail});env.listeners['picgift:play-purchase']({detail});
 assert.equal(verifications,1);assert.ok(env.buttons.every(b=>b.disabled));
 finish({data:null,error:{message:'provider unavailable'}});await settle();
 assert.ok(env.buttons.every(b=>!b.disabled));
 assert.match(env.el('payment-status').textContent,/Conserva el recibo/);
 assert.equal(env.context.window.picgiftCreditsAvailable,0);
 env.listeners['picgift:play-purchase']({detail});assert.equal(verifications,2,'the restored token can be retried');
 finish({data:{success:true},error:null});await settle();await settle();
 assert.match(env.el('payment-status').textContent,/Compra verificada/,'refresh must not erase the verified message');
});
test('native purchases stay disabled until Play returns each product price',async()=>{
 const env=mockStore();
 const source=fs.readFileSync('payments.js','utf8').replace(/^import .*;\s*$/gm,'');
 vm.runInNewContext(source,env.context,{filename:'payments.js'});
 env.listeners['document:DOMContentLoaded']();
 await new Promise(resolve=>setImmediate(resolve));
 await new Promise(resolve=>setImmediate(resolve));
 assert.ok(env.sent.some(x=>x.action==='products'),'native layer must query Google Play product catalog');
 assert.ok(env.buttons.every(b=>b.disabled),'status=true alone must not enable Play purchases');
 env.listeners['picgift:play-prices']({detail:{esencial:'7,90 €'}});
 assert.equal(env.buttons.find(x=>x.dataset.buy==='esencial').disabled,false);
 assert.ok(env.buttons.filter(x=>x.dataset.buy!=='esencial').every(x=>x.disabled));
 env.listeners['picgift:play-prices']({detail:{esencial:'7,90 €',magico:'19,92 €',familiar:'31,92 €'}});
 assert.ok(env.buttons.every(b=>!b.disabled));
 assert.match(env.el('payment-status').textContent,/tres paquetes/);
});

test('Billing client and database use the same SKUs and purchases are account-scoped',()=>{
 const native=fs.readFileSync('android/app/src/main/java/com/picgift/myapp/MainActivity.kt','utf8');
 const prices=fs.readFileSync('PAYMENTS.md','utf8');
 const build=fs.readFileSync('android/app/build.gradle.kts','utf8');
 for(const id of ['picgift_esencial_1','picgift_magico_5','picgift_familiar_10']){
  assert.ok(native.includes(id),id);
  assert.ok(prices.includes(id),id);
 }
 assert.match(native,/user != currentAccount/);
 assert.match(native,/setObfuscatedAccountId\(sha\)/);
 assert.match(native,/purchase\.accountIdentifiers\?\.obfuscatedAccountId != accountHash\(user\)/);
 assert.match(build,/com\.android\.billingclient:billing:9\.1\.0/);
});
