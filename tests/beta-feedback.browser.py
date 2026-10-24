"""Focused real-browser regression tests. All auth/network services are mocked.
The live SQL/RLS tests are independent; this does not certify a Play Store login.
Run: python tests/beta-feedback.browser.py
"""
import base64
import json
import os
import re
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)
    def log_message(self, *_args):
        pass

MOCK = """
export function createClient(){return {
 auth:{getSession:async()=>({data:{session:window.__user?{user:window.__user}:null}}),
 getUser:async()=>({data:{user:window.__user}}),
 onAuthStateChange:cb=>{window.__authListeners.push(cb);return {data:{subscription:{unsubscribe(){}}}}},
 signInWithOAuth:async options=>{window.__calls.oauth.push(options);return {data:{url:'https://uimrvgrpenccijumyiek.supabase.co/auth/v1/authorize?provider=google'}}},
 signInWithIdToken:async()=>({data:{user:window.__user}}),
 signOut:async()=>({error:null}),updateUser:async()=>({data:{user:window.__user}}),
 resetPasswordForEmail:async()=>({error:null}),signInWithPassword:async()=>({data:{user:window.__user}})},
 from:table=>({insert:async row=>{window.__calls.feedback.push({table,row});if(window.__feedbackDelay)await new Promise(r=>setTimeout(r,window.__feedbackDelay));return {error:window.__feedbackError}},
 select:()=>({order:()=>({limit:async()=>{const id=window.__user?.id;window.__calls.news++;await new Promise(r=>setTimeout(r,window.__newsDelay));if(window.__newsError)return {data:null,error:{message:'fixture error'}};return {data:[{title:'News for '+id,body:'Fixture',route:'crear',published_at:'2026-10-24T10:00:00Z'}]}}})})})
};}
"""
CONFIG = "export const SUPABASE_URL='https://uimrvgrpenccijumyiek.supabase.co'; export const SUPABASE_PUBLISHABLE_KEY='sb_publishable_fixture_not_a_real_key';"
NATIVE = "export async function requestGoogleCredential(){throw new Error('cancelled');}"
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=')
results=[]
skipped=[]
in_memory=os.environ.get('PICGIFT_TEST_IN_MEMORY')=='1'
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'

def passed(name):
    results.append(name)
    print('PASS',name,flush=True)

try:
 with sync_playwright() as p:
    exe=os.environ.get('CHROMIUM_EXECUTABLE')
    options={'headless':True}
    if exe: options['executable_path']=exe
    browser=p.chromium.launch(**options)
    context=browser.new_context(viewport={'width':390,'height':844})
    context.route('**/vendor/supabase.js',lambda r:r.fulfill(content_type='text/javascript',body=MOCK))
    context.route('**/config.js',lambda r:r.fulfill(content_type='text/javascript',body=CONFIG))
    context.route('**/google-native.js',lambda r:r.fulfill(content_type='text/javascript',body=NATIVE))
    context.route('https://uimrvgrpenccijumyiek.supabase.co/**',lambda r:r.fulfill(content_type='image/png',body=PNG))
    page=context.new_page();page.set_default_timeout(3000);errors=[]
    page.on('pageerror',lambda e:(errors.append(str(e)),print('BROWSER ERROR',str(e),flush=True)))
    def load(native=False):
        if in_memory:
            # Restricted local browsers can run the logic fixture without HTTP navigation.
            # CI must leave this unset so that real module loading is checked too.
            page.goto('about:blank')
            fixture=(ROOT/'tests/beta-feedback.fixture.html').read_text()
            fixture=re.sub(r'<script[^>]*src="[^\"]+"[^>]*></script>','',fixture)
            page.set_content(fixture)
            if native:
                page.evaluate("window.PicgiftNative={postMessage:s=>window.__calls.native.push(JSON.parse(s))}")
            page.add_script_tag(content=MOCK.replace('export function createClient()', 'window.__createClient=function()'))
            prefix="const createClient=window.__createClient;"+CONFIG.replace('export ','')+NATIVE.replace('export ','')
            for filename in ['auth.js','announcements.js']:
                source=(ROOT/filename).read_text()
                source=re.sub(r'^import .*?;\n','',source,flags=re.M)
                page.add_script_tag(type='module',content=prefix+source)
            source=(ROOT/'experience.js').read_text().replace("import('./beta-feedback.js')",'Promise.resolve()')
            page.add_script_tag(content=source)
            page.add_script_tag(type='module',content=(ROOT/'beta-feedback.js').read_text())
        else:
            page.goto(base+'/tests/beta-feedback.fixture.html'+('?native' if native else ''))
        page.evaluate("""bytes => {const raw=atob(bytes);const data=Uint8Array.from(raw,c=>c.charCodeAt(0));window.fetch=async()=>new Response(data,{status:200,headers:{'content-type':'image/png'}})}""",base64.b64encode(PNG).decode())
        page.wait_for_selector('[data-beta-feedback]')
        page.wait_for_function('typeof window.picgiftSendFeedback === "function" && window.__calls.news === 1')
        page.wait_for_timeout(60)
    def open_feedback():
        page.locator('[data-beta-feedback]').click()
        page.wait_for_selector('.beta-dialog[open]')
    def seed_gallery():
        page.evaluate("window.picgiftGallery=[{job:{id:'portrait-1',status:'completed',user_id:window.__user.id},href:'https://uimrvgrpenccijumyiek.supabase.co/storage/v1/object/sign/picgift-generated/'+window.__user.id+'/portrait.png?token=fixture'}]")
    load(True)
    assert page.locator('#google').is_visible()
    page.evaluate("document.getElementById('auth').classList.add('show')")
    assert page.locator('#google').is_visible()
    passed('Google remains visible before the native capability handshake')
    field=page.locator('#auth-password');field.fill('test-password')
    eye=page.locator('[aria-controls="auth-password"]');eye.click()
    assert field.get_attribute('type')=='text' and eye.get_attribute('aria-pressed')=='true'
    assert field.input_value()=='test-password'
    eye.click();assert field.get_attribute('type')=='password'
    assert page.locator('[aria-controls="auth-password-confirm"]').count()==1
    passed('Independent accessible password toggles preserve the value and never submit')
    eye.click();page.evaluate("document.getElementById('auth').classList.remove('show')")
    page.wait_for_function("document.getElementById('auth-password').type === 'password'")
    page.evaluate("window.picgiftOpenAuth('backup')")
    assert not page.locator('#google-browser-fallback').is_visible()
    page.evaluate("window.picgiftOpenAuth('login')")
    page.locator('#google-browser-fallback').click()
    page.wait_for_function('window.__calls.oauth.length === 1')
    payload=page.evaluate('window.__calls.native.find(x=>x.action==="google-auth")')
    assert len(payload['state'])==64
    opts=page.evaluate('window.__calls.oauth[0].options')
    assert opts['skipBrowserRedirect'] and opts['redirectTo']==page.evaluate("location.origin+'/'")
    passed('Explicit Google browser fallback uses the existing native PKCE/state bridge')
    page.evaluate("window.picgiftOpenAuth('register')")
    page.locator('#google-browser-fallback').click()
    assert page.evaluate('window.__calls.oauth.length')==1
    passed('Google browser fallback does not bypass registration consent')
    page.evaluate("window.picgiftOpenAuth('login');document.documentElement.lang='en'")
    page.wait_for_function("document.querySelector('[aria-controls=\"auth-password\"]').getAttribute('aria-label') === 'Show password'")
    assert page.locator('#google-browser-fallback').inner_text()=='Use Google in the browser'
    assert page.locator('[data-beta-feedback]').inner_text()=='Help and feedback'
    passed('Password and support accessibility labels follow the selected language')
    load()
    open_feedback()
    page.locator('textarea[name="message"]').fill('La creación se detiene en este paso.')
    page.locator('.beta-dialog button[type="submit"]').click()
    page.wait_for_function('window.__calls.feedback.length === 1')
    assert 'Comentario recibido' in page.locator('.beta-dialog').inner_text()
    row=page.evaluate('window.__calls.feedback[0]')
    assert row['table']=='picgift_app_feedback' and set(row['row'])=={'category','message','locale'}
    passed('Feedback sends only category/message/locale and confirms a successful insert')
    page.evaluate("window.__feedbackError={code:'P0001'}")
    page.locator('textarea[name="message"]').fill('Otro comentario que debe conservarse.')
    page.locator('.beta-dialog button[type="submit"]').click()
    page.wait_for_function('window.__calls.feedback.length === 2')
    assert page.locator('textarea[name="message"]').input_value()=='Otro comentario que debe conservarse.'
    assert 'Espera unos minutos' in page.locator('.beta-dialog').inner_text()
    passed('Failed or rate-limited feedback preserves the draft and never reports success')
    page.evaluate('window.__setUser(null)');assert page.locator('.beta-dialog').count()==0
    open_feedback();page.locator('textarea[name="message"]').fill('No puedo entrar con mi cuenta.')
    page.locator('.beta-dialog button[type="submit"]').click()
    page.wait_for_timeout(60)
    assert 'Inicia sesión' in page.locator('.beta-dialog').inner_text()
    assert page.locator('a[href="mailto:mindrapeofficial@gmail.com"]').is_visible()
    passed('Signed-out feedback offers email without pretending to send an in-app report')
    load();open_feedback();page.get_by_role('button',name='Volver a ver el tutorial',exact=True).click()
    assert page.evaluate('window.__calls.tutorial')==1
    passed('Help can invoke the existing tutorial again')
    load();before=page.evaluate('window.__calls.news')
    page.evaluate("for(let n=0;n<10;n++){window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));}")
    page.wait_for_timeout(120);assert page.evaluate('window.__calls.news')==before
    open_feedback();page.get_by_role('button',name='Novedades de PicGift',exact=True).click()
    page.wait_for_selector('.picgift-news-panel:not([hidden])')
    passed('News polling deduplicates focus events and help opens the existing news panel')
    page.evaluate("window.__setUser({id:'22222222-2222-4222-8222-222222222222',email:'other@example.invalid'})")
    page.wait_for_function('window.__calls.news === 2')
    page.wait_for_timeout(60)
    assert '11111111' not in page.locator('.picgift-news-list').inner_text()
    passed('News content and read state reset across account changes')
    load();seed_gallery()
    page.evaluate("Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{window.__calls.shares.push({hasUrl:'url' in data,files:data.files.map(f=>({type:f.type,size:f.size}))})}})")
    page.locator('[data-share-job]').click()
    page.get_by_role('button',name='Compartir foto',exact=True).wait_for()
    assert page.evaluate('window.__calls.shares.length')==0
    page.get_by_role('button',name='Compartir foto',exact=True).click()
    page.wait_for_function('window.__calls.shares.length === 1')
    data=page.evaluate('window.__calls.shares[0]')
    assert not data['hasUrl'] and data['files'][0]['type']=='image/png' and data['files'][0]['size']>0
    passed('Sharing requires a second explicit tap and sends a file, never a signed URL')
    load();seed_gallery()
    page.evaluate("Object.defineProperty(navigator,'share',{configurable:true,value:undefined})")
    page.locator('[data-share-job]').click()
    page.get_by_role('button',name='Descargar para compartir desde Galería',exact=True).click()
    assert page.evaluate('window.__calls.downloads')==1
    passed('WebView without file sharing reuses the authenticated download flow')
    load();seed_gallery()
    page.evaluate("window.picgiftGallery[0].href='https://example.invalid/private.png?token=secret'")
    page.locator('[data-share-job]').click()
    assert page.locator('.beta-dialog').count()==0
    page.evaluate("window.picgiftGallery[0].href='https://uimrvgrpenccijumyiek.supabase.co/storage/v1/object/sign/picgift-generated/22222222-2222-4222-8222-222222222222/portrait.png?token=fixture'")
    page.locator('[data-share-job]').click()
    assert page.locator('.beta-dialog').count()==0
    passed('Untrusted and cross-owner portrait URLs are rejected before fetching')
    load();open_feedback()
    page.evaluate('window.__feedbackDelay=150')
    page.locator('textarea[name="message"]').fill('Comentario de prueba para doble envío.')
    page.evaluate("const form=document.querySelector('.beta-dialog form');form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));")
    page.wait_for_timeout(220)
    assert page.evaluate('window.__calls.feedback.length')==1
    passed('Concurrent form submissions cannot send duplicate feedback')
    load();open_feedback()
    page.evaluate("window.__feedbackDelay=150")
    page.locator('textarea[name="message"]').fill('Este comentario pertenece a la primera cuenta.')
    page.locator('.beta-dialog button[type="submit"]').click()
    page.evaluate("window.__setUser({id:'22222222-2222-4222-8222-222222222222',email:'other@example.invalid'})")
    open_feedback();page.locator('textarea[name="message"]').fill('Borrador nuevo que no debe borrarse.')
    page.wait_for_timeout(220)
    assert page.locator('textarea[name="message"]').input_value()=='Borrador nuevo que no debe borrarse.'
    assert 'Comentario recibido' not in page.locator('.beta-dialog').inner_text()
    passed('A late response from the previous account cannot clear or confirm a new draft')
    load()
    page.evaluate("window.__newsError=true;window.__setUser({id:'33333333-3333-4333-8333-333333333333',email:'fixture3@example.invalid'})")
    page.wait_for_function('window.__calls.news === 2')
    page.wait_for_timeout(70)
    page.locator('.picgift-news-button').click()
    page.get_by_role('button',name='Reintentar',exact=True).wait_for()
    before=page.evaluate('window.__calls.news')
    page.evaluate('window.__newsError=false;window.__newsDelay=120')
    page.evaluate("const retry=[...document.querySelectorAll('.picgift-news-panel button')].find(b=>b.textContent==='Reintentar');retry.click();retry.click();")
    page.wait_for_timeout(200)
    assert page.evaluate('window.__calls.news')==before+1
    assert '33333333' in page.locator('.picgift-news-list').inner_text()
    assert page.get_by_role('button',name='Reintentar',exact=True).count()==0
    passed('Explicit news retry bypasses throttling once and deduplicates double clicks')
    page.evaluate("document.documentElement.lang='en'")
    page.wait_for_function("document.querySelector('.picgift-news-heading strong').textContent === 'PICGIFT news'")
    assert page.locator('.picgift-news-close').get_attribute('aria-label')=='Close notifications'
    assert 'Open in PICGIFT' in page.locator('.picgift-news-list').inner_text()
    passed('News controls switch language without changing the published announcement text')
    load()
    page.evaluate("window.__newsDelay=180;window.__setUser({id:'44444444-4444-4444-8444-444444444444',email:'fixture4@example.invalid'})")
    page.wait_for_function('window.__calls.news === 2')
    page.evaluate("window.__newsDelay=0;window.__setUser({id:'55555555-5555-4555-8555-555555555555',email:'fixture5@example.invalid'})")
    page.wait_for_function('window.__calls.news === 3')
    page.wait_for_timeout(250)
    assert '55555555' in page.locator('.picgift-news-list').inner_text()
    assert '44444444' not in page.locator('.picgift-news-list').inner_text()
    passed('Out-of-order news responses cannot show content from an earlier account')
    load()
    if in_memory:
        skipped.append('Real HTTP module loading and dynamic import (in-memory mode explicitly enabled)')
    else:
        loaded=page.evaluate("performance.getEntriesByType('resource').map(r=>new URL(r.name).pathname)")
        assert '/experience.js' in loaded and '/beta-feedback.js' in loaded and '/auth.js' in loaded
        passed('The browser loads real script URLs and the production dynamic import')
    for width in [320,390,768]:
        load();page.set_viewport_size({'width':width,'height':844});open_feedback()
        bounds=page.locator('.beta-dialog').bounding_box()
        assert bounds['x']>=0 and bounds['x']+bounds['width']<=width+1
    passed('New support dialog fits 320, 390 and 768 pixel viewports')
    assert not errors,errors
    passed('No uncaught browser errors in the regression fixture')
    browser.close()
finally:
 server.shutdown()
print(json.dumps({'passed':len(results),'tests':results,'skipped':skipped,'mode':'in-memory' if in_memory else 'http-modules'},ensure_ascii=False,indent=2))
