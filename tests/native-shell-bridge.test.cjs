const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const ownerA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ownerB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const portraitA='11111111-1111-4111-8111-111111111111';
const portraitB='22222222-2222-4222-8222-222222222222';

function harness({installed=false,available=false,active=false,withAppShell=false}={}){
 const listeners=new Map(),documentListeners=new Map(),elements=new Map();
 const messages=[],mutations=[],clicks=[],storage=new Map();
 const add=(map,name,fn)=>map.set(name,[...(map.get(name)||[]),fn]);
 const fire=(map,event)=>{for(const fn of map.get(event.type)||[])fn(event);return true};
 const classes=()=>{
  const values=new Set();
  return {add:(...names)=>names.forEach(n=>values.add(n)),remove:(...names)=>names.forEach(n=>values.delete(n)),
   contains:name=>values.has(name),toggle(name,force){const next=force??!values.has(name);next?values.add(name):values.delete(name);return next}};
 };
 const makeElement=id=>{
  const attributes=new Map(),handlers=new Map();
  const node={id,dataset:{},style:{},classList:classes(),children:[],open:false,
   textContent:'',innerHTML:'',value:'',checked:false,
   setAttribute(name,value){attributes.set(name,String(value));if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(value)},
   getAttribute:name=>attributes.get(name),removeAttribute:name=>attributes.delete(name),
   addEventListener:(name,fn)=>add(handlers,name,fn),
   appendChild(child){this.children.push(child);child.parentElement=this;return child},
   replaceChildren(...children){this.children=children},
   closest(selector){const match=selector.match(/^\[([^\]]+)\]$/);return match&&attributes.has(match[1])?this:null},
   matches(){return false},querySelector(){return null},
   click(){clicks.push({id:this.id,attributes:Object.fromEntries(attributes)});const event={type:'click',target:this,preventDefault(){}};fire(handlers,event);fire(documentListeners,event)},
   close(){this.open=false;fire(documentListeners,{type:'close',target:this})},showModal(){this.open=true},
   remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(n=>n!==this)},
   getBoundingClientRect(){return {left:0,top:0,right:300,bottom:500}}};
  return node;
 };
 const element=id=>{if(!elements.has(id))elements.set(id,makeElement(id));return elements.get(id)};
 const dialogs=[];
 const document={documentElement:{lang:'es',classList:classes()},body:{dataset:{appPage:'crear'}},
  getElementById:element,createElement:tag=>makeElement(tag),
  addEventListener:(name,fn)=>add(documentListeners,name,fn),
  querySelector(selector){
   if(selector==='dialog[open], #auth.show')return dialogs.find(x=>x.open)||(element('auth').classList.contains('show')?element('auth'):null);
   if(selector==='[data-camera-capture]')return element('camera');
   return null;
  },querySelectorAll:selector=>selector==='dialog[open]'?dialogs.filter(x=>x.open):[]};
 class Event{constructor(type){this.type=type}}
 class CustomEvent extends Event{constructor(type,options={}){super(type);this.detail=options.detail}}
 const window={picgiftCurrentUser:{id:ownerA,email:'a@example.test'},picgiftNativeApp:installed,
  picgiftNativeComposeAvailable:available,picgiftNativeComposeShell:active,
  PicgiftNative:{postMessage:value=>messages.push(JSON.parse(value))},
  addEventListener:(name,fn)=>add(listeners,name,fn),dispatchEvent:event=>fire(listeners,event)};
 const context=vm.createContext({window,document,Event,CustomEvent,URL,Image:class{},
  MutationObserver:class{constructor(callback){mutations.push(callback)}observe(){}},
  localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
  setTimeout:()=>1,clearTimeout(){},console});
 const emit=(name,detail)=>window.dispatchEvent(new CustomEvent(name,{detail}));
 if(withAppShell)vm.runInContext(fs.readFileSync('app-shell.js','utf8'),context);
 vm.runInContext(fs.readFileSync('native-shell.js','utf8'),context);
 return {window,document,messages,clicks,storage,element,dialogs,emit,mutate:()=>mutations.forEach(fn=>fn()),
  run:source=>vm.runInContext(source,context),context};
}

test('browser pages retain the HTML controls and cannot invoke native navigation',()=>{
 const h=harness();
 h.emit('picgift:native-ready');h.emit('picgift:navigated',{name:'mis-fotos'});
 assert.deepEqual(h.messages,[]);
 assert.equal(h.document.documentElement.classList.contains('picgift-compose-shell'),false);
 assert.equal(h.window.picgiftNativeCamera(),false);assert.equal(h.window.picgiftNativeBack(),false);
 assert.equal(h.clicks.length,0);
});

test('Android waits for the acknowledged shell before hiding HTML navigation',()=>{
 const h=harness({installed:true,available:true});
 assert.deepEqual(h.messages,[{action:'shell-ready',version:1}]);
 assert.equal(h.document.documentElement.classList.contains('picgift-compose-shell'),false);
 h.emit('picgift:native-ready');
 assert.equal(h.messages.filter(x=>x.action==='shell-ready').length,1);
 h.window.picgiftNativeComposeShell=true;h.emit('picgift:native-ready');
 assert.equal(h.document.documentElement.classList.contains('picgift-compose-shell'),true);
 assert.ok(h.messages.some(x=>x.action==='route'&&x.name==='crear'));
 assert.ok(h.messages.some(x=>x.action==='language'&&x.language==='es'));
});

test('route messages accept only known app screens',()=>{
 const h=harness({installed:true,active:true});h.messages.length=0;
 for(const name of ['mis-fotos','cuenta','resultado'])h.emit('picgift:navigated',{name});
 for(const name of ['https://example.test','javascript:alert(1)','admin','../privacy.html',null])h.emit('picgift:navigated',{name});
 assert.deepEqual(h.messages,[{action:'route',name:'mis-fotos'},{action:'route',name:'cuenta'},{action:'route',name:'resultado'}]);
});

test('gallery messages are bounded and omit session credentials and original photographs',()=>{
 const h=harness({installed:true,active:true});h.messages.length=0;
 const items=Array.from({length:40},(_,i)=>({id:String(i),name:'Portrait',status:'completed',
  created_at:'2026-10-24',preview:'https://preview.test/'+i,access_token:'secret',original:'private/source',result_path:'storage/key'}));
 h.emit('picgift:native-gallery-data',{user_id:ownerA,items,favorites:items.map(x=>x.id),loading:true,error:false,refresh_token:'secret'});
 assert.equal(h.messages.length,1);const sent=h.messages[0];
 assert.equal(sent.action,'gallery-sync');assert.equal(sent.user_id,ownerA);
 assert.equal(sent.items.length,30);assert.equal(sent.favorites.length,30);
 assert.deepEqual(Object.keys(sent.items[0]).sort(),['created_at','id','name','preview','status']);
 assert.equal(JSON.stringify(sent).includes('secret'),false);
 assert.equal(JSON.stringify(sent).includes('private/source'),false);
});

test('logout and account replacement reject late gallery data from the previous owner',()=>{
 const h=harness({installed:true,active:true});h.messages.length=0;
 const data=owner=>({user_id:owner,items:[{id:portraitA,name:'Portrait',status:'queued',created_at:'2026-10-24'}]});
 h.emit('picgift:auth',{user:null});h.emit('picgift:native-gallery-data',data(ownerA));
 assert.deepEqual(h.messages,[{action:'gallery-clear'}]);
 h.emit('picgift:auth',{user:{id:ownerB}});h.messages.length=0;
 h.emit('picgift:native-gallery-data',data(ownerA));assert.equal(h.messages.length,0);
 h.emit('picgift:native-gallery-data',data(ownerB));assert.equal(h.messages.length,1);
 assert.equal(h.messages[0].user_id,ownerB);
});

test('open web dialogs suppress native overlays and native back closes the top dialog first',()=>{
 const h=harness({installed:true,active:true});h.messages.length=0;
 const bottom=h.element('bottom-dialog'),top=h.element('top-dialog');bottom.open=true;top.open=true;
 h.dialogs.push(bottom,top);h.mutate();h.mutate();
 assert.deepEqual(h.messages,[{action:'web-overlay',visible:true}]);
 assert.equal(h.window.picgiftNativeBack(),true);assert.equal(top.open,false);assert.equal(bottom.open,true);
 assert.equal(h.window.picgiftNativeBack(),true);assert.equal(bottom.open,false);
 assert.deepEqual(h.messages.at(-1),{action:'web-overlay',visible:false});
});

test('native camera uses the existing capture control and back returns to the creation screen',()=>{
 const h=harness({installed:true,active:true});const routes=[];
 h.window.addEventListener('picgift:route',event=>routes.push(event.detail.name));
 assert.equal(h.window.picgiftNativeCamera(),true);assert.equal(h.clicks.at(-1).id,'camera');
 h.document.body.dataset.appPage='mis-fotos';assert.equal(h.window.picgiftNativeBack(),true);
 assert.deepEqual(routes,['crear']);h.document.body.dataset.appPage='crear';
 assert.equal(h.window.picgiftNativeBack(),false);
});

test('native gallery actions preserve owner isolation and reuse existing download handlers',()=>{
 const h=harness({installed:true,active:true,withAppShell:true});
 h.window.picgiftRenderGallery([{job:{id:portraitA,status:'completed',created_at:'2026-10-24'},name:'Portrait',href:'https://preview.test/photo'}]);
 h.clicks.length=0;
 for(const [action,id,owner] of [['open',portraitA,ownerB],['download',portraitB,ownerA],['delete',portraitA,ownerA]]){
  assert.equal(h.window.picgiftNativeGalleryAction(action,id,owner),false);
 }
 assert.equal(h.clicks.length,0);
 assert.equal(h.window.picgiftNativeGalleryAction('download',portraitA,ownerA),true);
 assert.deepEqual(h.clicks.at(-1).attributes,{'data-download-job':portraitA});
 assert.equal(h.window.picgiftNativeGalleryAction('favorite',portraitA,ownerA),true);
 assert.deepEqual(JSON.parse(h.storage.get('picgift.ui.'+ownerA+'.favorites')),[portraitA]);
 h.emit('picgift:auth',{user:{id:ownerB,email:'b@example.test'}});
 assert.equal(h.window.picgiftNativeGalleryAction('open',portraitA,ownerA),false);
 assert.equal(h.window.picgiftNativeGalleryAction('open',portraitA,ownerB),false);
 assert.equal(h.storage.has('picgift.ui.'+ownerB+'.favorites'),false);
});
