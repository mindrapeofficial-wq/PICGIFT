import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
const errors=[];
page.on('pageerror',err=>errors.push(err.message));
await page.route(/https:\/\/(esm\.sh|.*\.supabase\.co|api\.openai\.com)\//,route=>route.abort());
try{
 await page.goto('http://127.0.0.1:8099/',{waitUntil:'load',timeout:45000});
 await page.waitForSelector('#picgift-studio:visible',{timeout:12000});
 await page.waitForSelector('#mobile-scenes button',{timeout:12000});
 await page.waitForTimeout(750);
 assert.equal(await page.locator('.mobile-nav button').count(),6);
 assert.ok(await page.locator('.mobile-app-hero').isVisible());
 assert.ok(await page.locator('#generate').isVisible());
 assert.ok(await page.locator('#mobile-scenes button').count()>=3);
 assert.ok(await page.locator('html').getAttribute('data-campaign')==='halloween');
 // The three-step introduction must line up with the studio at mobile and desktop sizes.
 for(const width of [320,390,768,1331]){
   await page.setViewportSize({width,height:844});
   const layout=await page.evaluate(()=>{
     const section=document.querySelector('#picgift-studio .welcome-story');
     const studio=document.querySelector('#picgift-studio .studio-layout');
     const heading=section.querySelector('h2');
     const frames=[...section.querySelectorAll('.welcome-art__frame')].map(e=>e.getBoundingClientRect().toJSON());
     const images=[...section.querySelectorAll('.welcome-art__image')];
     const storyRect=section.getBoundingClientRect();
     const studioRect=studio.getBoundingClientRect();
     const h=heading.getBoundingClientRect();
     const center=document.elementFromPoint(h.left+h.width/2,h.top+h.height/2);
     return {visible:!!storyRect.height,width:storyRect.width,studioWidth:studioRect.width,
       frames,unobscured:center===heading||heading.contains(center),
       color:getComputedStyle(heading).color,imagesLoaded:images.every(i=>i.complete&&i.naturalWidth>0),
       overflows:document.documentElement.scrollWidth>innerWidth};
   });
   assert.ok(layout.visible,'Welcome hidden at '+width);
   assert.equal(layout.frames.length,3);
   assert.ok(Math.abs(layout.width-layout.studioWidth)<=3,'Welcome and editor widths differ at '+width+': '+JSON.stringify(layout));
   assert.ok(Math.max(...layout.frames.map(r=>r.width))-Math.min(...layout.frames.map(r=>r.width))<=2,'Uneven cards at '+width);
   assert.ok(Math.max(...layout.frames.map(r=>r.height))-Math.min(...layout.frames.map(r=>r.height))<=2,'Uneven image frames at '+width);
   assert.ok(layout.unobscured,'Heading blocked by another layer at '+width);
   assert.equal(layout.color,'rgb(255, 240, 220)','Heading text contrast at '+width);
   assert.equal(layout.imagesLoaded,true,'Missing step illustration at '+width);
   assert.equal(layout.overflows,false,'Horizontal page overflow at '+width);
 }
 await page.setViewportSize({width:390,height:844});
 const before=await page.locator('.mobile-scene-option.is-selected').count();
 assert.equal(before,1);
 await page.locator('.mobile-scene-option').nth(1).click();
 assert.equal(await page.locator('.mobile-scene-option.is-selected').count(),1);
 assert.equal(await page.locator('.mobile-scene-option').nth(1).getAttribute('aria-pressed'),'true');
 fs.mkdirSync('artifacts',{recursive:true});
 await page.screenshot({path:'artifacts/picgift-mobile-halloween.png',fullPage:true});
 const chooserPromise=page.waitForEvent('filechooser',{timeout:8000});
 await page.locator('#choose-photo').click();
 let chooser;
 try { chooser=await chooserPromise; }
 catch (error) {
   console.error('PICGIFT_PICKER_DIAGNOSTIC',JSON.stringify(await page.evaluate(()=>{
     const photo=document.getElementById('photo'),button=document.getElementById('choose-photo'),generate=document.getElementById('generate');
     return {ready:document.readyState,button:button?.outerHTML,buttonVisible:button?.getBoundingClientRect().width,
       input:photo?.outerHTML,inputDisabled:photo?.disabled,inputVisible:photo?.getBoundingClientRect().width,
       generatedDisabled:generate?.disabled,hasNative:!!window.PicgiftNative,stage:document.querySelector('#upload-empty')?.className};
   })), 'JS_ERRORS',errors);
   throw error;
 }

 const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==','base64');
 await chooser.setFiles({name:'picgift-test.png',mimeType:'image/png',buffer:pixel});
 await page.waitForSelector('#upload-loaded:not(.hidden)',{timeout:10000});
 assert.equal(await page.locator('#upload-empty').isVisible(),false);
 // Inspiration-only concepts cannot be generated. Choose an actual published set.
 await page.locator('.mobile-scene-option[data-select="halloween-pumpkin-bench"]').click();
 await page.locator('#generate').click();
 await page.waitForSelector('#auth.show',{timeout:8000});
 await page.locator('#close').click();
 await page.locator('.mobile-nav button[data-route="escenarios"]').click();
 await page.waitForSelector('[data-page="escenarios"]:visible',{timeout:8000});
 assert.ok(await page.locator('.mobile-nav button[data-route="escenarios"]').getAttribute('class')==='active');
 await page.locator('.mobile-nav button[data-route="crear"]').click();
 await page.waitForSelector('#picgift-studio:visible',{timeout:8000});
 assert.equal(errors.filter(e=>!e.includes('Failed to fetch')).length,0,errors.join('; ').slice(0,350));
 console.log('PASS: mobile creator, 6 nav actions, aligned three-step welcome, carousel, file picker, preview, login gate, route restore');
 console.log('Screenshot: artifacts/picgift-mobile-halloween.png');
} finally{
 await page.close();
 await browser.close();
}
