const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
const native=read('android/app/src/main/java/com/picgift/myapp/MainActivity.kt');
const html=read('index.html');
const js=read('app.js');
const styles=read('styles.css');

test('Android uses system documents picker to include installed Google Drive providers',()=>{
 assert.match(native,/onShowFileChooser/);
 assert.match(native,/Intent\(Intent\.ACTION_OPEN_DOCUMENT\)/);
 assert.match(native,/Intent\.CATEGORY_OPENABLE/);
 assert.match(native,/Intent\.FLAG_GRANT_READ_URI_PERMISSION/);
 assert.match(native,/filePicker\.launch\(pick\)/);
 assert.doesNotMatch(native,/Intent\(Intent\.ACTION_GET_CONTENT\)/);
 for(const type of ['image/jpeg','image/png','image/webp'])assert.ok(native.includes(type));
});

test('Drive never requests unrestricted Google Drive data or new Android storage permissions',()=>{
 const manifest=read('android/app/src/main/AndroidManifest.xml');
 assert.doesNotMatch(native,/drive\.googleapis\.com|https:\/\/www\.googleapis\.com\/drive/i);
 assert.doesNotMatch(manifest,/MANAGE_EXTERNAL_STORAGE|READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE/);
 assert.match(native,/filePicker\.launch\(pick\)/);
});

test('Drive picker is offered only in the native app and reuses the safe image selection path',()=>{
 for(const id of ['choose-drive-photo','change-drive-photo','picgift-drive-hint'])
  assert.match(html,new RegExp('id="'+id+'"[^>]*hidden'));
 assert.match(js,/const available=!!window\.PicgiftNative/);
 assert.match(js,/window\.addEventListener\('picgift:native-ready',syncGoogleDriveImport\)/);
 assert.match(js,/\$\('choose-drive-photo'\)\.addEventListener\('click',\(\)=>\$\('photo'\)\.click\(\)\)/);
 assert.match(js,/\$\('change-drive-photo'\)\.addEventListener\('click',\(\)=>\$\('photo'\)\.click\(\)\)/);
 assert.match(js,/\$\('photo'\)\.addEventListener\('change',e=>acceptFile\(e\.target\.files\[0\]\)\)/);
 assert.match(styles,/\.picgift-drive-import\[hidden\]/);
});

test('Drive import remains an explicit photo choice and cloud file is private until generation',()=>{
 assert.match(html,/Solo se importará la foto que elijas/);
 assert.match(js,/const service=await window\.picgiftChooseService/);
 assert.match(js,/window\.picgiftPhotoEditor\.exportFile\(\)/);
 assert.match(read('generator.js'),/picgift-uploads/);
});
