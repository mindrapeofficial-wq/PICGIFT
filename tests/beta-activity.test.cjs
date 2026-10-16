const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');

const source=fs.readFileSync('supabase/functions/picgift-ai-director/index.ts','utf8');
const code=stripTypeScriptTypes(source.slice(source.indexOf('async function reminderId('),source.indexOf('async function dashboard(')));

test('beta reminder targets only absent opted-in testers and never queues twice in a day',async()=>{
 const now=new Date(),earlier=new Date(now.getTime()-2*86400000).toISOString();
 const users=[
  {id:'absent',email_confirmed_at:earlier,created_at:earlier,last_sign_in_at:earlier,user_metadata:{full_name:'Lucía Test'}},
  {id:'active',email_confirmed_at:earlier,created_at:earlier,last_sign_in_at:now.toISOString(),user_metadata:{}},
  {id:'old-app',email_confirmed_at:earlier,created_at:earlier,last_sign_in_at:earlier,user_metadata:{}},
  {id:'admin',email_confirmed_at:earlier,created_at:earlier,last_sign_in_at:earlier,user_metadata:{}}
 ];
 const queued=[],decisions=[];
 const rows={picgift_user_presence:[{user_id:'absent',last_seen_at:earlier}],picgift_notification_devices:[{user_id:'absent'},{user_id:'active'},{user_id:'old-app'},{user_id:'admin'}],
  picgift_admin_users:[{user_id:'admin'}],picgift_photo_jobs:[]};
 const db={auth:{admin:{listUsers:async()=>({data:{users},error:null})}},from(table){
  return {select(){return this},eq(){return this},gt(){return this},gte(){return this},limit(){return this},
   async insert(value){if(table==='picgift_ai_notifications_outbox')queued.push(value);else if(table==='picgift_beta_reminder_decisions')decisions.push(value);return {error:null}},
   then(resolve){const data=table==='picgift_ai_notifications_outbox'?queued.map(x=>({id:x.id})):rows[table]||[];return Promise.resolve({data,error:null}).then(resolve)}
  };
 }};
 const formatDay=date=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).format(date||new Date());
 const context={db,Date,Error,Map,Set,Number,TextEncoder,crypto:globalThis.crypto,
  formatDay,madridHour:()=>14,betaReminderDecision:async()=>({send:true,reason:'Buen momento'})};
 vm.createContext(context);vm.runInContext(code,context);
 const first=await context.runBetaReminder();
 assert.equal(first.eligible,1);assert.equal(first.queued,1);
 assert.equal(queued.length,1);assert.equal(queued[0].user_id,'absent');
 assert.match(queued[0].body,/Hola, Lucía/);
 const second=await context.runBetaReminder();
 assert.equal(second.queued,0);assert.equal(queued.length,1);
 assert.equal(decisions.length,2);
});
