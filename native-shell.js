/* Native Android presentation only. No privileged action is exposed to the browser. */
(() => {
  'use strict';
  const root = document.documentElement;
  const isNative = () => window.picgiftNativeApp === true;
  const enableNative = () => {
    if (!isNative()) return;
    root.classList.add('picgift-native');
  };
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
