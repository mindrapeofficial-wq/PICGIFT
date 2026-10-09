const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const script = fs.readFileSync('auth.js', 'utf8');
const match = script.match(/window\.picgiftReceiveGoogleIdToken=async detail=>\{[\s\S]*?\n\};/);
assert.ok(match, 'native Google token bridge must exist');

const validToken = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxIn0.signature';
const rawNonce = 'a'.repeat(64);

function harness(behavior) {
  const calls = [];
  const ui = { auth: { classList: { remove: v => calls.push(['hide', v]) } } };
  const window = { PicgiftNative: { postMessage() {} } };
  const client = { auth: { signInWithIdToken: async request => {
    calls.push(['exchange', request]);
    if (behavior === 'failure') return { error: new Error('invalid Google audience') };
    return { data: { user: { id: 'demo-user' } }, error: null };
  } } };
  const context = {
    window, client, $: id => ui[id], publish: user => calls.push(['publish', user]),
    openAuth: () => calls.push(['openAuth']),
    msg: text => calls.push(['message', text]),
  };
  vm.runInNewContext(match[0], context);
  return { receive: window.picgiftReceiveGoogleIdToken, calls };
}

test('native Google ID token is exchanged with Supabase, including the original nonce', async () => {
  const { receive, calls } = harness();
  await receive({ token: validToken, nonce: rawNonce });
  const exchange = calls.find(v => v[0] === 'exchange');
  assert.equal(exchange[1].provider, 'google');
  assert.equal(exchange[1].token, validToken);
  assert.equal(exchange[1].nonce, rawNonce);
  assert.ok(calls.some(v => v[0] === 'publish' && v[1].id === 'demo-user'));
});

test('malformed token and nonce never reach Supabase', async () => {
  for (const payload of [
    { token: 'not-a-jwt', nonce: rawNonce },
    { token: validToken, nonce: 'bad' },
    { token: validToken, nonce: 'a'.repeat(65) },
    {},
  ]) {
    const { receive, calls } = harness();
    await receive(payload);
    assert.equal(calls.filter(v => v[0] === 'exchange').length, 0);
    assert.ok(calls.some(v => v[0] === 'openAuth'));
  }
});

test('server rejection never publishes an authenticated account', async () => {
  const { receive, calls } = harness('failure');
  await receive({ token: validToken, nonce: rawNonce });
  assert.equal(calls.some(v => v[0] === 'publish'), false);
  assert.ok(calls.some(v => v[0] === 'openAuth'));
});

test('Android bridge declares native and web fallback paths and native builds have a nonce', () => {
  const activity = fs.readFileSync('android/app/src/main/java/com/picgift/myapp/MainActivity.kt','utf8');
  const chooser = fs.readFileSync('android/app/src/main/java/com/picgift/myapp/GoogleCredentialSignIn.kt','utf8');
  assert.match(script, /action:'google-native'/);
  assert.match(script, /skipBrowserRedirect:native/);
  assert.match(activity, /"google-native"/);
  assert.match(activity, /trustedPicgiftPage\(\)/);
  assert.match(chooser, /SecureRandom\(\)/);
  assert.match(chooser, /"SHA-256"/);
  assert.match(chooser, /GetSignInWithGoogleOption/);
  assert.match(chooser, /GetGoogleIdOption/);
});
