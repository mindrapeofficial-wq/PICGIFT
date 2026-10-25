(() => {
  'use strict';
  const auth = document.getElementById('auth');
  if (!auth) return;
  let lastFocus = null, wasOpen = false, lastMode = auth.dataset.authMode;
  const controls = [];
  const english = () => document.documentElement.lang.startsWith('en');
  const style = document.createElement('style');
  style.textContent = '.password-control{position:relative;display:block}.password-control input{padding-inline-end:54px!important}.password-visibility{position:absolute;inset-inline-end:4px;top:50%;transform:translateY(-50%);min-width:44px;min-height:44px;border:0;border-radius:8px;background:transparent;color:inherit;cursor:pointer}.password-visibility:focus-visible{outline:2px solid currentColor;outline-offset:1px}.password-visibility svg{width:22px;height:22px;vertical-align:middle}';
  document.head.append(style);
  for (const id of ['auth-password', 'auth-password-confirm']) {
    const input = document.getElementById(id);
    if (!input) continue;
    const wrapper = document.createElement('span');
    wrapper.className = 'password-control';
    input.before(wrapper); wrapper.append(input);
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'password-visibility';
    button.setAttribute('aria-controls', id);
    button.setAttribute('data-no-translate', '');
    const render = () => {
      const visible = input.type === 'text';
      const label = english() ? (visible ? 'Hide password' : 'Show password') : (visible ? 'Ocultar contraseña' : 'Mostrar contraseña');
      button.setAttribute('aria-label', label); button.title = label;
      button.setAttribute('aria-pressed', String(visible));
      button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>' + (visible ? '<path d="m3 3 18 18"/>' : '') + '</svg>';
    };
    button.addEventListener('click', () => {
      const start = input.selectionStart, end = input.selectionEnd;
      input.type = input.type === 'password' ? 'text' : 'password';
      try { input.setSelectionRange(start, end); } catch {}
      render();
    });
    wrapper.append(button); controls.push({input, render}); render();
  }
  const hidePasswords = () => controls.forEach(({input, render}) => { input.type = 'password'; render(); });
  function syncAuth() {
    const opened = auth.classList.contains('show');
    document.body.classList.toggle('auth-open', opened);
    if (opened && !wasOpen) lastFocus = window.picgiftAuthReturnFocus || document.activeElement;
    if (!opened || lastMode !== auth.dataset.authMode) hidePasswords();
    if (!opened && wasOpen && lastFocus?.isConnected) { lastFocus.focus(); lastFocus = null; }
    // Do not hide Google while Android's asynchronous capability handshake is pending.
    // auth.js owns availability and preserves the external-browser/password alternatives.
    wasOpen = opened; lastMode = auth.dataset.authMode;
  }
  new MutationObserver(syncAuth).observe(auth, {attributes:true, attributeFilter:['class','data-auth-mode']});
  let lastLanguage = document.documentElement.lang;
  new MutationObserver(() => {
    const next = document.documentElement.lang;
    if (next === lastLanguage) return;
    lastLanguage = next;
    controls.forEach(c => c.render());
  }).observe(document.documentElement, {attributes:true, attributeFilter:['lang']});
  document.addEventListener('visibilitychange', () => { if (document.hidden) hidePasswords(); });
  auth.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const nodes = [...auth.querySelectorAll('button,a,input,select,textarea')].filter(n => !n.disabled && n.getClientRects().length);
    if (!nodes.length) { event.preventDefault(); return; }
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  window.addEventListener('picgift:navigated', event => {
    document.querySelectorAll('.nav-link,.mobile-nav button').forEach(button => {
      if (button.dataset.route === event.detail.name) button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
    });
  });
  syncAuth();
  // Public local module, also included in the Android asset allowlist.
  import('./beta-feedback.js').catch(() => { /* Core sign-in remains usable if optional help cannot load. */ });
})();
