// Run locally without dependencies: node --test tests/beta-release.test.cjs
// These tests do not compile Android or authenticate with Google.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ROOT=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const source=read('sw.js');
const ORIGIN='https://picgift.example';

function worker(){
 const listeners=new Map(),entries=new Map(),deleted=[],stores=new Map();
 let online=true;
 function store(name){
  if(!stores.has(name))stores.set(name,{put:async(key,res)=>entries.set(name+':'+key,res),match:async key=>entries.get(name+':'+key)});
  return stores.get(name);
 }
 class WorkerRequest extends Request {constructor(input,options){super(typeof input==='string'?new URL(input,ORIGIN):input,options)}}
 const context={URL,Request:WorkerRequest,Response,Set,Promise,
  self:{location:{origin:ORIGIN},addEventListener:(key,fn)=>listeners.set(key,fn),skipWaiting:async()=>{},clients:{claim:async()=>{}}},
  caches:{open:async name=>store(name),keys:async()=>[...stores.keys()],delete:async name=>{deleted.push(name);return stores.delete(name)}},
  fetch:async()=>{if(!online)throw Error('offline');return new Response('public-resource',{status:200})}
 };
 vm.runInNewContext(source,context,{filename:'sw.js'});
 function request(url,options){let result;listeners.get('fetch')({request:new WorkerRequest(url,options),respondWith:value=>{result=value}});return result;}
 async function event(name){let result;listeners.get(name)({waitUntil:value=>{result=value}});await result;}
 return {context,entries,stores,deleted,request,event,setOffline:()=>{online=false}};
}

test('web cache includes the actual dynamically imported beta component and news module',()=>{
 const paths=source.match(/const SHELL=\[([\s\S]*?)\];/)[1].match(/"[^"]+"/g).map(JSON.parse);
 assert.equal(paths.filter(p=>p==='/beta-feedback.js').length,1);
 assert.equal(paths.filter(p=>p==='/announcements.js').length,1);
 assert.match(read('experience.js'),/import\('\.\/beta-feedback\.js'\)/);
 for(const p of ['/beta-feedback.js','/announcements.js'])assert.ok(fs.existsSync(path.join(ROOT,p)));
 assert.ok(!paths.some(p=>/token|signed|storage\/|api\/|sql\/|tests\/|\.jks|\.env/i.test(p)));
});

test('new public modules remain available through the offline cache',async()=>{
 const w=worker();await w.event('install');w.setOffline();
 for(const file of ['/beta-feedback.js','/announcements.js']){
  const result=await w.request(file+'?v=beta20');
  assert.equal(result.status,200);assert.equal(await result.text(),'public-resource');
 }
});

test('private and cross-origin traffic never enters the public cache',()=>{
 const w=worker();
 const requests=[
  ['https://uimrvgrpenccijumyiek.supabase.co/storage/v1/object/sign/picgift-generated/owner/photo.png?token=secret'],
  ['/storage/v1/object/sign/picgift-generated/owner/photo.png?token=secret'],
  ['/auth.js',{headers:{Authorization:'Bearer private-session'}}],
  ['/index.html?code=private-code'],['/?access_token=private-token'],
  ['/index.html?refresh_token=private-refresh'],['/announcements.js?token=private-token'],
  ['/?error=access_denied&error_description=private-detail'],
  ['/auth.js',{method:'POST',body:'private-input'}]
 ];
 for(const [url,options] of requests)assert.equal(w.request(url,options),undefined,url);
 assert.equal(w.entries.size,0);
});

test('cache upgrade removes old PicGift shells but leaves unrelated application caches alone',async()=>{
 const w=worker();await w.context.caches.open('picgift-shell-beta19-20261024-v1');
 await w.context.caches.open('other-app');await w.event('install');await w.event('activate');
 assert.ok(w.deleted.includes('picgift-shell-beta19-20261024-v1'));
 assert.ok(!w.deleted.includes('other-app'));
 assert.ok([...w.stores.keys()].some(name=>/^picgift-shell-beta20-/.test(name)));
});

test('store draft is within field limits for both languages',()=>{
 const draft=JSON.parse(read('store-listing/beta-copy.json'));
 for(const locale of ['es-ES','en-US']){
  for(const [key,max] of [['title',30],['shortDescription',80],['fullDescription',4000]]){
   const value=draft[locale][key];assert.ok(typeof value==='string'&&value.trim());
   assert.ok(value.length<=max,locale+' '+key);
  }
 }
 assert.match(draft.status,/Not uploaded/);
});

test('candidate Android version advances while retaining original package and signing configuration',()=>{
 const gradle=read('android/app/build.gradle.kts');
 assert.match(gradle,/applicationId = "com\.picgift\.myapp"/);
 assert.ok(Number(gradle.match(/versionCode\s*=\s*(\d+)/)[1])>=20);
 assert.match(gradle,/versionName = "\d+\.\d+\.\d+-beta"/);
 for(const key of ['PICGIFT_UPLOAD_STORE','PICGIFT_UPLOAD_STORE_PASSWORD','PICGIFT_UPLOAD_KEY_ALIAS','PICGIFT_UPLOAD_KEY_PASSWORD'])assert.ok(gradle.includes(key));
 assert.doesNotMatch(gradle,/storePassword\s*=\s*"|keyPassword\s*=\s*"/);
});

test('Android validation and signed packaging cannot skip beta regression checks',()=>{
 for(const filename of ['android-debug.yml','android-play-release.yml']){
  const workflow=read('.github/workflows/'+filename);
  const gate=workflow.indexOf('uses: ./.github/actions/beta-quality');
  assert.ok(gate>0&&gate<workflow.indexOf('run: gradle -p android'),filename);
  assert.ok(workflow.includes('node --test tests/*.test.cjs'),filename);
  assert.doesNotMatch(workflow,/continue-on-error:\s*true/);
 }
 const signed=read('.github/workflows/android-play-release.yml');
 assert.ok(signed.indexOf('uses: ./.github/actions/beta-quality')<signed.indexOf('base64 --decode'));
 assert.match(signed,/jarsigner -verify/);assert.match(signed,/PICGIFT_UPLOAD_CERT_SHA256/);
 const gate=read('.github/actions/beta-quality/action.yml');
 assert.match(gate,/PICGIFT_TEST_IN_MEMORY: '0'/);
 assert.match(gate,/python tests\/beta-feedback\.browser\.py/);
 assert.doesNotMatch(gate,/continue-on-error:\s*true/);
});
