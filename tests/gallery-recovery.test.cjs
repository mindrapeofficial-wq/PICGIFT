const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
function harness(){
 const elements=new Map(),events={},renders=[],queries=[],links=[];
 const element=id=>{if(!elements.has(id))elements.set(id,{style:{},dataset:{},classList:{add(){},remove(){},toggle(){}},addEventListener(){},setAttribute(){},removeAttribute(name){delete this[name]},replaceChildren(){}});return elements.get(id)};
 const client={from(){return {select(){return this},order(){return this},limit(){const request=deferred();queries.push(request);return request.promise}}},storage:{from(){return {createSignedUrl(){const request=deferred();links.push(request);return request.promise}}}},auth:{getUser:()=>new Promise(()=>{})}};
 const context=vm.createContext({createClient:()=>client,SUPABASE_URL:'test',SUPABASE_PUBLISHABLE_KEY:'test',document:{readyState:'loading',hidden:false,getElementById:element,querySelectorAll:()=>[],addEventListener:(name,fn)=>events[name]=fn},window:{addEventListener:(name,fn)=>events[name]=fn,picgiftRenderGallery:items=>renders.push(items)},console:{warn(){}},setInterval(){},clearInterval(){},Date});
 vm.runInContext(fs.readFileSync('generator.js','utf8').replace(/^import .*;\r?\n/gm,''),context);
 const run=source=>vm.runInContext(source,context);
 return {context,run,events,renders,queries,links,element,client};
}
const job=id=>({id,scene_id:'halloween-potions',status:'completed',result_path:id+'.jpg',created_at:new Date().toISOString()});
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('returning to a visible app and reconnecting refresh completed photos without an active job',async()=>{
 const h=harness();h.run('init(); galleryAuthenticated=true; activeId=null');
 h.events.visibilitychange();assert.equal(h.queries.length,1);
 h.queries[0].resolve({data:[job('photo')],error:null});await settle();
 assert.equal(h.links.length,1);h.links[0].resolve({data:{signedUrl:'https://private/view'}});await settle();
 h.links[1].resolve({data:{signedUrl:'https://private/download'}});await settle();
 assert.equal(h.element('download-result').href,'https://private/download');
 h.events.online();assert.equal(h.queries.length,2);
 h.context.document.hidden=true;h.events.online();assert.equal(h.queries.length,2);
 h.context.document.hidden=false;await h.events['picgift:auth']({detail:{user:null}});
 h.events.online();h.events.visibilitychange();assert.equal(h.queries.length,2);
});
test('a query finishing after logout cannot restore private photos',async()=>{
 const h=harness();h.run('init(); galleryAuthenticated=true');
 const pending=h.run('refreshGallery()');await h.events['picgift:auth']({detail:{user:null}});
 h.queries[0].resolve({data:[job('old-account')],error:null});assert.equal(await pending,null);
 assert.equal(h.links.length,0);assert.equal(h.renders.length,0);
 assert.equal(h.context.window.picgiftGallery.length,0);
});
test('signed links finishing after logout cannot restore a download link',async()=>{
 const h=harness();h.run('init(); galleryAuthenticated=true');const pending=h.run('refreshGallery()');
 h.queries[0].resolve({data:[job('old-account')],error:null});await settle();
 await h.events['picgift:auth']({detail:{user:null}});
 h.links[0].resolve({data:{signedUrl:'https://old/view'}});await settle();h.links[1].resolve({data:{signedUrl:'https://old/download'}});
 assert.equal(await pending,null);assert.equal(h.renders.length,0);assert.equal(h.element('download-result').href,undefined);
});
test('an older gallery response cannot overwrite a newer refresh',async()=>{
 const h=harness();const old=h.run('refreshGallery()'),latest=h.run('refreshGallery()');
 h.queries[1].resolve({data:[],error:null});assert.equal((await latest).length,0);
 h.queries[0].resolve({data:[job('stale')],error:null});assert.equal(await old,null);
 assert.equal(h.renders.length,1);assert.equal(h.renders[0].length,0);assert.equal(h.links.length,0);
});
test('a delayed login check cannot start loading photos after logout',async()=>{
 const h=harness(),health=deferred();h.context.healthWait=health.promise;
 h.run('init(); health=()=>healthWait');
 const login=h.events['picgift:auth']({detail:{user:{id:'old-account'}}});
 await h.events['picgift:auth']({detail:{user:null}});health.resolve();await login;
 assert.equal(h.queries.length,0);assert.equal(h.context.window.picgiftGallery.length,0);
});
test('health replies from the previous session cannot enable the studio after logout',async()=>{
 const h=harness(),requests=[];
 h.context.document.documentElement={dataset:{campaign:'halloween'}};
 h.client.auth.getSession=async()=>({data:{session:{user:{id:'old-account'}}}});
 h.client.functions={invoke(){const request=deferred();requests.push(request);return request.promise}};
 h.run('init(); galleryAuthenticated=true');const pending=h.run('health()');await settle();
 await h.events['picgift:auth']({detail:{user:null}});
 requests[0].resolve({data:{available:true}});requests[1].resolve({data:{available:true,email_available:true,pilot:true,references_supported:true}});await pending;
 assert.equal(h.element('generate').disabled,true);
 assert.equal(h.context.window.picgiftAiReady,false);
 assert.equal(h.context.window.picgiftFreeReady,false);
 assert.equal(h.context.window.picgiftPremiumReady,false);
});
test('an older failing health request cannot disable a newer available studio',async()=>{
 const h=harness(),requests=[];
 h.context.document.documentElement={dataset:{campaign:'halloween'}};
 h.client.auth.getSession=async()=>({data:{session:{user:{id:'account'}}}});
 h.client.functions={invoke(){const request=deferred();requests.push(request);return request.promise}};
 const old=h.run('health()');await settle();const latest=h.run('health()');await settle();
 requests[2].resolve({data:{available:true}});requests[3].resolve({data:{available:true,email_available:true,pilot:true,references_supported:true}});await latest;
 requests[0].resolve({error:true});requests[1].resolve({error:true});await old;
 assert.equal(h.context.window.picgiftAiReady,true);
 assert.equal(h.context.window.picgiftFreeReady,true);
 assert.equal(h.context.window.picgiftPremiumReady,true);
 assert.equal(h.element('photo-email-delivery').disabled,false);
});
test('logout clears all capabilities and email delivery from an available studio',async()=>{
 const h=harness();h.run('init(); freeReady=true; premiumReady=true; window.picgiftFreeReady=true; window.picgiftPremiumReady=true; window.picgiftPilot=true; window.picgiftReferencesReady=true; controlAi(true)');
 h.element('photo-email-delivery').checked=true;
 await h.events['picgift:auth']({detail:{user:null}});
 for(const name of ['picgiftAiReady','picgiftFreeReady','picgiftPremiumReady','picgiftPilot','picgiftReferencesReady'])assert.equal(h.context.window[name],false,name);
 assert.equal(h.element('photo-email-delivery').disabled,true);assert.equal(h.element('photo-email-delivery').checked,false);
});
function creationHarness(pause){
 const h=harness(),waiting=deferred(),calls=[],uploads=[],removed=[],routes=[];
 h.context.crypto={randomUUID:()=> 'test-upload'};
 h.context.CustomEvent=class{constructor(type,options){this.type=type;this.detail=options.detail}};
 h.context.window.picgiftI18n={language:'es'};
 h.context.window.dispatchEvent=event=>routes.push(event);
 h.run('init(); galleryAuthenticated=true; premiumReady=true; preparedFile=async file=>file');
 h.client.auth.getUser=async()=>({data:{user:{id:'old-account'}}});
 h.client.functions={async invoke(name,{body}){calls.push(body.action);if(body.action===pause)return waiting.promise;return {data:{available:true,email_available:true,references_supported:true,id:'job'}}}};
 h.client.storage.from=()=>({async upload(path){uploads.push(path);return pause==='upload'?waiting.promise:{}},async remove(paths){removed.push(...paths);return {}}});
 h.client.from=()=>({select(){return this},order(){return this},limit:async()=>({data:[],error:null})});
 const event={detail:{service:'premium',file:{type:'image/png',size:2},scene_id:'halloween-potions',consent:true,pose:'portrait',outfit:'original'}};
 h.context.createEvent=event;
 return {...h,waiting,calls,uploads,removed,routes};
}
test('logout during generation health stops uploads and the start request',async()=>{
 const h=creationHarness('health'),pending=h.run('create(createEvent)');await settle();
 await h.events['picgift:auth']({detail:{user:null}});
 h.waiting.resolve({data:{available:true}});await pending;
 assert.equal(h.uploads.length,0);assert.deepEqual(h.calls,['health']);assert.equal(h.routes.length,0);
 assert.equal(h.run('working'),false);
});
test('logout during upload stops generation submission and cleans an unsubmitted original',async()=>{
 const h=creationHarness('upload'),pending=h.run('create(createEvent)');await settle();
 await h.events['picgift:auth']({detail:{user:null}});h.waiting.resolve({});await pending;
 assert.deepEqual(h.calls,['health']);assert.equal(h.uploads.length,1);assert.deepEqual(h.removed,h.uploads);
 assert.equal(h.routes.length,0);assert.equal(h.run('activeId'),null);
});
test('an accepted generation from the old session does not route, poll or delete its original after logout',async()=>{
 const h=creationHarness('start'),pending=h.run('create(createEvent)');await settle();
 assert.deepEqual(h.calls,['health','start']);
 await h.events['picgift:auth']({detail:{user:null}});h.waiting.resolve({data:{id:'accepted-job'}});await pending;
 assert.equal(h.routes.length,0);assert.equal(h.run('activeId'),null);assert.equal(h.removed.length,0);
 assert.match(h.element('generator-status').textContent,/Inicia sesión/);
});
test('a normal accepted generation still opens its result and retains the uploaded original',async()=>{
 const h=creationHarness(null);await h.run('create(createEvent)');
 assert.deepEqual(h.calls,['health','start']);assert.equal(h.uploads.length,1);assert.equal(h.removed.length,0);
 assert.equal(h.routes.length,1);assert.equal(h.routes[0].detail.name,'resultado');assert.equal(h.run('activeId'),'job');assert.equal(h.run('working'),false);
});
test('switching accounts clears the old gallery immediately before the new session check finishes',async()=>{
 const h=harness(),health=deferred();h.context.healthWait=health.promise;
 h.run('init(); health=()=>healthWait; activeId="old-job"; window.picgiftGallery=[{job:{id:"old-job"}}]');
 h.element('download-result').href='https://private/old';h.element('result-sample').src='https://private/old';
 const login=h.events['picgift:auth']({detail:{user:{id:'new-account'}}});
 assert.equal(h.context.window.picgiftGallery.length,0);assert.equal(h.run('activeId'),null);
 assert.equal(h.element('download-result').href,undefined);assert.equal(h.element('result-sample').src,undefined);
 health.resolve();await settle();h.queries[0].resolve({data:[],error:null});await login;
});
