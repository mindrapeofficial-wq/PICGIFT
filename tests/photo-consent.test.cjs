const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function editorHarness(){
 const elements=new Map(),decodes=[],events=[];
 const element=()=>({value:'',listeners:{},classList:{add(){},remove(){}},
  addEventListener(type,handler){this.listeners[type]=handler},removeAttribute(){},
  getContext:()=>({clearRect(){}})});
 const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)};
 const context={document:{getElementById:get,querySelectorAll:()=>[]},
  window:{dispatchEvent:event=>events.push(event.type)},Event,
  Image:class{decode(){return new Promise(resolve=>decodes.push(resolve))}},
  URL:{createObjectURL:()=> 'blob:local',revokeObjectURL(){}}};
 vm.runInNewContext(fs.readFileSync('photo-editor.js','utf8'),context);
 return {get,decodes,events,editor:context.window.picgiftPhotoEditor};
}

test('changing a personal reference invalidates permission before asynchronous decoding finishes',async()=>{
 const {get,decodes,events,editor}=editorHarness();
 const face={name:'face.jpg',type:'image/jpeg',size:2000};
 const pending=get('reference-face').listeners.change({target:{files:[face]}});
 assert.deepEqual(events,['picgift:photo-changed']);
 assert.equal(editor.references().face,null);
 decodes.shift()();
 await pending;
 assert.equal(editor.references().face,face);
 // Revoke again when the decoded reference replaces the previous one: a user may
 // have checked the box while decoding was in progress.
 assert.equal(events.at(-1),'picgift:photo-changed');
 assert.equal(events.length,2);
 get('reference-face-remove').listeners.click();
 assert.equal(editor.references().face,null);
 assert.equal(events.length,3);
});

test('clearing the photo prevents an in-flight reference from returning with stale permission',async()=>{
 const {get,decodes,events,editor}=editorHarness();
 const pending=get('reference-body').listeners.change({target:{files:[{name:'body.png',type:'image/png',size:3000}]}});
 editor.clear();
 decodes.shift()();
 await pending;
 assert.equal(editor.references().body,null);
 assert.ok(events.length>=2);
 assert.ok(events.every(type=>type==='picgift:photo-changed'));
});

test('cancelled or rejected file selections do not replace references or revoke unchanged permission',async()=>{
 const {get,events,editor}=editorHarness();
 await get('reference-face').listeners.change({target:{files:[]}});
 await get('reference-face').listeners.change({target:{files:[{type:'application/pdf',size:3000}]}});
 assert.equal(events.length,0);
 assert.equal(editor.references().face,null);
});
