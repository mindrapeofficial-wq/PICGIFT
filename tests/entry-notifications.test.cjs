const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function harness({signedIn=true,asked=false,enabled=false,storageBroken=false}={}){
 const events=new Map(),messages=[],emitted=[],timers=new Map(),prefs=new Map();let timerId=0,authChange;
 let session=signedIn?{user:{id:'customer-a'},access_token:'token:customer-a'}:null;
 const statusElement={textContent:''},consent={id:'picgift-push-consent',checked:enabled,disabled:false};
 if(asked)prefs.set('picgift-push-permission-asked-v1','yes');
 if(enabled)prefs.set('picgift-push-opt-in','yes');
 const window={PicgiftNative:{postMessage(value){messages.push(JSON.parse(value));}},
  addEventListener(name,fn){events.set(name,fn)},dispatchEvent(event){emitted.push(event.type);events.get(event.type)?.(event)}};
 const client={auth:{getSession:async()=>({data:{session}}),onAuthStateChange(fn){authChange=fn}},functions:{invoke:async()=>({data:{},error:null})}};
 const context={window,Event,clearTimeout:id=>timers.delete(id),setTimeout:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id},
  localStorage:{getItem:k=>{if(storageBroken)throw Error('unavailable');return prefs.get(k)||null},setItem:(k,v)=>{if(storageBroken)throw Error('unavailable');prefs.set(k,v)},removeItem:k=>prefs.delete(k)},
  document:{getElementById:id=>id==='picgift-push-status'?statusElement:id==='picgift-push-consent'?consent:null,addEventListener:(name,fn)=>events.set('document:'+name,fn)},createClient:()=>client,SUPABASE_URL:'https://test.invalid',SUPABASE_PUBLISHABLE_KEY:'test',MutationObserver:class{},console};
 vm.runInNewContext(fs.readFileSync('native-notifications.js','utf8').replace(/^import .*;\r?$/gm,''),context);
 const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve()};
 return {window,messages,emitted,prefs,client,flush,statusElement,consent,async tick(ms){await flush();for(const[id,t]of [...timers])if(t.ms===ms){timers.delete(id);t.fn()}await flush()},
  async push(status,detail={}){events.get('picgift:native-push')?.({detail:{status,...detail}});await flush()},
  async auth(user){session=user?{user,access_token:'token:'+user.id}:null;authChange(user?'SIGNED_IN':'SIGNED_OUT',session);await flush()},
  change(enabled){consent.checked=enabled;return events.get('document:change')({target:consent})}};
}
function deferred(){let resolve;return {promise:new Promise(done=>resolve=done),resolve:value=>resolve(value)}};
const device={token:'valid-test-device-token',installation_id:'test-installation'};
test('signed-in entry requests notifications before the introduction and continues on refusal',async()=>{
 const h=harness();await h.tick(400);assert.deepEqual(h.messages,[{action:'notifications-enable'}]);
 assert.equal(h.window.picgiftEntryNotificationsReady,false);
 await h.push('permission_denied');assert.equal(h.window.picgiftEntryNotificationsReady,true);
 assert.equal(h.emitted.filter(x=>x==='picgift:entry-notifications-ready').length,1);
});
test('repeated authentication events cannot skip an outstanding notification prompt',async()=>{
 const h=harness();await h.tick(400);await h.auth({id:'customer-a'});await h.tick(400);
 assert.equal(h.messages.length,1);assert.equal(h.window.picgiftEntryNotificationsReady,false);
 await h.push('permission_denied');assert.equal(h.window.picgiftEntryNotificationsReady,true);
});
test('logged-out entry never asks for notifications',async()=>{
 const h=harness({signedIn:false});await h.tick(400);assert.equal(h.messages.length,0);assert.equal(h.emitted.length,0);
});
test('a previous refusal skips the prompt and lets the returning customer enter',async()=>{
 const h=harness({asked:true});await h.tick(400);assert.equal(h.messages.length,0);assert.equal(h.window.picgiftEntryNotificationsReady,true);
});
test('a stalled native response and unavailable local storage do not block the introduction',async()=>{
 for(const storageBroken of [false,true]){
  const h=harness({storageBroken});await h.tick(400);await h.tick(10000);
  assert.equal(h.window.picgiftEntryNotificationsReady,true);
 }
});
test('no Firebase and transient notification failures both release onboarding',async()=>{
 for(const status of ['not_configured','unavailable']){
  const h=harness();await h.tick(400);await h.push(status);assert.equal(h.window.picgiftEntryNotificationsReady,true);
 }
});
test('signing out cancels the entry timeout and cannot open a logged-out guide',async()=>{
 const h=harness();await h.tick(400);await h.auth(null);await h.tick(10000);
 assert.equal(h.window.picgiftEntryNotificationsReady,false);assert.equal(h.emitted.length,0);
});

test('duplicate native callbacks reserve one registration before session lookup completes',async()=>{
 const h=harness({enabled:true}),identity=deferred();let registrations=0;
 await h.flush();h.client.auth.getSession=()=>identity.promise;
 h.client.functions.invoke=async()=>{registrations++;return {data:{ok:true},error:null}};
 await h.push('ready',device);await h.push('ready',device);assert.equal(registrations,0);
 identity.resolve({data:{session:{user:{id:'customer-a'},access_token:'token:customer-a'}}});await h.flush();
 assert.equal(registrations,1);
});

test('logout waits for an in-flight registration and leaves the server device unregistered',async()=>{
 const h=harness({enabled:true}),pending=deferred(),calls=[];let registered=false;
 h.client.functions.invoke=async(name,{body,headers})=>{
  calls.push({action:body.action,authorization:headers.Authorization});
  if(body.action==='register'){await pending.promise;registered=true}else registered=false;
  return {data:{ok:true},error:null};
 };
 await h.push('ready',device);
 const logout=h.window.picgiftNotificationsUnregister();await h.flush();
 assert.equal(h.prefs.get('picgift-push-opt-in'),undefined);
 assert.equal(calls.filter(x=>x.action==='unregister').length,0,'remove only after the earlier registration settles');
 assert.equal(h.messages.at(-1).action,'notifications-disable');
 pending.resolve();await logout;await h.auth(null);await h.flush();
 assert.equal(registered,false);
 assert.ok(calls.every(x=>x.authorization==='Bearer token:customer-a'));
 await h.push('ready',device);
 assert.equal(calls.filter(x=>x.action==='register').length,1,'a late native ready event cannot re-register after logout');
 assert.doesNotMatch(h.statusElement.textContent,/activadas en este móvil/);
});

test('switching accounts cleans up with the original token before allowing a new opt-in',async()=>{
 const h=harness({enabled:true}),pending=deferred(),calls=[];let deviceOwner=null;
 h.client.functions.invoke=async(name,{body,headers})=>{
  const owner=headers.Authorization.replace('Bearer token:','');calls.push({action:body.action,owner});
  if(body.action==='register'){if(owner==='customer-a')await pending.promise;deviceOwner=owner;}
  else if(deviceOwner===owner)deviceOwner=null;
  return {data:{ok:true},error:null};
 };
 await h.push('ready',device);await h.auth({id:'customer-b'});
 pending.resolve();await h.flush();await h.flush();
 assert.equal(deviceOwner,null);assert.ok(calls.every(x=>x.owner==='customer-a'));
 await h.change(true);await h.push('ready',device);await h.flush();
 assert.equal(deviceOwner,'customer-b');
 assert.equal(calls.filter(x=>x.action==='register').length,2);
 assert.equal(calls.at(-1).owner,'customer-b');
});

test('opting out while identity is pending prevents registration from ever reaching the server',async()=>{
 const h=harness({enabled:true}),identity=deferred(),calls=[];
 await h.flush();h.client.auth.getSession=()=>identity.promise;
 h.client.functions.invoke=async(name,{body})=>{calls.push(body.action);return {data:{},error:null}};
 await h.push('ready',device);const optOut=h.change(false);await h.flush();
 identity.resolve({data:{session:{user:{id:'customer-a'},access_token:'token:customer-a'}}});await optOut;await h.flush();
 assert.equal(calls.includes('register'),false);assert.equal(h.consent.checked,false);
});

test('a late entry identity response cannot ask permission after logout',async()=>{
 const h=harness(),identity=deferred();await h.flush();h.client.auth.getSession=()=>identity.promise;
 await h.tick(400);await h.auth(null);
 identity.resolve({data:{session:{user:{id:'customer-a'},access_token:'token:customer-a'}}});await h.flush();
 assert.equal(h.messages.some(x=>x.action==='notifications-enable'),false);
 assert.equal(h.window.picgiftEntryNotificationsReady,false);
});

test('a preference held in memory still permits registration when localStorage is unavailable',async()=>{
 const h=harness({storageBroken:true});let registrations=0;
 h.client.functions.invoke=async(name,{body})=>{if(body.action==='register')registrations++;return {data:{},error:null}};
 await h.tick(400);await h.push('ready',device);await h.flush();
 assert.equal(registrations,1);assert.equal(h.window.picgiftEntryNotificationsReady,true);
});

test('a delayed manual opt-in cannot reopen permission after the user signs out',async()=>{
 const h=harness({asked:true}),identity=deferred();await h.flush();h.client.auth.getSession=()=>identity.promise;
 const enabling=h.change(true);await h.auth(null);
 identity.resolve({data:{session:{user:{id:'customer-a'},access_token:'token:customer-a'}}});await enabling;await h.flush();
 assert.equal(h.messages.some(x=>x.action==='notifications-enable'),false);
 assert.equal(h.consent.checked,false);
});
