const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const source=fs.readFileSync('supabase/functions/picgift-ai-director/index.ts','utf8');
const sendSource=stripTypeScriptTypes(source.slice(source.indexOf('async function sendOutbox('),source.indexOf('async function checkProviders(')));

function fixture(responses){
 const devices=responses.map((_,i)=>({installation_id:'device-'+i,token:'private-test-token-'+i}));
 const changes=[]; const retired=[]; let sends=0;
 const db={from(table){
  const query={select(){return this},eq(){return this},gt(){return this},order(){return this},limit(){return this},
   update(value){this.change=value;return this},
   maybeSingle:async()=>({data:{id:'campaign'}}),
   then(resolve){
    if(table==='picgift_notification_devices'){
     if(this.change)retired.push(this.change);
     return Promise.resolve({data:devices,error:null}).then(resolve);
    }
    if(this.change){changes.push(this.change);return Promise.resolve({error:null}).then(resolve)}
    return Promise.resolve({data:[{id:'campaign',target:'all',title:'Test',body:'Test',route:'crear',tries:0}],error:null}).then(resolve);
   }
  };return query;
 }};
 const context={db,Date,Error,AbortSignal,fcmAuth:async()=>({projectId:'picgift-a7fda',token:'test-access'}),
  fetch:async()=>{const response=responses[sends++];if(response instanceof Error)throw response;return response}};
 vm.createContext(context);vm.runInContext(sendSource,context);
 return {run:()=>context.sendOutbox(),changes,retired,get sends(){return sends}};
}
const response=(status,details=[])=>new Response(JSON.stringify({error:{details}}),{status});

test('all rejected sends are failed with accurate counts and a safe error',async()=>{
 const f=fixture([response(503),response(403)]);await f.run();
 assert.equal(f.changes[0].state,'failed');assert.equal(f.changes[0].recipient_count,2);
 assert.equal(f.changes[0].delivered_count,0);assert.equal(f.changes[0].sent_at,null);
 assert.equal(f.changes[0].last_error,'fcm_rejected_403');
});
test('network failure is recorded and does not stop the remaining devices',async()=>{
 const f=fixture([new Error('sensitive provider details'),response(200)]);await f.run();
 assert.equal(f.sends,2);assert.equal(f.changes[0].state,'sent');assert.equal(f.changes[0].delivered_count,1);
 assert.equal(f.changes[0].last_error,'fcm_network_error');
});
test('empty audiences do not claim that a message was delivered',async()=>{
 const f=fixture([]);await f.run();assert.equal(f.sends,0);assert.equal(f.changes[0].sent_at,null);
 assert.equal(f.changes[0].last_error,'no_eligible_devices');
});
test('generic 404 does not disable a device; explicit UNREGISTERED safely disables it',async()=>{
 const f=fixture([response(404),response(404,[{errorCode:'UNREGISTERED'}])]);await f.run();
 assert.equal(f.retired.length,1);assert.equal(f.retired[0].enabled,false);
});
test('fully accepted sends have no error and preserve the acceptance timestamp',async()=>{
 const f=fixture([response(200),response(200)]);await f.run();assert.equal(f.changes[0].state,'sent');
 assert.equal(f.changes[0].delivered_count,2);assert.equal(f.changes[0].last_error,null);assert.ok(f.changes[0].sent_at);
});
test('malformed Firebase configuration never leaks credential fragments in the error',async()=>{
 const code=stripTypeScriptTypes(source.slice(source.indexOf('async function fcmAuth('),source.indexOf('async function sendOutbox(')));
 const context={Deno:{env:{get:()=>'{"private_key":"sensitive-secret" BROKEN'}},Error};
 vm.createContext(context);vm.runInContext(code,context);
 await assert.rejects(()=>context.fcmAuth(),/^Error: firebase_config_invalid_json$/);
});
