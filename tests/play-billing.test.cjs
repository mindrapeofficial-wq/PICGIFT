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
  from:()=>({select:()=>({eq:async()=>({count:0,error:null})})})
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
async function readyWebStore(){
 const env=await readyStore(),redirects=[];
 delete env.context.window.PicgiftNative;
 env.context.window.location={assign:url=>redirects.push(url)};
 env.client.functions.invoke=async()=>({data:{checkout_available:true,credits:0},error:null});
 env.listeners['document:visibilitychange']();await settle();
 return {...env,redirects};
}
const clickPack=(env,id)=>env.listeners['document:click']({target:{closest:()=>env.buttons.find(b=>b.dataset.buy===id)}});
test('verified receipt does not claim updated credits when the balance refresh fails',async()=>{
 const env=await readyStore();
 env.client.functions.invoke=async name=>name==='picgift-google-play'
  ?{data:{success:true},error:null}:{data:null,error:{message:'offline'}};
 env.listeners['picgift:play-purchase']({detail:{product_id:'esencial',purchase_token:'verified-offline'}});
 await settle();await settle();
 assert.doesNotMatch(env.el('payment-status').textContent,/Créditos actualizados/);
 assert.match(env.el('payment-status').textContent,/Compra verificada.*saldo/);
 assert.equal(env.context.window.picgiftCreditsAvailable,null);
 assert.equal(env.el('account-credits').textContent,'—');
 assert.ok(env.buttons.every(b=>b.disabled));
 env.client.functions.invoke=async()=>({data:{google_play_available:true,credits:1},error:null});
 env.listeners['document:visibilitychange']();await settle();await settle();
 assert.equal(env.context.window.picgiftCreditsAvailable,1,'returning to the app recovers the confirmed balance');
});
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve};}
test('an orders service error is not displayed as zero confirmed payments',async()=>{
 const env=await readyStore();
 env.client.from=()=>({select:()=>({eq:async()=>({count:null,error:{message:'unavailable'}})})});
 env.listeners['document:visibilitychange']();await settle();await settle();
 assert.equal(env.el('account-orders').textContent,'—');
 assert.equal(env.context.window.picgiftCreditsAvailable,null);
 assert.ok(env.buttons.every(b=>b.disabled));
 assert.match(env.el('payment-status').textContent,/No se pudo comprobar/);
});
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

test('a delayed order count does not put the previous account totals in the new account',async()=>{
 const env=await readyStore(),pending=deferred();
 env.client.from=()=>({select:()=>({eq:()=>pending.promise})});
 env.listeners['document:visibilitychange']();await settle();
 const user={id:'22222222-2222-4222-8222-222222222222'};
 env.client.auth.getSession=async()=>({data:{session:{user}}});
 env.client.from=()=>({select:()=>({eq:async()=>({count:0,error:null})})});
 env.listeners['picgift:auth']({detail:{user}});await settle();
 pending.resolve({count:2,error:null});await settle();
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

test('Stripe checkout locks every pack before identity validation and remains locked until navigation',async()=>{
 const env=await readyWebStore(),identity=deferred(),checkout=deferred();let identities=0,checkouts=0;
 env.client.auth.getUser=()=>{identities++;return identity.promise};
 env.client.functions.invoke=()=>{checkouts++;return checkout.promise};
 clickPack(env,'esencial');clickPack(env,'magico');
 assert.equal(identities,1);
 assert.ok(env.buttons.every(b=>b.disabled));
 identity.resolve({data:{user:{id:'11111111-1111-4111-8111-111111111111'}}});await settle();
 clickPack(env,'familiar');
 assert.equal(checkouts,1);
 checkout.resolve({data:{url:'https://checkout.stripe.com/c/pay/test'},error:null});await settle();
 assert.deepEqual(env.redirects,['https://checkout.stripe.com/c/pay/test']);
 assert.ok(env.buttons.every(b=>b.disabled),'redirect must not leave a second checkout window');
});

test('failed web checkout unlocks all packs for a retry',async()=>{
 const env=await readyWebStore();
 env.client.functions.invoke=async()=>({data:null,error:{message:'unavailable'}});
 clickPack(env,'esencial');await settle();
 assert.ok(env.buttons.every(b=>!b.disabled));
 assert.match(env.el('payment-status').textContent,/No fue posible comenzar/);
 assert.equal(env.redirects.length,0);
});

test('web checkout rejects deceptive or nonstandard provider URLs',async()=>{
 for(const url of ['https://checkout.stripe.com.evil.test/c/pay/one','http://checkout.stripe.com/c/pay/one','https://checkout.stripe.com:444/c/pay/one','https://user:secret@checkout.stripe.com/c/pay/one']){
  const env=await readyWebStore();env.client.functions.invoke=async()=>({data:{url},error:null});
  clickPack(env,'esencial');await settle();
  assert.equal(env.redirects.length,0,url);assert.ok(env.buttons.every(b=>!b.disabled));
 }
});

test('returning from Stripe through back-forward cache refreshes balance and releases checkout',async()=>{
 const env=await readyWebStore();
 env.client.functions.invoke=async()=>({data:{url:'https://checkout.stripe.com/c/pay/test'},error:null});
 clickPack(env,'esencial');await settle();assert.ok(env.buttons.every(b=>b.disabled));
 env.client.functions.invoke=async()=>({data:{checkout_available:true,credits:5},error:null});
 env.listeners.pageshow({persisted:true});await settle();
 assert.equal(env.context.window.picgiftCreditsAvailable,5);
 assert.ok(env.buttons.every(b=>!b.disabled));
 assert.doesNotMatch(env.el('payment-status').textContent,/Compra verificada/,'a return URL is not proof of payment');
});

test('an auth error returned without throwing still blocks checkout',async()=>{
 const env=await readyStore();
 env.client.auth.getUser=async()=>({data:{user:{id:'11111111-1111-4111-8111-111111111111'}},error:{message:'expired'}});
 clickPack(env,'esencial');await settle();
 assert.equal(env.sent.filter(x=>x.action==='purchase').length,0);
 assert.match(env.el('payment-status').textContent,/comprobar tu sesión/);
 assert.ok(env.buttons.every(b=>!b.disabled));
});

test('pending purchase notice survives catalog and balance refreshes',async()=>{
 const env=await readyStore();
 env.listeners['picgift:play-pending']();
 env.listeners['document:visibilitychange']();await settle();
 env.listeners['picgift:play-prices']({detail:{esencial:'7,90 €'}});
 assert.match(env.el('payment-status').textContent,/Pendiente de confirmación/);
 assert.equal(env.context.window.picgiftCreditsAvailable,0);
});

test('recovering a paid native receipt works while new purchases are unavailable',async()=>{
 const env=await readyStore();let verified=0;
 env.client.functions.invoke=async name=>name==='picgift-google-play'
  ?(verified++,{data:{success:true},error:null}):{data:{google_play_available:false,credits:1},error:null};
 env.listeners['picgift:payment-refresh']();await settle();
 assert.ok(env.sent.filter(x=>x.action==='account').length>=2,'restore rechecks purchases owned by the current account');
 env.listeners['picgift:play-purchase']({detail:{product_id:'esencial',purchase_token:'restore-when-closed'}});await settle();await settle();
 assert.equal(verified,1);assert.equal(env.context.window.picgiftCreditsAvailable,1);
 assert.match(env.el('payment-status').textContent,/Compra verificada/);
 assert.ok(env.buttons.every(b=>b.disabled),'restoration must not open new sales');
});

test('native receipts and catalog callbacks for another account are ignored',async()=>{
 const env=await readyStore();let verified=0;
 env.client.functions.invoke=async()=>{verified++;return {data:{success:true},error:null}};
 const user_id='22222222-2222-4222-8222-222222222222',oldStatus=env.el('payment-status').textContent;
 env.listeners['picgift:play-purchase']({detail:{user_id,product_id:'esencial',purchase_token:'other-account-token'}});
 env.listeners['picgift:play-prices']({detail:{user_id,prices:{esencial:'1,00 €'}}});
 env.listeners['picgift:play-cancelled']({detail:{user_id}});
 assert.equal(verified,0);assert.equal(env.el('payment-status').textContent,oldStatus);
 assert.equal(env.amounts.get('esencial').children[0].textContent,'7,90 €');
});

test('native prices never fall back to web EUR amounts and removed products lose their stale price',async()=>{
 const env=mockStore();
 vm.runInNewContext(fs.readFileSync('payments.js','utf8').replace(/^import .*;\s*$/gm,''),env.context);
 env.listeners['document:DOMContentLoaded']();await settle();
 for(const amount of env.amounts.values())assert.equal(amount.children[0].textContent,'Consultar en Google Play');
 const user_id='11111111-1111-4111-8111-111111111111';
 env.listeners['picgift:play-prices']({detail:{user_id,prices:{esencial:'$8.99',magico:'$24.99'}}});
 assert.equal(env.amounts.get('esencial').children[0].textContent,'$8.99');
 env.listeners['picgift:play-prices']({detail:{user_id,prices:{esencial:'$8.99'}}});
 assert.equal(env.amounts.get('magico').children[0].textContent,'Consultar en Google Play');
 assert.equal(env.buttons.find(b=>b.dataset.buy==='magico').disabled,true);
});

test('payment outcomes follow language changes without changing store-formatted prices',async()=>{
 const env=await readyStore();env.listeners['picgift:play-pending']();
 env.context.window.picgiftI18n.language='en';env.listeners['picgift:language']();
 assert.match(env.el('payment-status').textContent,/Waiting for Google Play/);
 assert.ok(env.buttons.every(b=>b.textContent==='Choose pack'));
 assert.equal(env.amounts.get('esencial').children[0].textContent,'7,90 €');
 env.context.window.picgiftI18n.language='es';env.listeners['picgift:language']();
 assert.match(env.el('payment-status').textContent,/Pendiente de confirmación/);
});

test('catalog and restoration errors cannot release an active Play checkout',async()=>{
 const env=await readyStore();clickPack(env,'esencial');await settle();
 for(const source of ['catalog','restore']){
  env.listeners['picgift:play-error']({detail:{source,user_id:'11111111-1111-4111-8111-111111111111'}});
  assert.ok(env.buttons.every(b=>b.disabled));assert.match(env.el('payment-status').textContent,/Solicitando/);
 }
 env.listeners['picgift:play-prices']({detail:{esencial:'7,90 €',magico:'19,92 €',familiar:'31,92 €'}});
 assert.ok(env.buttons.every(b=>b.disabled));
 env.listeners['picgift:play-cancelled']();assert.ok(env.buttons.every(b=>!b.disabled));
});

test('credited but unconsumed purchases are recoverable without asking the user to pay again',async()=>{
 const env=await readyStore();let attempts=0;
 env.client.functions.invoke=async name=>name==='picgift-google-play'
  ?(attempts++,{data:{success:true,consumption_pending:attempts===1},error:null}):{data:{google_play_available:true,credits:1},error:null};
 const detail={product_id:'esencial',purchase_token:'awaiting-consumption'};
 env.listeners['picgift:play-purchase']({detail});await settle();await settle();
 assert.equal(env.context.window.picgiftCreditsAvailable,1);
 assert.match(env.el('payment-status').textContent,/puedes usar tus créditos/);
 env.listeners['picgift:payment-refresh']();await settle();
 env.listeners['picgift:play-purchase']({detail});await settle();await settle();
 assert.equal(attempts,2,'Play can redeliver an unconsumed token for idempotent recovery');
 assert.equal(env.context.window.picgiftCreditsAvailable,1);
 assert.match(env.el('payment-status').textContent,/Compra verificada. Créditos actualizados/);
});

test('a session change discovered during refresh invalidates the old receipt callback',async()=>{
 const env=await readyStore(),oldReceipt=deferred();
 env.client.functions.invoke=async name=>name==='picgift-google-play'?oldReceipt.promise:{data:{google_play_available:true,credits:2},error:null};
 env.listeners['picgift:play-purchase']({detail:{product_id:'esencial',purchase_token:'old-account-receipt'}});
 const user={id:'22222222-2222-4222-8222-222222222222'};
 env.client.auth.getSession=async()=>({data:{session:{user}}});
 env.listeners['document:visibilitychange']();await settle();await settle();
 oldReceipt.resolve({data:{success:true},error:null});await settle();
 assert.equal(env.context.window.picgiftCreditsAvailable,2);
 assert.doesNotMatch(env.el('payment-status').textContent,/Compra verificada/);
 assert.equal(env.sent.filter(x=>x.action==='account').at(-1).user_id,user.id);
});

test('balance labels also follow a language change after loading',async()=>{
 const env=await readyStore();env.client.functions.invoke=async()=>({data:{google_play_available:true,credits:1},error:null});
 env.context.window.picgiftI18n.language='en';env.listeners['document:visibilitychange']();await settle();
 assert.equal(env.el('account-credits').textContent,'1 photo');
 env.context.window.picgiftI18n.language='es';env.listeners['picgift:language']();
 assert.equal(env.el('account-credits').textContent,'1 fotografía');
 assert.equal(env.el('account-orders').textContent,'0 pagos confirmados');
});

test('the account payment total counts all paid orders instead of the last ten rows',async()=>{
 const env=await readyStore();let countOptions,filter;
 env.client.from=table=>{assert.equal(table,'picgift_orders');return {select:(columns,options)=>{countOptions=options;return {eq:async(column,value)=>{filter=[column,value];return {count:37,error:null}}}}}};
 env.listeners['document:visibilitychange']();await settle();
 assert.equal(countOptions.head,true);assert.equal(countOptions.count,'exact');assert.deepEqual(filter,['status','paid']);
 assert.equal(env.el('account-orders').textContent,'37 pagos confirmados');
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
