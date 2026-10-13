const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
const html=read('index.html'),js=read('app.js');

test('photo selection keeps gallery and camera separate without a Drive entry point',()=>{
 const gallery=html.match(/<input\b[^>]*\bid="photo"[^>]*>/)?.[0];
 const camera=html.match(/<input\b[^>]*\bid="camera-photo"[^>]*>/)?.[0];
 assert.ok(gallery);assert.ok(camera);assert.doesNotMatch(gallery,/\bcapture\b/);assert.match(camera,/capture="environment"/);
 assert.doesNotMatch(html+js,/choose-drive-photo|change-drive-photo|picgift-drive-hint|syncGoogleDriveImport|Elegir desde Google Drive/);
 assert.match(js,/\$\('photo'\)\.addEventListener\('change',e=>acceptFile\(e\.target\.files\[0\]\)\)/);
});

test('removing Drive does not remove Google sign-in or add broad storage permissions',()=>{
 assert.match(html,/id="google"/);assert.match(read('auth.js'),/signInWithIdToken\(\{provider:'google'/);
 assert.doesNotMatch(read('auth.js')+read('google-native.js'),/googleapis\.com\/auth\/drive|drive\.googleapis\.com/);
 assert.doesNotMatch(read('android/app/src/main/AndroidManifest.xml'),/MANAGE_EXTERNAL_STORAGE|READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE/);
});
