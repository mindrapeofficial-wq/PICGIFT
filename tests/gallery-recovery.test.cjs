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
 return {context,run,events,renders,queries,links,element};
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
