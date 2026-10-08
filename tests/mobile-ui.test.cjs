const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const read=(name)=>fs.readFileSync(name,'utf8');
const html=read('index.html'),js=read('app.js'),styles=read('mobile-app.css');

test('creator keeps real, unique DOM controls after Halloween mobile redesign',()=>{
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
 assert.equal(ids.length,new Set(ids).size,'duplicate id in index.html');
 const needed=['picgift-studio','photo','drop-zone','choose-photo','change-photo','remove-photo',
   'crop-canvas','reference-face','reference-body','mobile-scenes','generate','studio-readiness',
   'photo-ai-consent','studio-account','auth','selected-scene-image'];
 for(const id of needed)assert.ok(ids.includes(id),'missing control: '+id);
 assert.ok(html.includes('mobile-app.css?v='),'mobile CSS linked');
 assert.ok(html.includes('class="mobile-app-hero"'),'branded hero present');
 const publicHome=html.split('<section class="page" data-page="inicio"')[1]?.split('<section class="page" data-page="precios"')[0]||'';
 for(const unwanted of ['COLECCIÓN DE TEMPORADA · HALLOWEEN 2026','EL ÁLBUM DE HALLOWEEN','Para familias','Tu galería privada','Magia de temporada','Demostración ilustrativa con un personaje ficticio','Los cobros siguen desactivados. Tus fotografías anteriores'])assert.ok(!publicHome.includes(unwanted),'obsolete homepage text: '+unwanted);
 assert.ok(!html.includes('Tu estudio de recuerdos'),'obsolete sidebar caption removed');
 assert.ok(html.includes('src="./assets/halloween/picgift-logo-hd.png?v=hd-20261008-v1"'),'current official HD PICGIFT logo linked in the site');
 const svg=read('assets/halloween/picgift-logo-oficial.svg');
 assert.ok(svg.startsWith('<svg'),'logo file is valid SVG');
 assert.ok(svg.includes('data:image/avif;base64,'),'logo embeds authorized Halloween artwork');
 assert.ok((svg.split('data:image/avif;base64,')[1]||'').split('"')[0].length > 5000,'embedded image data is intact');
 assert.ok(!/<rect\\s+(?:width="500"|width="720"|width="256")/.test(svg),'no full-bleed background shape');
 assert.ok(!html.includes('Ver demostración'),'no fake demo as primary action');
});

test('mobile shell has four meaningful routes and controls stay interactive',()=>{
 const nav=html.match(/<nav class="mobile-nav"[\s\S]*?<\/nav>/)?.[0]||'';
 const routes=[...nav.matchAll(/data-route="([^"]+)"/g)].map(x=>x[1]);
 assert.deepEqual(routes,['crear','mis-fotos','escenarios','cuenta']);
 assert.ok(js.includes("const mobileEntry=window.matchMedia('(max-width:820px)').matches"));
 assert.ok(js.includes("body.classList.toggle('mobile-creator-active'"));
 assert.ok(js.includes("if(!file){$('photo').click();return}"),'CTA should open photo picker');
 assert.ok(js.includes("if(!user){openAuth('login');return}"),'CTA should require auth before upload');
 assert.ok(js.includes("if(window.picgiftAiReady!==true)"),'backend availability is mandatory');
 assert.ok(js.includes("window.picgiftPhotoEditor.exportFile()"),'client crop is preserved');
 assert.ok(js.includes('renderMobileScenes();updateStudio()'),'scene UI bound to state');
 assert.ok(styles.includes('.mobile-scene-option.is-selected'),'selected scene visible');
 assert.ok(styles.includes('.mobile-nav button.active'),'active tab visible');
});

test('mobile CSS offers scrollable cards, safe-area navigation and no desktop regression',()=>{
 assert.ok(styles.includes('@media(max-width:820px)'));
 assert.ok(styles.includes('scroll-snap-type:x mandatory'));
 assert.ok(styles.includes('env(safe-area-inset-bottom)'));
 assert.ok(styles.includes('html[data-campaign="halloween"] .studio-actionbar'));
 assert.ok(styles.includes('html[data-campaign="halloween"] body.mobile-creator-active .topbar'));
 assert.ok(styles.includes('html[data-campaign="halloween"] .page[data-page="crear"]'));
 new Function(js);
});

test('PWA starts in Create and caches its mobile app assets',()=>{
 const manifest=JSON.parse(read('manifest.webmanifest'));
 assert.equal(manifest.start_url,'/#crear');
 const sw=read('sw.js');
 assert.ok(sw.includes('"/mobile-app.css"'));
 assert.ok(/const VERSION="picgift-[^"]+"/.test(sw),'PWA cache has explicit version');
 assert.ok(sw.includes('picgift-halloween-home-clean-20261008-v13'),'homepage cleanup is cached for installed devices');
 const scenes=JSON.parse(read('scenes.json')).scenes;
 assert.ok(scenes.length>=3);
 assert.ok(scenes.some(x=>x.id==='halloween-pumpkin-bench'));
 for(const scene of scenes)assert.ok(fs.existsSync(scene.image),scene.image);
});
