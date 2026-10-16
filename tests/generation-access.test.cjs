const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const source=fs.readFileSync('supabase/functions/picgift-generate/index.ts','utf8');
const access=stripTypeScriptTypes(source.slice(source.indexOf('function publicAllowed()'),source.indexOf('const allowedPoses:')));
async function ready(overrides={},verified=true){
 const env={OPENAI_API_KEY:'test-configured',PICGIFT_GENERATION_ENABLED:'true',PICGIFT_PUBLIC_GENERATION_ENABLED:'true',PICGIFT_SALES_ENABLED:'false',...overrides};
 const context={Deno:{env:{get:name=>env[name]}}};
 vm.createContext(context);vm.runInContext(access,context);return context.engineReady({id:'test-customer',email_confirmed_at:verified?'2026-10-16':null});
}
test('a customer can spend existing Google Play credits while new web sales are disabled',async()=>{
 assert.equal(await ready(),true);
});
test('verified accounts can use generation regardless of the old pilot flag',async()=>{
 assert.equal(await ready({PICGIFT_PUBLIC_GENERATION_ENABLED:'false'}),true);
 assert.equal(await ready({PICGIFT_PUBLIC_GENERATION_ENABLED:'false'},false),false);
});
test('the generation kill switch and provider credentials still control processing',async()=>{
 assert.equal(await ready({PICGIFT_GENERATION_ENABLED:'false'},true),false);
 assert.equal(await ready({OPENAI_API_KEY:''},true),false);
});
