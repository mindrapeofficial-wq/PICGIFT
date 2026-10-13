// PICGIFT Android push opt-in. Only the signed-in web session may register a native FCM token.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

if (window.PicgiftNative && typeof window.PicgiftNative.postMessage === 'function') {
  const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  const KEY = 'picgift-push-opt-in';
  const ASKED = 'picgift-push-permission-asked-v1';
  const native = window.PicgiftNative;
  let enabledInMemory;
  const isEnabled = () => enabledInMemory ?? (readPreference(KEY) === 'yes');
  const setEnabled = yes => { enabledInMemory = !!yes; try { yes ? localStorage.setItem(KEY, 'yes') : localStorage.removeItem(KEY); } catch { /* Keep this launch's preference in memory. */ } };
  const post = action => native.postMessage(JSON.stringify({ action }));
  let lastDevice = null;
  let lastToken = null;
  let busy = false;
  let stateRevision = 0, observedUserId, lastSession = null;
  let registrationTask = null, stoppingTask = null;
  let entryUser = null;
  let entryTimer = null;
  const readPreference = key => { try { return localStorage.getItem(key); } catch { return null; } };
  function finishEntry() {
    clearTimeout(entryTimer); entryTimer = null;
    if (!entryUser || window.picgiftEntryNotificationsReady) return;
    window.picgiftEntryNotificationsReady = true;
    window.dispatchEvent(new Event('picgift:entry-notifications-ready'));
  }
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
    box.disabled = !!stoppingTask;
    status(message);
  }
  async function invoke(body, session) {
    // Bind cleanup to the account that registered the device, even after another account signs in.
    if (!session?.access_token) throw new Error('session_required');
    const options = {body,headers:{Authorization:'Bearer '+session.access_token}};
    const {data,error} = await client.functions.invoke('picgift-notifications',options);
    if (error || data?.error) throw new Error(data?.error || 'network_error');
    return data;
  }
  function observeSession(session) {
    const next = session?.user?.id || null;
    if (observedUserId !== undefined && observedUserId !== next) {
      stateRevision++;
      if (lastSession?.user) void disableNotifications(lastSession);
    }
    observedUserId = next;
    lastSession = session || null;
  }
  const registrationIsCurrent = (session,revision) => revision === stateRevision &&
    session?.user?.id === observedUserId && isEnabled() && !stoppingTask;
  async function removeDevice(session,installation_id) {
    if (session?.user && installation_id) await invoke({action:'unregister',installation_id},session);
  }
  async function register({token, installation_id}) {
    if (!isEnabled() || !token || !installation_id || registrationTask || stoppingTask) return;
    const revision = stateRevision;
    // Reserve the operation before checking the session; two native callbacks cannot both start it.
    const task = Promise.resolve().then(async () => {
      let session = null, attempted = false;
      try {
        const result = await client.auth.getSession();
        session = result.data?.session;
        if (result.error) throw result.error;
        if (revision !== stateRevision || !isEnabled() || stoppingTask) return;
        observeSession(session);
        if (!session?.user) { status('Inicia sesión para activar las notificaciones.'); return; }
        if (!registrationIsCurrent(session,revision)) return;
        attempted = true;
        await invoke({action:'register',token,installation_id},session);
        if (registrationIsCurrent(session,revision)) {
          lastToken = token; lastDevice = installation_id;
          status('Notificaciones activadas en este móvil.');
        }
      } catch {
        if (registrationIsCurrent(session,revision)) status('No se pudo registrar este móvil. Vuelve a entrar a la app y reinténtalo.');
      } finally {
        // A request already received by the server can finish after logout/opt-out.
        if (attempted && !registrationIsCurrent(session,revision)) {
          try { await removeDevice(session,installation_id); } catch { /* The serialized stop also retries cleanup. */ }
        }
      }
    });
    registrationTask = task; busy = true; updatePanel();
    try { await task; }
    finally { if (registrationTask === task) registrationTask = null; busy = !!stoppingTask; updatePanel(); }
  }
  function disableNotifications(session = lastSession) {
    stateRevision++;
    setEnabled(false); lastToken = null;
    post('notifications-disable');
    if (stoppingTask) return stoppingTask;
    const pending = registrationTask, device = lastDevice;
    const task = Promise.resolve().then(async () => {
      try {
        if (pending) await pending;
        if (!session) session = (await client.auth.getSession()).data?.session;
        await removeDevice(session,device || lastDevice);
        status('Notificaciones desactivadas.');
      } catch {
        status('No se pudo confirmar la baja de notificaciones en el servidor. Reinténtalo cuando vuelva la conexión.');
      }
    }).finally(() => {
      if (stoppingTask === task) stoppingTask = null;
      busy = !!registrationTask; updatePanel();
    });
    stoppingTask = task; busy = true; updatePanel();
    return task;
  }
  // Auth is still valid at this point; remove registration before signing out.
  window.picgiftNotificationsUnregister = () => disableNotifications();
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
        setEnabled(false);
        status('El permiso de notificaciones está desactivado. Puedes permitirlo en ajustes de Android.');
        break;
      default:
        status('No se pudo conectar con las notificaciones. Reinténtalo.');
    }
    updatePanel();
    // The introduction never waits for registration with the remote server.
    finishEntry();
  });
  document.addEventListener('change', async e => {
    if (e.target?.id !== 'picgift-push-consent') return;
    if (busy && e.target.checked) { updatePanel(); return; }
    const enabled = e.target.checked;
    if (enabled) {
      const revision = stateRevision;
      let session;
      try {
        const result = await client.auth.getSession();
        if (result.error) throw result.error;
        session = result.data?.session;
      } catch {
        if (revision === stateRevision) status('No se pudo comprobar tu sesión. Vuelve a intentarlo.');
        updatePanel(); return;
      }
      if (revision !== stateRevision) { updatePanel(); return; }
      if (!session?.user) {
        status('Inicia sesión en PICGIFT antes de activar notificaciones.');
        updatePanel(); return;
      }
      observeSession(session);
      if (stoppingTask) { updatePanel(); return; }
      stateRevision++;
      setEnabled(true);
      status('Solicitando permiso para mostrar notificaciones…');
      post('notifications-enable');
    } else {
      await disableNotifications();
    }
  });
  window.addEventListener('picgift:push-panel', () => {
    updatePanel();
    post('notifications-status');
  });
  window.addEventListener('picgift:native-ready', () => {
    if (isEnabled()) post('notifications-status');
    void requestOnEntry();
  });
  // Request once after Google; the introduction follows the permission result.
  // A later refusal or opt-out is never overridden on the next launch.
  let startupPending=false;
  async function requestOnEntry(){
    if(startupPending)return;
    startupPending=true;
    const revision=stateRevision;
    try {
      const {data:{session}}=await client.auth.getSession();
      if(revision!==stateRevision)return;
      observeSession(session);
      if(!session?.user)return;
      if(entryUser!==session.user.id){entryUser=session.user.id;window.picgiftEntryNotificationsReady=false;}
      if(entryTimer!==null)return;
      if(isEnabled()){finishEntry();post('notifications-status');return;}
      if(readPreference(ASKED)==='yes'){finishEntry();return;}
      if(document.getElementById('auth')?.classList.contains('show'))return;
      try { localStorage.setItem(ASKED,'yes'); } catch { /* This launch still continues safely. */ }
      setEnabled(true);
      status('Solicitando permiso para mostrar notificaciones…');
      entryTimer=setTimeout(finishEntry,10000);
      post('notifications-enable');
    } catch {status('No se pudo comprobar el permiso. Reinténtalo desde Perfil → Notificaciones.');finishEntry();}
    finally {startupPending=false;}
  }
  const authPanel=document.getElementById('auth');
  if(authPanel)new MutationObserver(()=>{
    if(!authPanel.classList.contains('show'))void requestOnEntry();
  }).observe(authPanel,{attributes:true,attributeFilter:['class']});
  client.auth.onAuthStateChange((event,session) => {
    observeSession(session);
    if (session?.user) setTimeout(()=>void requestOnEntry(),400);
    else {entryUser=null;window.picgiftEntryNotificationsReady=false;clearTimeout(entryTimer);entryTimer=null;}
  });
  const initialRevision=stateRevision;
  client.auth.getSession().then(({data}) => {
    if(initialRevision!==stateRevision)return;
    observeSession(data?.session);
    if (data?.session?.user) setTimeout(()=>void requestOnEntry(),400);
  }).catch(() => {});
}
