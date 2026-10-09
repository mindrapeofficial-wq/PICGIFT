const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const get = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('private Android gallery receives only owner-scoped metadata on trusted bridge', () => {
  const gallery = get('android/app/src/main/java/com/picgift/myapp/PicgiftNativeGallery.kt');
  const activity = get('android/app/src/main/java/com/picgift/myapp/MainActivity.kt');
  const bridge = get('native-shell.js');
  const shell = get('app-shell.js');
  assert.match(activity, /"gallery-sync" ->/);
  assert.match(activity, /sourceOrigin\.toString\(\)\.trimEnd/);
  assert.match(activity, /isMainFrame/);
  assert.match(activity, /currentAccount == owner/);
  assert.match(activity, /galleryOwner == currentAccount/);
  assert.match(activity, /clearNativeGallery\(\)/);
  assert.match(gallery, /picgift-generated/);
  assert.match(gallery, /CachePolicy\.DISABLED/);
  assert.match(gallery, /LazyVerticalGrid/);
  assert.match(gallery, /UUID\.fromString/);
  assert.match(bridge, /gallery-clear/);
  assert.match(shell, /window\.picgiftNativeGallerySnapshot/);
  assert.doesNotMatch(bridge, /access_token|refresh_token|service_role/);
  assert.doesNotMatch(gallery, /sharedpreferences|SharedPreferences|FileOutputStream/);
});

test('native crop editor is local and uses scoped storage', () => {
  const crop = get('android/app/src/main/java/com/picgift/myapp/PicgiftNativeCrop.kt');
  const manifest = get('android/app/src/main/AndroidManifest.xml');
  const paths = get('android/app/src/main/res/xml/picgift_file_paths.xml');
  const app = get('android/app/build.gradle.kts');
  const activity = get('android/app/src/main/java/com/picgift/myapp/MainActivity.kt');
  assert.match(crop, /detectTransformGestures/);
  assert.match(crop, /ExifInterface/);
  assert.match(crop, /Bitmap\.createBitmap/);
  assert.match(crop, /FileProvider\.getUriForFile/);
  assert.match(crop, /cacheDir/);
  assert.match(crop, /15L \* 1024 \* 1024/);
  assert.match(manifest, /android:exported="false"/);
  assert.match(manifest, /android:grantUriPermissions="true"/);
  assert.match(paths, /cache-path/);
  assert.match(paths, /picgift-prepared/);
  assert.match(activity, /photoPicker\.launch/);
  assert.match(activity, /pendingFileUpload/);
  assert.match(activity, /finishNativeCrop/);
  assert.match(app, /versionCode = 10/);
  assert.doesNotMatch(manifest, /READ_EXTERNAL_STORAGE/);
  assert.doesNotMatch(crop, /\bfetch\(|HttpURLConnection|https:\/\//);
});

test('gallery remains behind account authentication and existing generation consent', () => {
  const shell = get('app-shell.js');
  const app = get('app.js');
  const generator = get('generator.js');
  assert.match(shell, /if\(!user\?\.id\)return/);
  assert.match(shell, /"favorite"|'favorite'/);
  assert.match(shell, /picgift:gallery-clear/);
  assert.match(generator, /picgift:gallery-refresh/);
  assert.match(app, /photo-ai-consent/);
  assert.match(app, /if\(!user\)\{openAuth\('login'\)/);
});
