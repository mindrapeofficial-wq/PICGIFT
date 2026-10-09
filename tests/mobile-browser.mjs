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
 assert.equal(await page.locator('.mobile-nav button').count(),4);
 assert.ok(await page.locator('.mobile-app-hero').isVisible());
 assert.ok(await page.locator('#generate').isVisible());
 assert.ok(await page.locator('#mobile-scenes button').count()>=3);
 assert.ok(await page.locator('html').getAttribute('data-campaign')==='halloween');
 const before=await page.locator('.mobile-scene-option.is-selected').count();
 assert.equal(before,1);
 await page.locator('.mobile-scene-option').nth(1).click();
 assert.equal(await page.locator('.mobile-scene-option.is-selected').count(),1);
 assert.equal(await page.locator('.mobile-scene-option').nth(1).getAttribute('aria-pressed'),'true');
 fs.mkdirSync('artifacts',{recursive:true});
 await page.screenshot({path:'artifacts/picgift-mobile-halloween.png',fullPage:true});
 // Choose a photo through the visible upload surface, not through the final
 // generate action. This mirrors the normal mobile onboarding path.
 const chooserPromise=page.waitForEvent('filechooser',{timeout:8000});
 await page.locator('#choose-photo').click();
 const chooser=await chooserPromise;
 const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==','base64');
 await chooser.setFiles({name:'picgift-test.png',mimeType:'image/png',buffer:pixel});
 await page.waitForSelector('#upload-loaded:not(.hidden)',{timeout:10000});
 assert.equal(await page.locator('#upload-empty').isVisible(),false);
 await page.locator('#generate').click();
 await page.waitForSelector('#auth.show',{timeout:8000});
 await page.locator('#close').click();
 await page.locator('.mobile-nav button[data-route="escenarios"]').click();
 await page.waitForSelector('[data-page="escenarios"]:visible',{timeout:8000});
 assert.ok(await page.locator('.mobile-nav button[data-route="escenarios"]').getAttribute('class')==='active');
 await page.locator('.mobile-nav button[data-route="crear"]').click();
 await page.waitForSelector('#picgift-studio:visible',{timeout:8000});
 assert.equal(errors.filter(e=>!e.includes('Failed to fetch')).length,0,errors.join('; ').slice(0,350));
 console.log('PASS: mobile creator, 4 nav tabs, carousel, file picker, preview, login gate, route restore');
 console.log('Screenshot: artifacts/picgift-mobile-halloween.png');
} finally{
 await page.close();
 await browser.close();
}
