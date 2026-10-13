const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const raw=fs.readFileSync('supabase/functions/picgift-generate/index.ts','utf8');
const source=stripTypeScriptTypes(raw.replace(/^import .*;\r?$/gm,''));
function fixture({pilot=false,credits=1,balanceError=null}={}){
 let handler,preflights=0,spent=0,inserted;
 const user={id:'11111111-1111-4111-8111-111111111111',email:'test@example.test',email_confirmed_at:'2026-10-13'};
 const env={SUPABASE_URL:'https://example.test',SUPABASE_SERVICE_ROLE_KEY:'test',OPENAI_API_KEY:'test',PICGIFT_GENERATION_ENABLED:'true',PICGIFT_PUBLIC_GENERATION_ENABLED:'true',PICGIFT_PILOT_EMAILS:pilot?user.email:''};
 const db={auth:{getUser:async()=>({data:{user}})},from(table){
  let operation='select',columns='';
  const result=()=>{
   if(table==='picgift_credit_ledger')return {data:balanceError?null:[{delta:credits}],error:balanceError};
   if(table==='picgift_ai_pilot_users')return {data:null};
   if(table==='picgift_campaign_state')return {data:{active_campaign:'halloween'}};
   if(table==='picgift_scene_recipes')return {data:{enabled:true,scene_id:'halloween-potions'}};
   if(table==='picgift_photo_jobs')return {data:operation==='insert'?{id:'job-1'}:columns==='*'?null:[]};
   return {data:null};
  };
  const q={select(value){columns=value;return q},insert(value){operation='insert';inserted=value;return q},delete(){return q},update(){return q},eq(){return q},in(){return q},lt(){return q},limit(){return q},single:async()=>result(),maybeSingle:async()=>result(),then(resolve,reject){return Promise.resolve(result()).then(resolve,reject)}};return q;
 },storage:{from:()=>({
  list:async()=>({data:[{name:'source.jpg'}]}),
  download:async()=>({data:new Blob([new Uint8Array(3000)],{type:'image/jpeg'})})
 })},rpc:async(name)=>{
  if(name==='picgift_spend_credit'){spent++;return {data:true}}
  return {data:{accepted:true}};
 }};
 vm.runInNewContext(source,{createClient:()=>db,Response,Date,console,Blob,Uint8Array,buildPortraitPrompt:()=>'',assessPhoto:async()=>{preflights++;return {approved:true}},EdgeRuntime:{waitUntil:()=>{}},Deno:{env:{get:key=>env[key]},serve:fn=>handler=fn}});
 return {request:async(billing_mode)=>{
  const body={action:'start',consent:true,scene_id:'halloween-potions',source_path:user.id+'/22222222-2222-4222-8222-222222222222/source.jpg',format:'vertical',pose:'De pie tras el caldero',outfit:'Pequeño mago'};
  if(billing_mode!==undefined)body.billing_mode=billing_mode;
  const response=await handler(new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify(body)}));
  return {status:response.status,body:await response.json(),preflights,spent,inserted};
 }};
}
test('zero credits rejects before paid preflight and atomic debit',async()=>{
 const r=await fixture({credits:0}).request('credits');assert.equal(r.status,402);assert.equal(r.preflights,0);assert.equal(r.spent,0);
});
test('ledger failure is retryable and never invokes preflight',async()=>{
 const r=await fixture({balanceError:{message:'private'}}).request('credits');assert.equal(r.status,503);assert.equal(r.preflights,0);assert.doesNotMatch(JSON.stringify(r.body),/private/);
});
test('legacy pilot requests remain free even with purchased credits',async()=>{
 const r=await fixture({pilot:true,credits:3}).request();assert.equal(r.status,202);assert.equal(r.preflights,1);assert.equal(r.spent,0);assert.equal(r.inserted.is_test,true);
});
test('legacy non-pilot requests still spend exactly one credit',async()=>{
 const r=await fixture({credits:3}).request();assert.equal(r.status,202);assert.equal(r.spent,1);assert.equal(r.inserted.is_test,false);
});
test('pilot explicitly choosing credits uses the real debit and refund path',async()=>{
 const r=await fixture({pilot:true,credits:3}).request('credits');assert.equal(r.status,202);assert.equal(r.spent,1);assert.equal(r.inserted.is_test,false);
});
test('pilot explicitly choosing credits cannot silently fall back to free',async()=>{
 const r=await fixture({pilot:true,credits:0}).request('credits');assert.equal(r.status,402);assert.equal(r.preflights,0);
});
test('non-pilot cannot select free pilot generation',async()=>{
 const r=await fixture({credits:3}).request('pilot');assert.equal(r.status,403);assert.equal(r.preflights,0);assert.equal(r.spent,0);
});
test('service choice captures the advertised billing mode until confirmation',async()=>{
 const frontend=fs.readFileSync('generator.js','utf8');
 const choice=frontend.slice(frontend.indexOf('async function chooseService(){'),frontend.indexOf('async function preparedFile('));
 for(const [pilot,credits,expected] of [[true,2,'credits'],[true,0,'pilot'],[false,2,'credits']]){
  let close;
  const nodes={};
  const element=id=>nodes[id]||(nodes[id]={addEventListener:(_event,fn)=>{close=fn},removeEventListener:()=>{},showModal:()=>{}});
  const window={picgiftPilot:pilot,picgiftCreditsAvailable:credits};
  const ctx={window,$:element,authRevision:0,health:async()=>{},freeReady:true,premiumReady:true};vm.createContext(ctx);vm.runInContext(choice,ctx);
  const pending=ctx.chooseService();await new Promise(setImmediate);
  assert.match(nodes['premium-photo-availability'].textContent,expected==='credits'?/1 crédito/:/gratuita/);
  window.picgiftCreditsAvailable=credits?0:2;
  nodes['photo-service-choice'].returnValue='premium';close();
  const result=await pending;assert.equal(result.billing_mode,expected);assert.equal(result.service,'premium');
 }
});
