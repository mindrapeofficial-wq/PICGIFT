/* Native presentation should not leak into the web/PWA or change billing/auth. */
const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const file = name => readFileSync(join(__dirname, '..', name), 'utf8');

test('Android bridge announces native mode without removing Google support', () => {
  const activity = file('android/app/src/main/java/com/picgift/myapp/MainActivity.kt');
  assert.match(activity, /window\.picgiftNativeApp=true/);
  assert.match(activity, /window\.picgiftNativeGoogleSupported=true/);
  assert.match(activity, /"haptic"\s*->/);
  assert.match(activity, /picgiftNativeBack/);
  assert.match(activity, /launchCover/);
  assert.match(activity, /isForMainFrame/);
});

test('Native styling is scoped to host-enabled documents only', () => {
  const html = file('index.html');
  const css = file('native-shell.css');
  const js = file('native-shell.js');
  assert.match(html, /native-shell\.css\?v=/);
  assert.match(html, /native-shell\.js\?v=/);
  assert.match(css, /html\.picgift-native \.mobile-nav/);
  assert.match(js, /window\.picgiftNativeApp === true/);
  assert.match(js, /event\.isTrusted/);
  assert.doesNotMatch(js, /window\.location\.reload/);
  assert.doesNotMatch(js, /\bfetch\(/);
});
