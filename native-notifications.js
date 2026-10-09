// PICGIFT Android push opt-in. Only the signed-in web session may register a native FCM token.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

if (window.PicgiftNative && typeof window.PicgiftNative.postMessage === 'function') {
  const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  const KEY = 'picgift-push-opt-in';
  const native = window.PicgiftNative;
  const isEnabled = () => localStorage.getItem(KEY) === 'yes';
  const setEnabled = yes => yes ? localStorage.setItem(KEY, 'yes') : localStorage.removeItem(KEY);
  const post = action => native.postMessage(JSON.stringify({ action }));
  let lastDevice = null;
  let lastToken = null;
  let busy = false;
  let message = 'Activa los avisos para recibir novedades de PICGIFT.';
  const status = text => {
    message = text;
    const el = document.getElementById('picgift-push-status');
    if (el) el.textContent = text;
  };
  function updatePanel() {
    const box = document.getElementById('picgift-push-consent');
    if (!box) return;
    box.checked = isEnabled();
    box.disabled = busy;
    status(message);
  }
  async function invoke(body) {
    const {data,error} = await client.functions.invoke('picgift-notifications',{body});
    if (error || data?.error) throw new Error(data?.error || 'network_error');
    return data;
  }
  async function register({token, installation_id}) {
    if (!isEnabled() || !token || !installation_id || busy) return;
    const {data:{session}} = await client.auth.getSession();
    if (!session?.user) { status('Inicia sesión para activar las notificaciones.'); return; }
    busy = true; updatePanel();
    try {
      await invoke({action:'register',token,installation_id});
      lastToken = token; lastDevice = installation_id;
      status('Notificaciones activadas en este móvil.');
    } catch {
      status('No se pudo registrar este móvil. Vuelve a entrar a la app y reinténtalo.');
    } finally { busy = false; updatePanel(); }
  }
  async function unregister() {
    if (!lastDevice) return;
    const {data:{session}} = await client.auth.getSession();
    if (session?.user) await invoke({action:'unregister',installation_id:lastDevice});
  }
  // Auth is still valid at this point; remove registration before signing out.
  window.picgiftNotificationsUnregister = async () => {
    try { await unregister(); } catch { /* Keep the native device disabled regardless. */ }
    setEnabled(false); lastToken = null;
    post('notifications-disable');
    status('Notificaciones desactivadas.');
    updatePanel();
  };
  window.addEventListener('picgift:native-push', e => {
    const data = e.detail || {};
    if (data.installation_id) lastDevice = data.installation_id;
    switch(data.status) {
      case 'ready':
        if (isEnabled()) void register(data);
        break;
      case 'disabled':
        status('Activa los avisos para recibir novedades de PICGIFT.');
        break;
      case 'not_configured':
        status('La configuración Firebase de esta versión Android está pendiente. Actualiza la app.');
        break;
      case 'permission_denied':
        status('El permiso de notificaciones está desactivado. Puedes permitirlo en ajustes de Android.');
        break;
      default:
        status('No se pudo conectar con las notificaciones. Reinténtalo.');
    }
    updatePanel();
  });
  document.addEventListener('change', async e => {
    if (e.target?.id !== 'picgift-push-consent') return;
    const enabled = e.target.checked;
    if (enabled) {
      const {data:{session}} = await client.auth.getSession();
      if (!session?.user) {
        status('Inicia sesión en PICGIFT antes de activar notificaciones.');
        updatePanel(); return;
      }
      setEnabled(true);
      status('Solicitando permiso para mostrar notificaciones…');
      post('notifications-enable');
    } else {
      busy = true; updatePanel();
      try {
        await unregister();
        setEnabled(false); lastToken = null;
        post('notifications-disable');
        status('Notificaciones desactivadas.');
      } catch {
        status('No se pudieron desactivar en el servidor. Comprueba la conexión y vuelve a intentarlo.');
      } finally { busy = false; updatePanel(); }
    }
  });
  window.addEventListener('picgift:push-panel', () => {
    updatePanel();
    post('notifications-status');
  });
  window.addEventListener('picgift:native-ready', () => {
    if (isEnabled()) post('notifications-status');
  });
  client.auth.onAuthStateChange((event,session) => {
    if (session?.user && isEnabled()) queueMicrotask(() => post('notifications-status'));
  });
  client.auth.getSession().then(({data}) => {
    if (data?.session?.user && isEnabled()) post('notifications-status');
  }).catch(() => {});
}
