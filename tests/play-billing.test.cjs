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
 return {context,listeners,buttons,amounts,sent,el};
}
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
