/* Native Android presentation only. No privileged action is exposed to the browser. */
(() => {
  'use strict';
  const root = document.documentElement;
  const isNative = () => window.picgiftNativeApp === true;
  const enableNative = () => {
    if (!isNative()) return;
    root.classList.add('picgift-native');
    if (window.picgiftNativeComposeShell === true) {
      root.classList.add('picgift-compose-shell');
      sendRoute(document.body?.dataset.appPage || 'crear');
    }
  };
  // Web route changes are mirrored in Compose. The native host accepts only
  // known route names, the trusted app origin and the main frame.
  const allowedRoutes = new Set(['inicio', 'crear', 'mis-fotos', 'escenarios', 'cuenta', 'precios', 'resultado', 'creditos']);
  function sendRoute(name) {
    if (window.picgiftNativeComposeShell !== true || !allowedRoutes.has(name)) return;
    try { window.PicgiftNative?.postMessage(JSON.stringify({action: 'route', name})); }
    catch (_) { /* Native chrome never prevents editing. */ }
  }
  window.addEventListener('picgift:navigated', (event) => sendRoute(event.detail?.name));
  // The web session remains the source of truth. Never forward access tokens,
  // original files, profile metadata, or private storage paths to Android.
  function syncGallery(detail) {
    if (!isNative() || window.picgiftNativeComposeShell !== true ||
        !detail || typeof detail.user_id !== 'string' ||
        !Array.isArray(detail.items)) return;
    const items = detail.items.slice(0,30).map(item => ({
      id:item.id, name:item.name, status:item.status,
      created_at:item.created_at, preview:item.preview||null
    }));
    try { window.PicgiftNative?.postMessage(JSON.stringify({
      action:'gallery-sync',user_id:detail.user_id,
      items,favorites:Array.isArray(detail.favorites)?detail.favorites.slice(0,30):[]
    })); } catch (_) { /* The web gallery stays available on unsupported devices. */ }
  }
  window.addEventListener('picgift:gallery',event => syncGallery(event.detail));
  window.addEventListener('picgift:gallery-clear',() => {
    try { window.PicgiftNative?.postMessage(JSON.stringify({action:'gallery-clear'})); } catch (_) {}
  });
  window.addEventListener('picgift:native-ready',() => {
    if (window.picgiftNativeComposeShell === true) window.picgiftNativeGallerySnapshot?.();
  });
  window.addEventListener('picgift:native-ready', enableNative);
  enableNative();

  // Hardware/gesture back closes the active sheet before changing screens.
  // Uses the existing app router; no reload, login reset or lost photo draft.
  window.picgiftNativeBack = () => {
    if (!isNative()) return false;
    const dialogs = [...document.querySelectorAll('dialog[open]')];
    const dialog = dialogs[dialogs.length - 1];
    if (dialog) { dialog.close(); return true; }
    const auth = document.getElementById('auth');
    if (auth?.classList.contains('show')) {
      auth.classList.remove('show');
      return true;
    }
    const current = document.body?.dataset.appPage;
    if (current && current !== 'crear') {
      window.dispatchEvent(new CustomEvent('picgift:route', { detail: { name: 'crear' } }));
      return true;
    }
    return false;
  };

  // Haptic feedback is dispatched only for real user taps, with a short
  // cooldown. The Android listener independently checks the trusted origin.
  let lastFeedback = 0;
  document.addEventListener('click', (event) => {
    if (!isNative() || !event.isTrusted || !window.PicgiftNative?.postMessage) return;
    const target = event.target instanceof Element
      ? event.target.closest('button, a[data-route], summary, [role="tab"]')
      : null;
    if (!target || target.hasAttribute('disabled') || target.closest('[hidden]')) return;
    const now = performance.now();
    if (now - lastFeedback < 85) return;
    lastFeedback = now;
    try { window.PicgiftNative.postMessage(JSON.stringify({action: 'haptic'})); }
    catch (_) { /* Haptics are an optional enhancement. */ }
  }, { passive: true });
})();
