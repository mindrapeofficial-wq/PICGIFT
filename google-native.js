// Bridge for the signed 1.6.1 Android app. The request binds the response to
// a fresh nonce; only Supabase may turn the returned ID token into a session.
let pending = null;
const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
export async function requestGoogleCredential(automatic = false) {
 if (pending) throw new Error('busy');
 const raw = hex(crypto.getRandomValues(new Uint8Array(32)));
 const nonce = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))));
 const id = hex(crypto.getRandomValues(new Uint8Array(32)));
 return new Promise((resolve, reject) => {
  const finish = (error, token) => {
   if (pending?.id !== id) return;
   clearTimeout(pending.timer); pending = null;
   window.removeEventListener('picgift:google-credential', receive);
   if (error) reject(new Error(error)); else resolve({token, nonce: raw});
  };
  const receive = event => {
   if (event.detail?.request_id !== id) return;
   const {error, credential} = event.detail;
   finish(error || (typeof credential !== 'string' ? 'credential' : null), credential);
  };
  pending = {id, timer: setTimeout(() => finish('timeout'), 180000)};
  window.addEventListener('picgift:google-credential', receive);
  try {
   window.PicgiftNative.postMessage(JSON.stringify({action:'google-native', request_id:id, nonce, mode:automatic?'auto':'manual'}));
  } catch { finish('unavailable'); }
 });
}
