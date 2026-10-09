/* External browser handoff. Only a PKCE challenge and one-time request state leave Android. */
(()=>{'use strict';
 try{
  const args=new URLSearchParams(location.search),state=args.get('state'),target=new URL(args.get('authorize'));
  if(!/^[a-f0-9]{64}$/.test(state||'')||target.origin!=='https://uimrvgrpenccijumyiek.supabase.co'||target.pathname!=='/auth/v1/authorize'||target.searchParams.get('provider')!=='google'||target.searchParams.get('redirect_to')!=='https://picgift.onrender.com/'||target.searchParams.get('code_challenge_method')?.toLowerCase()!=='s256'||!/^[A-Za-z0-9_-]{43}$/.test(target.searchParams.get('code_challenge')||''))throw new Error('Solicitud de acceso no válida. Vuelve a la aplicación e inténtalo de nuevo.');
  sessionStorage.setItem('picgift_android_auth',JSON.stringify({state,created:Date.now()}));
  history.replaceState(null,'',location.pathname);
  location.replace(target.href);
 }catch{document.getElementById('native-auth-status').textContent='Solicitud de acceso no válida. Vuelve a la aplicación e inténtalo de nuevo.';}
})();
