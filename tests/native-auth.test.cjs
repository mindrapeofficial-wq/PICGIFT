const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('android-login.js','utf8');
const state='a'.repeat(64);
const authorize=()=>new URL('https://uimrvgrpenccijumyiek.supabase.co/auth/v1/authorize?provider=google&redirect_to=https%3A%2F%2Fpicgift.onrender.com%2F&code_challenge_method=s256&code_challenge='+ 'b'.repeat(43));
function run(target,stateValue=state){
 const stored=new Map(),status={textContent:''};let redirect;
 vm.runInNewContext(source,{URL,URLSearchParams,Date,history:{replaceState(){}},location:{search:'?'+new URLSearchParams({authorize:target.href,state:stateValue}),pathname:'/android-login.html',replace(url){redirect=url}},sessionStorage:{setItem(k,v){stored.set(k,v)}},document:{getElementById(){return status}}});
 return {stored,status,redirect};
}
test('browser handoff preserves the request state and forwards a PKCE challenge',()=>{
 const target=authorize(),res=run(target);assert.equal(res.redirect,target.href);
 const stored=JSON.parse(res.stored.get('picgift_android_auth'));assert.equal(stored.state,state);assert.equal(typeof stored.created,'number');assert.deepEqual(Object.keys(stored).sort(),['created','state']);
});
test('browser handoff rejects foreign origins, callback URLs and non-PKCE requests',()=>{
 const attacks=[u=>u.host='attacker.example',u=>u.pathname='/auth/v1/token',u=>u.searchParams.set('redirect_to','https://attacker.example/'),u=>u.searchParams.delete('code_challenge'),u=>u.searchParams.set('code_challenge_method','plain'),u=>u.searchParams.set('provider','github')];
 for(const mutate of attacks){const target=authorize();mutate(target);const res=run(target);assert.equal(res.redirect,undefined);assert.equal(res.stored.size,0);assert.match(res.status.textContent,/no válida/)}
 assert.equal(run(authorize(),'bad-state').redirect,undefined);
});
test('an expired browser handoff cannot return a code to Android',()=>{
 let removed=false;const pending={state,created:Date.now()-600001};
 const context={window:{},URLSearchParams,Date,Number,location:{search:'?code=12345678-1234-1234-1234-123456789012'},sessionStorage:{getItem:()=>JSON.stringify(pending),removeItem(){removed=true}}};
 vm.runInNewContext(fs.readFileSync('native-auth-return.js','utf8'),context);assert.equal(context.window.picgiftNativeReturn,undefined);assert.equal(removed,true);
});
