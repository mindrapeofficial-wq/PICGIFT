async function waitFor(check){for(let attempt=0;attempt<100&&!check();attempt++)await new Promise(resolve=>setTimeout(resolve,5));assert.ok(check());}
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
function harness(){
 const listeners=new Map(),messages=[];
 const window={PicgiftNative:{postMessage:text=>messages.push(JSON.parse(text))},
  addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
 const context={window,crypto:webcrypto,TextEncoder,Uint8Array,Array,JSON,Error,
  setTimeout:()=>1,clearTimeout(){}};
 vm.createContext(context);
 vm.runInContext(fs.readFileSync('google-native.js','utf8').replace('export async function','async function'),context);
 return {request:context.requestGoogleCredential,messages,listeners};
}
test('1.6.1 receives a correlated request and the hashed nonce; Supabase gets its raw nonce',async()=>{
 const h=harness(),result=h.request(true);await waitFor(()=>h.messages.length>0);
 const message=h.messages[0];assert.equal(message.action,'google-native');assert.equal(message.mode,'auto');
 assert.match(message.request_id,/^[a-f0-9]{64}$/);assert.match(message.nonce,/^[a-f0-9]{64}$/);
 h.listeners.get('picgift:google-credential')({detail:{request_id:'wrong',credential:'wrong'}});
 assert.equal(h.listeners.size,1);
 h.listeners.get('picgift:google-credential')({detail:{request_id:message.request_id,credential:'verified.by.server'}});
 const {token,nonce}=await result;assert.equal(token,'verified.by.server');
 const hashed=Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(nonce))).toString('hex');
 assert.equal(hashed,message.nonce);assert.equal(h.listeners.size,0);
});
test('cancelling Google clears the request so the branded button can retry',async()=>{
 const h=harness(),result=h.request();await waitFor(()=>h.messages.length>0);
 const rejection=assert.rejects(result,/cancelled/);
 h.listeners.get('picgift:google-credential')({detail:{request_id:h.messages[0].request_id,error:'cancelled'}});
 await rejection;const retry=h.request();await waitFor(()=>h.messages.length>0);
 await waitFor(()=>h.messages.length===2);assert.equal(h.messages.length,2);assert.notEqual(h.messages[0].request_id,h.messages[1].request_id);
 h.listeners.get('picgift:google-credential')({detail:{request_id:h.messages[1].request_id,credential:'token'}});await retry;
});
