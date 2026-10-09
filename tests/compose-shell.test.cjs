const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const get = p => readFileSync(join(root, p), 'utf8');

test('Compose compiler plugin matches Kotlin version', () => {
  const gradle = get('android/build.gradle.kts');
  const app = get('android/app/build.gradle.kts');
  assert.match(gradle, /id\("org\.jetbrains\.kotlin\.plugin\.compose"\) version "2\.0\.21"/);
  assert.match(app, /id\("org\.jetbrains\.kotlin\.plugin\.compose"\)/);
  assert.match(app, /compose = true/);
  assert.match(app, /versionCode = 8/);
  assert.match(app, /androidx\.compose\.material3:material3/);
});

test('Native destinations mirror the authenticated SPA router without reloading', () => {
  const chrome = get('android/app/src/main/java/com/picgift/myapp/PicgiftNativeChrome.kt');
  const activity = get('android/app/src/main/java/com/picgift/myapp/MainActivity.kt');
  const bridge = get('native-shell.js');
  const css = get('native-shell.css');
  assert.match(chrome, /fun PicgiftNativeTabs/);
  assert.match(chrome, /fun PicgiftNativeHeader/);
  for (const page of ['crear', 'mis-fotos', 'escenarios', 'cuenta']) {
    assert.ok(chrome.includes('"' + page + '"'));
    assert.ok(bridge.includes("'" + page + "'"));
  }
  assert.match(activity, /"route" ->/);
  assert.match(activity, /"picgift:route"/);
  assert.match(activity, /PicgiftChrome\.pageRoutes/);
  assert.match(activity, /nativeTrustedPage/);
  assert.match(activity, /WindowInsetsCompat\.Type\.ime/);
  assert.match(bridge, /picgift:navigated/);
  assert.match(css, /\.picgift-compose-shell \.mobile-nav/);
  assert.doesNotMatch(activity, /addJavascriptInterface/);
});

test('Android system photo picker preserves WebView file chooser callback', () => {
  const activity = get('android/app/src/main/java/com/picgift/myapp/MainActivity.kt');
  assert.match(activity, /ActivityResultContracts\.PickVisualMedia/);
  assert.match(activity, /pendingFileUpload\?\.onReceiveValue/);
  assert.match(activity, /image\/jpeg/);
  assert.match(activity, /image\/png/);
  assert.match(activity, /image\/webp/);
  assert.doesNotMatch(activity, /READ_EXTERNAL_STORAGE/);
});
