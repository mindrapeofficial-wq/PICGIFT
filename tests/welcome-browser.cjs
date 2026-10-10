const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.resolve(process.env.PICGIFT_UI_ARTIFACTS||'artifacts/mobile-welcome');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png'};
const server=http.createServer((req,res)=>{const p=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]||'/'));const file=p===root?path.join(root,'index.html'):p;if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(e,b)=>{if(e){res.writeHead(404).end();return;}res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(b)});});
const mock=`export function createClient(){const user={id:'11111111-1111-1111-1111-111111111111',email:'admin@example.test',user_metadata:{full_name:'Admin',picgift_password_backup:true}};return {auth:{getSession:async()=>({data:{session:{user}}}),getUser:async()=>({data:{user}}),onAuthStateChange(fn){setTimeout(()=>fn('INITIAL_SESSION',{user}),100)},signOut:async()=>({}),updateUser:async()=>({data:{user}})},functions:{invoke:async(name,{body})=>{if(name==='picgift-admin')return {data:body.action==='health'?{admin:window.testAdmin!==false}:{admin:true,users:[],settings:{global_daily_limit:48,default_user_daily_limit:3},premium_settings:{daily_limit:3},global_used:0,utc_day:'2026-10-10'}};if(name==='picgift-ai-director')return {data:{providers:{free_configured:true,premium_configured:true},pending:1,proposals:[{id:'example',kind:'scene',status:'pending',title:'Propuesta de prueba',created_at:new Date().toISOString(),description:'Escenario ficticio para validar la interfaz.',category:'Halloween',preview_url:'/assets/halloween/reference/moon-castle.webp'}],outbox:[]}};if(name==='picgift-notifications')return {data:{configured:true,devices:0,history:[]}};return {data:{}}}},from(){return {select(){return this},eq(){return this},order(){return this},limit(){return this},maybeSingle:async()=>({data:null}),then(resolve){return Promise.resolve({data:[]}).then(resolve)}}}}}`;
(async()=>{fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(8133,'127.0.0.1',r));const executablePath=process.env.PICGIFT_BROWSER_EXECUTABLE||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined);const browser=await chromium.launch({headless:true,executablePath});const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'es-ES'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route(/^https?:\/\/(?!127\.0\.0\.1)/,r=>r.request().url().startsWith('https://esm.sh/@supabase/supabase-js@')?r.fulfill({contentType:'text/javascript',body:mock}):r.abort());
await page.addInitScript(()=>{localStorage.setItem('picgift.language','es');window.nativeRequests=[];window.PicgiftNative={postMessage:message=>window.nativeRequests.push(JSON.parse(message))};window.picgiftNativeGoogleSupported=true});
await page.goto('http://127.0.0.1:8133/#crear');await page.waitForSelector('#first-steps[open]');await page.waitForFunction(()=>[...document.querySelectorAll('#first-steps img')].length===3&&[...document.querySelectorAll('#first-steps img')].every(i=>i.complete&&i.naturalWidth>0));await page.screenshot({path:path.join(out,'01-primeros-pasos.png')});assert.equal((await page.evaluate(()=>window.nativeRequests)).filter(x=>x.action==='notifications-enable').length,0);
await page.getByRole('button',{name:'Empezar mi foto',exact:true}).click();await page.waitForFunction(()=>window.nativeRequests.some(x=>x.action==='notifications-enable'));await page.waitForTimeout(1600);assert.equal((await page.evaluate(()=>window.nativeRequests)).filter(x=>x.action==='notifications-enable').length,1);assert.equal(await page.locator('#mobile-signin').isVisible(),false);await page.screenshot({path:path.join(out,'02-bienvenida.png')});
// The actual app must not submit the previous account's photo when editing finishes late.
await page.locator('#photo').setInputFiles(path.join(root,'assets/halloween/journey/result.webp'));
await page.waitForSelector('#upload-loaded:not(.hidden)');
await page.locator('.mobile-scene-option[data-select="halloween-pumpkin-bench"]').click();
await page.locator('#photo-ai-consent').check();
await page.evaluate(()=>{
 window.testOriginalExport=window.picgiftPhotoEditor.exportFile;
 window.testOriginalService=window.picgiftChooseService;
 window.testGenerationEvents=0;
 window.addEventListener('picgift:generate',()=>window.testGenerationEvents++);
 window.picgiftPhotoEditor.exportFile=()=>new Promise(resolve=>window.testResolveExport=resolve);
 window.picgiftChooseService=async()=> 'free';
 window.picgiftFreeReady=true;window.picgiftAiReady=true;window.picgiftStudioUpdate();
});
await page.locator('#generate').click();await page.waitForFunction(()=>!!window.testResolveExport);
await page.evaluate(()=>{
 window.dispatchEvent(new CustomEvent('picgift:auth',{detail:{user:{id:'22222222-2222-2222-2222-222222222222',email:'other@example.test'}}}));
 window.testResolveExport(new File(['test'],'old-photo.png',{type:'image/png'}));
});
await page.waitForFunction(()=>window.picgiftGenerating===false);
assert.equal(await page.evaluate(()=>window.testGenerationEvents),0);
assert.equal(await page.locator('#upload-loaded').isVisible(),false);
assert.equal(await page.locator('#chosen-photo').getAttribute('src'),null);
await page.evaluate(()=>{window.picgiftPhotoEditor.exportFile=window.testOriginalExport;window.picgiftChooseService=window.testOriginalService});
// A fresh account receives its own onboarding; finish it before testing page scrolling.
if(await page.locator('#first-steps').evaluate(e=>e.open))await page.getByRole('button',{name:'Empezar mi foto',exact:true}).click();
for(const width of [320,390,768]){
 await page.setViewportSize({width,height:640});
 await page.locator('body').press('Control+End');await page.waitForTimeout(300);
 const layout=await page.evaluate(()=>{const scenes=document.querySelector('.mobile-scene-grid').getBoundingClientRect(),nav=document.querySelector('.mobile-nav').getBoundingClientRect();return {sceneBottom:scenes.bottom,navTop:nav.top,overflow:document.documentElement.scrollWidth>innerWidth,padding:parseFloat(getComputedStyle(document.querySelector('.page[data-page="crear"]')).paddingBottom)}});
 assert.ok(layout.sceneBottom<=layout.navTop,'Scenarios covered by navigation at '+width+': '+JSON.stringify(layout));assert.ok(layout.padding>=112);assert.equal(layout.overflow,false);
}
await page.setViewportSize({width:390,height:844});await page.locator('body').press('Control+Home');
await page.reload();await page.waitForTimeout(900);assert.equal(await page.locator('#first-steps').evaluate(e=>e.open),false);assert.equal((await page.evaluate(()=>window.nativeRequests)).filter(x=>x.action==='notifications-enable').length,0);
await page.evaluate(()=>window.dispatchEvent(new CustomEvent('picgift:native-push',{detail:{status:'permission_denied'}})));await page.reload();await page.waitForTimeout(900);assert.equal((await page.evaluate(()=>window.nativeRequests)).filter(x=>x.action==='notifications-enable').length,0);
await page.locator('.mobile-nav [data-route="cuenta"]').click();await page.waitForSelector('#admin-dashboard-link:visible');await page.locator('#admin-dashboard-link').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'03-perfil-admin.png')});await page.locator('#admin-dashboard-link').click();await page.waitForSelector('#dashboard:not([hidden])');await page.waitForSelector('#ai-director-list article');assert.equal(await page.getByRole('heading',{name:'Disponible solo en la web'}).count(),0);await page.locator('#ai-director-section').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'04-admin-movil.png'),fullPage:false});
for(const width of [320,390,768]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Admin overflows at '+width)}
await page.goto('http://127.0.0.1:8133/#crear');await page.setViewportSize({width:390,height:844});await page.waitForTimeout(700);await page.evaluate(()=>window.dispatchEvent(new CustomEvent('picgift:auth',{detail:{user:null}})));await page.waitForSelector('#mobile-signin:visible');assert.ok((await page.locator('#mobile-signin .google-signin').boundingBox()).width<=240);await page.screenshot({path:path.join(out,'05-google-compacto.png')});
// Dynamic sign-in, recovery and backup copy must follow the device/user language.
await page.evaluate(()=>window.picgiftI18n.setPreference('en'));
for(const [mode,title] of [['login','Sign in with a password'],['forgot','Forgot your password?'],['register','Create an account'],['backup','Create a backup password'],['recovery','Change your password']]){
 await page.evaluate(mode=>window.picgiftOpenAuth(mode),mode);
 await page.waitForFunction(title=>document.getElementById('auth-title').textContent===title,title);
 assert.equal(await page.locator('#auth .auth-caption').textContent(),mode==='login'||mode==='register'?'Use the email address of your PICGIFT account.':mode==='forgot'?'We will send you a link to recover access.':mode==='backup'?'You can sign in with your email if Google is unavailable.':'Choose a new password for your account.');
}
await page.locator('#auth-password').fill('sample-password-one');
await page.locator('#auth-password-confirm').fill('sample-password-two');
await page.locator('#auth-submit').click();
assert.equal(await page.locator('#auth-password-confirm').evaluate(e=>e.validationMessage),'The passwords do not match.');
await page.evaluate(()=>window.picgiftOpenAuth('login'));
await page.waitForFunction(()=>document.querySelector('#auth .auth-divider').textContent.includes('email and password sign-in'));
await page.screenshot({path:path.join(out,'06-acceso-ingles.png')});
await page.evaluate(()=>window.picgiftI18n.setPreference('es'));
await page.waitForFunction(()=>document.getElementById('auth-title').textContent==='Entrar con contraseña');
assert.equal(await page.locator('#auth-email').getAttribute('placeholder'),'tu@correo.com');
assert.equal(await page.locator('#google span').textContent(),'Continuar con Google');
await page.locator('#close').click();
await page.addInitScript(()=>window.testAdmin=false);await page.goto('http://127.0.0.1:8133/admin.html');await page.waitForSelector('#blocked-title');await page.waitForFunction(()=>document.getElementById('blocked-title').textContent==='Acceso no autorizado');assert.equal(await page.locator('#dashboard').isVisible(),false);assert.deepEqual(errors,[]);await browser.close();server.close();console.log('Verified: onboarding once, notification consent after onboarding, no reprompt after denial, native admin and responsive 320/390/768px, compact Google, account change clears photo and cancels delayed editor export.');})().catch(e=>{console.error(e);server.close();process.exit(1)});
