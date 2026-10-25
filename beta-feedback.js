// Beta support, replayable help and explicit sharing of a photo, never its signed URL.
const language = () => document.documentElement.lang.startsWith('en') ? 'en' : 'es';
const text = (es, en) => language() === 'en' ? en : es;
const MAX_BYTES = 20 * 1024 * 1024;
let revision = 0, currentDialog = null, controller = null;
function closeDialog() {
  controller?.abort(); controller = null;
  if (currentDialog) { currentDialog.close(); currentDialog.remove(); currentDialog = null; }
}
window.addEventListener('picgift:auth', () => { revision++; closeDialog(); });
function dialog(title) {
  closeDialog();
  const d = document.createElement('dialog'); d.className = 'panel beta-dialog';
  d.setAttribute('data-no-translate','');
  const heading = document.createElement('h2'); heading.id = 'beta-dialog-title'; heading.textContent = title;
  d.setAttribute('aria-labelledby',heading.id);
  const close = button(text('Cerrar','Close'), () => closeDialog(), 'btn quiet');
  d.append(heading, close); document.body.append(d); currentDialog = d;
  d.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
  d.showModal(); return d;
}
function button(label, action, className = 'btn outline') {
  const b = document.createElement('button'); b.type = 'button'; b.className = className;
  b.textContent = label; b.addEventListener('click',action); return b;
}
function paragraph(parent, value) { const p = document.createElement('p'); p.textContent = value; parent.append(p); return p; }
const style = document.createElement('style');
style.textContent = '.beta-dialog{box-sizing:border-box;width:calc(100% - 32px);max-width:480px;max-height:85dvh;overflow:auto;color:var(--text,#fff);background:var(--panel,#24170f);border:1px solid #694327;border-radius:20px;padding:24px}.beta-dialog::backdrop{background:rgba(0,0,0,.75)}.beta-dialog h2{margin:0 0 12px}.beta-dialog p{line-height:1.5;margin:12px 0}.beta-dialog form{display:grid;gap:14px}.beta-dialog textarea,.beta-dialog select{box-sizing:border-box;width:100%;font:inherit}.beta-dialog textarea{min-height:130px;padding:10px}.beta-dialog .btn{min-height:44px;margin:6px 0;white-space:normal}.beta-dialog label{display:grid;gap:6px}.beta-help-row{width:100%}';
document.head.append(style);

export function validFeedback(category, message) {
  return ['bug','suggestion','login','performance'].includes(category) &&
    typeof message === 'string' && message.trim().length >= 10 && message.trim().length <= 2000;
}
function showFeedback() {
  const d = dialog(text('Ayuda y comentarios','Help and feedback'));
  d.append(button(text('Volver a ver el tutorial','Replay the tutorial'), () => {
    closeDialog(); document.getElementById('app-panel')?.close();
    const launch = document.createElement('button'); launch.type = 'button'; launch.dataset.firstSteps = '';
    document.body.append(launch); launch.click(); launch.remove();
  }));
  d.append(button(text('Novedades de PicGift','PicGift news'), () => {
    closeDialog(); window.dispatchEvent(new Event('picgift:open-news'));
  }));
  const form = document.createElement('form');
  const categoryLabel = document.createElement('label'); categoryLabel.textContent = text('Tipo de comentario','Feedback type');
  const category = document.createElement('select'); category.name = 'category';
  [['bug','Problema','Problem'],['suggestion','Sugerencia','Suggestion'],['login','Inicio de sesión','Sign-in'],['performance','Rendimiento','Performance']].forEach(([value,es,en]) => {
    const o = document.createElement('option'); o.value = value; o.textContent = text(es,en); category.append(o);
  });
  categoryLabel.append(category);
  const label = document.createElement('label'); label.textContent = text('¿Qué ha ocurrido o qué mejorarías?','What happened or what would you improve?');
  const message = document.createElement('textarea'); message.name = 'message'; message.required = true; message.minLength = 10; message.maxLength = 2000;
  label.append(message);
  const status = paragraph(form, text('No incluyas contraseñas, datos de pago ni fotos. Tu comentario será privado.','Do not include passwords, payment details or photos. Your feedback will be private.'));
  status.setAttribute('role','status'); status.setAttribute('aria-live','polite');
  const submit = document.createElement('button'); submit.type = 'submit'; submit.className = 'btn primary'; submit.textContent = text('Enviar comentario','Send feedback');
  form.prepend(categoryLabel,label); form.append(submit); d.append(form);
  paragraph(d,text('Guardamos el comentario vinculado a tu cuenta para atenderlo. No adjuntamos fotografías ni diagnósticos automáticamente. Se elimina al borrar la cuenta; también puedes solicitar su eliminación por correo.','We store feedback linked to your account to handle it. We do not automatically attach photos or diagnostics. It is deleted when your account is deleted; you can also request deletion by email.'));
  const privacy = document.createElement('a'); privacy.href = './privacy.html'; privacy.textContent = text('Información de privacidad','Privacy information'); d.append(privacy);
  const contact = document.createElement('a'); contact.href = 'mailto:mindrapeofficial@gmail.com'; contact.className = 'text-btn';
  contact.textContent = text('No puedo entrar: contactar por correo','Cannot sign in: contact by email'); d.append(contact);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submit.disabled) return;
    if (!validFeedback(category.value,message.value)) { status.textContent = text('Escribe entre 10 y 2000 caracteres.','Write between 10 and 2000 characters.'); return; }
    if (typeof window.picgiftSendFeedback !== 'function') { status.textContent = text('El soporte no está disponible. Usa el enlace de correo.','Support is unavailable. Use the email link.'); return; }
    const ownerRevision = revision; submit.disabled = true;
    status.textContent = text('Enviando…','Sending…');
    try {
      const result = await window.picgiftSendFeedback({category:category.value,message:message.value.trim(),locale:language()});
      if (ownerRevision !== revision || currentDialog !== d) return;
      if (!result?.ok) {
        status.textContent = result?.reason === 'login' ? text('Inicia sesión para enviar desde la app, o utiliza el correo.','Sign in to send in the app, or use email.') :
          result?.reason === 'rate-limit' ? text('Has enviado varios comentarios. Espera unos minutos o contacta por correo.','You have sent several comments. Wait a few minutes or contact us by email.') :
          text('No se ha enviado. Tu texto sigue aquí: reintenta o usa el correo.','Not sent. Your text is still here: retry or use email.');
        return;
      }
      message.value = ''; status.textContent = text('Comentario recibido. Gracias por ayudarnos a mejorar PicGift.','Feedback received. Thank you for helping improve PicGift.');
    } catch { if (currentDialog === d) status.textContent = text('No se ha enviado. Comprueba la conexión e inténtalo de nuevo.','Not sent. Check your connection and try again.'); }
    finally { submit.disabled = false; }
  });
}

export function trustedPortraitUrl(href, userId) {
  try {
    const u = new URL(href);
    if (!/^[a-f0-9-]{36}$/i.test(userId || '') || u.protocol !== 'https:' || u.host !== 'uimrvgrpenccijumyiek.supabase.co' || u.username || u.password) return null;
    if (!u.pathname.startsWith('/storage/v1/object/sign/picgift-generated/' + userId + '/') || !u.searchParams.get('token')) return null;
    return u.href;
  } catch { return null; }
}
async function prepareShare(id) {
  const owner = window.picgiftCurrentUser?.id;
  const entry = (window.picgiftGallery || []).find(o => o.job?.id === id && o.job.status === 'completed');
  const href = trustedPortraitUrl(entry?.href, owner);
  if (!href || (entry.job.user_id && entry.job.user_id !== owner)) return;
  const d = dialog(text('Compartir tu retrato','Share your portrait'));
  paragraph(d,text('Compartirás una copia de la foto, no el enlace privado de tu galería.','You will share a copy of the photo, not your private gallery link.'));
  const status = paragraph(d,''); status.setAttribute('role','status');
  const download = button(text('Descargar para compartir desde Galería','Download to share from Gallery'), () => {
    if (window.picgiftCurrentUser?.id !== owner) return;
    const target = document.createElement('button'); target.type = 'button'; target.dataset.downloadJob = id; target.hidden = true;
    (document.getElementById('photo-library') || document.body).append(target); target.click(); target.remove(); closeDialog();
  });
  d.append(download);
  if (!navigator.share || !navigator.canShare) {
    status.textContent = text('Este dispositivo no permite compartir archivos desde aquí. Descarga la foto y compártela desde tu galería.','This device cannot share files here. Download the photo and share it from your gallery.'); return;
  }
  status.textContent = text('Preparando la foto…','Preparing the photo…');
  const mine = revision; controller = new AbortController(); const signal = controller.signal;
  const timeout = setTimeout(() => { if (currentDialog === d) controller?.abort(); }, 30000);
  try {
    const response = await fetch(href,{signal,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error'});
    const mime = (response.headers.get('content-type') || '').split(';')[0];
    if (!response.ok || !['image/jpeg','image/png','image/webp'].includes(mime) || Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('image');
    const reader = response.body?.getReader(); if (!reader) throw new Error('stream');
    const chunks = []; let size = 0;
    try { for (;;) { const {done,value} = await reader.read(); if (done) break; size += value.byteLength; if (size > MAX_BYTES) { await reader.cancel(); throw new Error('size'); } chunks.push(value); } }
    finally { reader.releaseLock(); }
    if (mine !== revision || currentDialog !== d || !size) return;
    const extension = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1];
    const file = new File(chunks,['picgift',extension].join('.'),{type:mime});
    if (!navigator.canShare({files:[file]})) throw new Error('unsupported');
    status.textContent = text('Foto lista. Elige dónde compartirla.','Photo ready. Choose where to share it.');
    const share = button(text('Compartir foto','Share photo'), async () => {
      if (mine !== revision || currentDialog !== d) return;
      share.disabled = true;
      try { await navigator.share({files:[file],title:'PicGift'}); if (currentDialog === d) closeDialog(); }
      catch (error) { if (error.name !== 'AbortError') status.textContent = text('No se pudo compartir. Puedes descargar la foto.','Unable to share. You can download the photo.'); }
      finally { share.disabled = false; }
    },'btn primary');
    d.insertBefore(share,download);
  } catch { if (currentDialog === d) status.textContent = text('No se pudo preparar la copia. Descarga la foto o vuelve a abrir Mis fotos para actualizar el enlace.','Unable to prepare a copy. Download the photo or reopen My photos to refresh its link.'); }
  finally { clearTimeout(timeout); }
}
document.addEventListener('click', event => {
  const share = event.target.closest?.('[data-share-job]');
  if (!share) return;
  event.preventDefault(); event.stopImmediatePropagation(); void prepareShare(share.dataset.shareJob);
},true);
const menus = document.querySelectorAll('.profile-menu');
const help = button(text('Ayuda y comentarios','Help and feedback'),showFeedback,'profile-row beta-help-row');
help.dataset.betaFeedback = ''; menus[menus.length - 1]?.append(help);
const authDialog = document.querySelector('#auth .dialog');
const report = button(text('Informar de un problema','Report a problem'), showFeedback,'text-btn');
authDialog?.append(report);
const browser = button(text('Usar Google en el navegador','Use Google in the browser'), () => window.dispatchEvent(new Event('picgift:google-browser-login')),'btn quiet');
browser.id = 'google-browser-fallback'; browser.hidden = true;
document.getElementById('google')?.after(browser);
const syncBrowser = () => { browser.hidden = !window.PicgiftNative || ['forgot','backup','recovery'].includes(document.getElementById('auth')?.dataset.authMode); };
new MutationObserver(syncBrowser).observe(document.getElementById('auth'),{attributes:true,attributeFilter:['data-auth-mode','class']});
window.addEventListener('picgift:native-ready',syncBrowser); syncBrowser();

// This component owns its ES/EN copy; do not let the legacy text translator rewrite it.
for (const element of [help,report,browser]) element.setAttribute('data-no-translate','');
let lastLanguage = document.documentElement.lang;
new MutationObserver(() => {
 const next = document.documentElement.lang;
 if (next === lastLanguage) return;
 lastLanguage = next;
 help.textContent = text('Ayuda y comentarios','Help and feedback');
 report.textContent = text('Informar de un problema','Report a problem');
 browser.textContent = text('Usar Google en el navegador','Use Google in the browser');
}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
