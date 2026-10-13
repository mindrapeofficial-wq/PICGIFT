const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const android=fs.readFileSync('android/app/src/main/java/com/picgift/myapp/MainActivity.kt','utf8');
const gradle=fs.readFileSync('android/app/build.gradle.kts','utf8');

test('Android boots its installed interface under the existing authenticated origin',()=>{
 assert.match(android,/https:\/\/picgift\.onrender\.com\/app\/index\.html\?device_lang=/);
 assert.match(android,/WebViewAssetLoader\.Builder\(\)\.setDomain\("picgift\.onrender\.com"\)/);
 assert.match(android,/addPathHandler\("\/"\) \{ path -> bundledResponse\(path\) \}/);
 assert.match(android,/assets\.open\("app\/\$relative"\)/);
 assert.match(android,/web\.settings\.allowFileAccess = false/);
 assert.doesNotMatch(android,/allowUniversalAccessFromFileURLs\s*=\s*true|file:\/\//);
});
test('missing or unsafe same-origin assets never fall back to downloading Render files',()=>{
 assert.match(android,/Uri\.decode\(path\)/);
 assert.match(android,/it == "\." \|\| it == "\.\."/);
 assert.match(android,/decoded\.contains\('\\\\'\)/);
 assert.match(android,/decoded\.contains\('\\u0000'\)/);
 assert.match(android,/decoded\.removePrefix\("app\/"\)\.ifEmpty \{ "index\.html" \}/);
 assert.match(android,/404, "Not Found"/);
 assert.match(android,/bundledAssets\.shouldInterceptRequest\(uri\) \?: bundledNotFound\(\)/);
 assert.match(android,/catch \(_: Exception\) \{ bundledNotFound\(\) \}/);
 assert.match(android,/if \(uri\.host != "picgift\.onrender\.com"\) return null/);
});
test('page and service worker network requests share the local-only origin handler',()=>{
 assert.match(android,/SERVICE_WORKER_BASIC_USAGE/);
 assert.match(android,/SERVICE_WORKER_SHOULD_INTERCEPT_REQUEST/);
 assert.match(android,/setServiceWorkerClient\(object : ServiceWorkerClientCompat/);
 assert.match(android,/interceptBundledRequest\(request\.url\)/);
 assert.match(android,/request\?\.url\?\.let \{ interceptBundledRequest\(it\) \}/);
 assert.match(android,/DOCUMENT_START_SCRIPT/);
 assert.match(android,/addDocumentStartJavaScript\(web, "window\.picgiftBundledApp=true;/);
});
test('Android packages only the public interface and writes an inspectable asset manifest',()=>{
 assert.match(gradle,/tasks\.registering\(Sync::class\)/);
 assert.match(gradle,/include\("\*\.html", "\*\.js", "\*\.css", "scenes\.json", "manifest\.webmanifest"\)/);
 assert.match(gradle,/include\("assets\/\*\*", "locales\/\*\*", "vendor\/\*\*"\)/);
 assert.match(gradle,/assets\.srcDir\(bundledUiRoot\)/);
 assert.match(gradle,/dependsOn\(verifyLauncherIcon, syncBundledUi\)/);
 assert.match(gradle,/bundle-manifest\.json/);
 const includes=[...gradle.matchAll(/include\(([^)]+)\)/g)].map(x=>x[1]).join(' ');
 assert.doesNotMatch(includes,/supabase|private|signing|node_modules|tests|\.env|google-services/);
});
