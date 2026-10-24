/* Presentation bridge for the installed Android interface. No session tokens cross it. */
(() => {
  'use strict';
  const routes = new Set(['inicio', 'crear', 'mis-fotos', 'escenarios', 'cuenta', 'precios', 'resultado', 'creditos']);
  let readySent = false;
  let currentUser = window.picgiftCurrentUser?.id || null;
  let lastOverlay = null;
  const native = () => window.picgiftNativeApp === true && window.picgiftNativeComposeShell === true;
  function send(message) {
    try { window.PicgiftNative?.postMessage(JSON.stringify(message)); } catch (_) { /* HTML remains usable. */ }
  }
  function route(name) {
    if (native() && routes.has(name)) send({action:'route', name});
  }
  function overlays() {
    if (!native()) return;
    const visible = !!document.querySelector('dialog[open], #auth.show');
    if (visible !== lastOverlay) {
      lastOverlay = visible;
      send({action:'web-overlay', visible});
    }
  }
  function language() {
    if (!native()) return;
    const lang = window.picgiftI18n?.language || document.documentElement.lang;
    send({action:'language', language:lang === 'es' ? 'es' : 'en'});
  }
  function ready() {
    if (window.picgiftNativeApp !== true) return;
    if (window.picgiftNativeComposeAvailable === true && !readySent) {
      readySent = true;
      send({action:'shell-ready', version:1});
    }
    if (!native()) return;
    document.documentElement.classList.add('picgift-native', 'picgift-compose-shell');
    route(document.body?.dataset.appPage || 'crear');
    language();
    overlays();
    window.picgiftNativeGallerySnapshot?.();
  }
  function syncGallery(detail) {
    if (!native() || !detail || !currentUser || detail.user_id !== currentUser ||
        !Array.isArray(detail.items)) return;
    // Explicit allowlist and bounded metadata; never forward auth tokens or source photos.
    const items = detail.items.slice(0,30).map(item => ({
      id:item.id, name:item.name, status:item.status,
      created_at:item.created_at, preview:item.preview || null
    }));
    send({action:'gallery-sync', user_id:currentUser, items,
      favorites:Array.isArray(detail.favorites) ? detail.favorites.slice(0,30) : [],
      loading:detail.loading === true, error:detail.error === true});
  }
  window.addEventListener('picgift:native-ready', ready);
  window.addEventListener('picgift:navigated', event => route(event.detail?.name));
  window.addEventListener('picgift:language', language);
  window.addEventListener('picgift:native-gallery-data', event => syncGallery(event.detail));
  window.addEventListener('picgift:auth', event => {
    const next = event.detail?.user?.id || null;
    if (next !== currentUser) {
      currentUser = next;
      if (native()) send({action:'gallery-clear'});
    }
    if (native()) window.picgiftNativeGallerySnapshot?.();
  });
  window.addEventListener('picgift:gallery-clear', () => {
    if (native()) send({action:'gallery-clear'});
  });
  window.picgiftNativeCamera = () => {
    if (!native()) return false;
    const camera = document.querySelector('[data-camera-capture]');
    if (!camera) return false;
    camera.click();
    return true;
  };
  window.picgiftNativeBack = () => {
    if (!native()) return false;
    const dialogs = [...document.querySelectorAll('dialog[open]')];
    if (dialogs.length) { dialogs[dialogs.length - 1].close(); return true; }
    if (document.getElementById('auth')?.classList.contains('show')) {
      document.getElementById('close')?.click();
      return true;
    }
    const page = document.body?.dataset.appPage;
    if (page && page !== 'crear') {
      window.dispatchEvent(new CustomEvent('picgift:route', {detail:{name:'crear'}}));
      return true;
    }
    return false;
  };
  // Dialog/auth surfaces belong to the WebView. Temporarily remove native overlays
  // so consent, account verification, purchases and support stay reachable.
  new MutationObserver(overlays).observe(document.documentElement,
    {subtree:true, attributes:true, attributeFilter:['open','class'], childList:true});
  document.addEventListener('close', overlays, true);
  ready();
})();
