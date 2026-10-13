const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function setup(native=true){
 const events={},documentEvents={},storage=new Map(),routes=[],timers=[],parts=new Map();
 const element=()=>({hidden:false,open:false,children:[],setAttribute(){},addEventListener(name,fn){this[name]=fn},showModal(){this.open=true},close(){this.open=false},prepend(child){child.parentNode=this;this.children.unshift(child)},querySelector(selector){if(!parts.has(selector))parts.set(selector,element());return parts.get(selector)}});
 const dialog=element(),card=element(),pages=new Map(['inicio','crear','mis-fotos','resultado'].map(p=>[p,element()]));
 const window={PicgiftNative:native?{}:null,addEventListener:(n,f)=>events[n]=f,dispatchEvent(e){if(e.type==='picgift:route'){routes.push(e.detail.name);events['picgift:navigated']?.({detail:e.detail})}else events[e.type]?.(e)}};
 const context={window,document:{getElementById:id=>id==='first-steps'?dialog:null,createElement:()=>card,querySelector:selector=>pages.get(selector.match(/data-page="([^"]+)"/)?.[1]),addEventListener:(n,f)=>documentEvents[n]=f},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},setTimeout:fn=>timers.push(fn),Event:class{constructor(type){this.type=type}},CustomEvent:class{constructor(type,args){this.type=type;this.detail=args.detail}}};
 vm.runInNewContext(fs.readFileSync('first-steps.js','utf8'),context);
 const send=(type,detail={})=>events[type]?.({type,detail});
 const flush=()=>{while(timers.length)timers.shift()()};
 const click=(selector,primary=false)=>documentEvents.click({target:{closest:s=>s===selector?{classList:{contains:()=>primary}}:null}});
 const login=id=>{send('picgift:auth',{user:id?{id}:null});flush()};
 const ready=()=>{window.picgiftEntryNotificationsReady=true;send('picgift:entry-notifications-ready');flush()};
 return {send,flush,click,login,ready,window,dialog,card,storage,routes,part:selector=>parts.get(selector)};
}

test('native entry waits for the notifications result, lands on Home and then explains the app',()=>{
 const h=setup();h.login('a');assert.equal(h.dialog.open,false);assert.equal(h.routes.length,0);
 h.ready();assert.deepEqual(h.routes,['inicio']);assert.equal(h.dialog.open,true);
 h.click('[data-first-steps-done]',true);assert.equal(h.dialog.open,false);assert.equal(h.routes.at(-1),'crear');
 assert.match(h.part('#first-photo-step').textContent,/1 \/ 5/);assert.equal(h.storage.size,0);
});

test('Later and Escape do not complete the guide; an account can resume from its profile',()=>{
 const h=setup(false);h.login('a');assert.equal(h.dialog.open,true);
 h.click('[data-first-steps-done]');assert.equal(h.card.hidden,true);assert.equal(h.storage.size,0);
 h.click('[data-first-steps]');assert.equal(h.dialog.open,true);
 h.dialog.cancel({preventDefault(){}});assert.equal(h.storage.size,0);assert.equal(h.dialog.open,false);
 h.login(null);h.login('a');assert.equal(h.dialog.open,true);
});

test('guide follows photo, explicit scene choice, consent and job processing without marking success',()=>{
 const h=setup(false);h.login('a');h.click('[data-first-steps-done]',true);
 h.send('picgift:studio-state',{hasPhoto:true,hasScene:true});assert.match(h.part('#first-photo-step').textContent,/2 \/ 5/);
 h.send('picgift:scene-selected');assert.match(h.part('#first-photo-step').textContent,/3 \/ 5/);
 h.send('picgift:studio-state',{hasPhoto:true,hasScene:true,hasConsent:true,available:true});assert.match(h.part('#first-photo-step').textContent,/4 \/ 5/);
 h.send('picgift:portrait-started',{id:'job'});assert.match(h.part('#first-photo-heading').textContent,/preparando/);
 h.send('picgift:gallery',{jobs:[{id:'job',status:'completed'}]});assert.match(h.part('#first-photo-step').textContent,/5 \/ 5/);
 assert.equal(h.storage.size,0);assert.equal(h.part('[data-guide-saved]').hidden,false);
 h.click('[data-guide-saved]');assert.equal(h.storage.get('picgift-first-portrait-v2:a'),'done');assert.equal(h.card.hidden,true);
});

test('failed or reviewed portraits keep the guide incomplete and offer the real job status',()=>{
 for(const status of ['failed','needs_review']){
  const h=setup(false);h.login('a');h.click('[data-first-steps-done]',true);
  h.send('picgift:portrait-started',{id:'job'});h.send('picgift:gallery',{jobs:[{id:'job',status}]});
  assert.match(h.part('#first-photo-heading').textContent,/no pudo|necesita revisión/);
  h.click('[data-guide-saved]');assert.equal(h.storage.size,0);
 }
});

test('a native download completion belongs to its account and requires a completed portrait',()=>{
 const h=setup(false);h.login('a');h.send('picgift:portrait-saved',{user_id:'a'});assert.equal(h.storage.size,0);
 h.send('picgift:gallery',{jobs:[{id:'job',status:'completed'}]});h.send('picgift:portrait-saved',{user_id:'other'});assert.equal(h.storage.size,0);
 h.send('picgift:portrait-saved',{user_id:'a'});assert.equal(h.storage.get('picgift-first-portrait-v2:a'),'done');
 h.login(null);h.login('b');assert.equal(h.dialog.open,true);assert.notEqual(h.storage.get('picgift-first-portrait-v2:b'),'done');
});

test('returning completed users reach Home without an automatic tutorial and can reopen it',()=>{
 const h=setup();h.storage.set('picgift-first-portrait-v2:a','done');h.ready();h.login('a');
 assert.equal(h.routes.at(-1),'inicio');assert.equal(h.dialog.open,false);assert.equal(h.card.hidden,true);
 h.click('[data-first-steps]');assert.equal(h.dialog.open,true);
});

test('a delayed entry callback cannot open the guide after logout',()=>{
 const h=setup(false);h.send('picgift:auth',{user:{id:'a'}});h.send('picgift:auth',{user:null});h.flush();
 assert.equal(h.dialog.open,false);assert.equal(h.card.hidden,true);assert.equal(h.routes.length,0);
});
