const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

test('device language, explicit preference and translated option preserve server value',()=>{
 const text=(value,parent)=>({nodeType:3,nodeValue:value,get textContent(){return this.nodeValue},parentElement:parent});
 const element=(tag,children=[],attrs={})=>({nodeType:1,tagName:tag,childNodes:children,get value(){return attrs.value},set value(v){attrs.value=v},matches:s=>s.split(',').includes(tag.toLowerCase()),closest:()=>null,hasAttribute:k=>k in attrs,getAttribute:k=>attrs[k],setAttribute:(k,v)=>attrs[k]=v,get textContent(){return this.childNodes.map(n=>n.textContent).join('')}});
 const heading=element('H1');heading.childNodes=[text('Su aventura empieza aquí',heading)];
 const option=element('OPTION');option.childNodes=[text('Pequeño mago',option)];
 const root=element('HTML',[heading,option]);
 const listeners={},storage=new Map();
 const context={document:{readyState:'complete',documentElement:root,querySelectorAll:()=>[]},Node:{TEXT_NODE:3,ELEMENT_NODE:1},window:{addEventListener:(k,f)=>listeners[k]=f,dispatchEvent:()=>{}},navigator:{languages:['en-US']},location:{search:''},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},URLSearchParams,Intl,CustomEvent:class{},MutationObserver:class{observe(){}disconnect(){}}};
 vm.runInNewContext(fs.readFileSync('i18n.js','utf8'),context);
 assert.equal(root.lang,'en');assert.equal(heading.textContent,'Their adventure starts here');
 assert.equal(option.textContent,'Little wizard');assert.equal(option.value,'Pequeño mago');
 context.window.picgiftI18n.setPreference('es');
 assert.equal(heading.textContent,'Su aventura empieza aquí');assert.equal(option.value,'Pequeño mago');
 context.window.picgiftI18n.setPreference('auto');assert.equal(root.lang,'en');
 assert.equal(context.window.picgiftI18n.t('5 fotografías'),'5 photos');
});

test('full source is preserved, selected framing is exported and extreme pan stays inside source',async()=>{
 const elements=new Map(),canvases=[];
 const make=()=>{const e={value:'original',width:600,height:750,listeners:{},classList:{add(){},remove(){}},getContext:()=>({clearRect(){},save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},drawImage(...args){e.draw=args}}),addEventListener:(k,f)=>e.listeners[k]=f,removeAttribute(){},toBlob:f=>f(new Blob(['image'],{type:'image/jpeg'})),getBoundingClientRect:()=>({width:600,height:600}),setPointerCapture(){}};return e;};
 const get=id=>{if(!elements.has(id))elements.set(id,make());return elements.get(id)};
 const context={document:{getElementById:get,createElement:()=>{const c=make();canvases.push(c);return c},querySelectorAll:()=>[]},window:{},Image:class{naturalWidth=1000;naturalHeight=1500;async decode(){}},URL:{createObjectURL:()=> 'blob:local',revokeObjectURL(){}},File:class extends Blob{constructor(parts,name,opts){super(parts,opts);this.name=name}},Blob};
 vm.runInNewContext(fs.readFileSync('photo-editor.js','utf8'),context);
 const editor=context.window.picgiftPhotoEditor;await editor.open(new Blob(['image']));
 await editor.exportFile();let draw=canvases.at(-1).draw;
 assert.ok(Math.abs(draw[1])<0.001);assert.ok(Math.abs(draw[2])<0.001);assert.equal(draw[3],1000);assert.equal(draw[4],1500);
 get('crop-ratio').value='1';get('crop-ratio').listeners.change();await editor.exportFile();draw=canvases.at(-1).draw;
 assert.equal(draw[3],1000);assert.equal(draw[4],1000);assert.equal(draw[2],250);
 get('crop-zoom').listeners.input({target:{value:'3'}});
 get('crop-canvas').listeners.pointerdown({pointerId:1,clientX:0,clientY:0});
 get('crop-canvas').listeners.pointermove({pointerId:1,clientX:10000,clientY:-10000});
 await editor.exportFile();draw=canvases.at(-1).draw;
 assert.ok(draw[1]>=0&&draw[2]>=0);assert.ok(draw[1]+draw[3]<=1000.001);assert.ok(draw[2]+draw[4]<=1500.001);
 editor.clear();await assert.rejects(()=>editor.exportFile());
});

test('catalogue and offline shell reference existing public assets only',()=>{
 const scenes=JSON.parse(fs.readFileSync('scenes.json','utf8')).scenes;
 assert.equal(new Set(scenes.map(s=>s.image)).size,scenes.length);
 scenes.forEach(s=>assert.ok(fs.existsSync(s.image),s.image));
 const shell=fs.readFileSync('sw.js','utf8').match(/const SHELL=\[([\s\S]*?)\];/)[1].match(/"[^"]+"/g).map(s=>JSON.parse(s));
 shell.forEach(path=>assert.ok(path==='/'||fs.existsSync('.'+path),path));
 assert.ok(!shell.some(path=>/picgift-uploads|picgift-generated|token|signed/i.test(path)));
});
