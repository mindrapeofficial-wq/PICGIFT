/* A short-lived authorization CODE returns to Android. Never send session tokens through a deep link. */
(()=>{'use strict';
 if(window.PicgiftNative)return;
 const code=new URLSearchParams(location.search).get('code');if(!code)return;
 let pending;try{pending=JSON.parse(sessionStorage.getItem('picgift_android_auth')||'null')}catch{return}
 if(!pending||!/^[a-f0-9]{64}$/.test(pending.state)||!Number.isFinite(pending.created)||Date.now()-pending.created<0||Date.now()-pending.created>600000||!/^[A-Za-z0-9_-]{20,512}$/.test(code)){try{sessionStorage.removeItem('picgift_android_auth')}catch{}return;}
 window.picgiftNativeReturn=true;
 const target='com.picgift.myapp://auth?code='+encodeURIComponent(code)+'&state='+encodeURIComponent(pending.state);
 const style=document.createElement('link');style.rel='stylesheet';style.href='./native-auth.css';document.head.append(style);
 document.addEventListener('DOMContentLoaded',()=>{
  document.body.classList.add('native-auth-return');
  const panel=document.createElement('main');panel.className='native-auth-card';
  const logo=document.createElement('img');logo.src='./assets/halloween/picgift-logo-hd.png';logo.alt='PICGIFT';
  const title=document.createElement('h1');title.textContent='Vuelve a PICGIFT';
  const caption=document.createElement('p');caption.textContent='Completa el acceso a tu cuenta desde la aplicación.';
  const button=document.createElement('a');button.className='native-auth-button';button.href=target;button.textContent='Volver a PICGIFT';
  button.addEventListener('click',()=>{sessionStorage.removeItem('picgift_android_auth');history.replaceState(null,'',location.pathname);});
  panel.append(logo,title,caption,button);document.body.append(panel);
 },{once:true});
})();
