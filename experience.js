(()=>{'use strict';
const auth=document.getElementById('auth');let lastFocus=null;
const observer=new MutationObserver(()=>{const opened=auth.classList.contains('show');document.body.classList.toggle('auth-open',opened);if(opened){lastFocus=window.picgiftAuthReturnFocus||document.activeElement;if(window.PicgiftNative){document.getElementById('google').classList.add('hidden');document.getElementById('auth-msg').textContent='Accede con tu correo y contraseña.';}}else if(lastFocus){lastFocus.focus();lastFocus=null;}});
observer.observe(auth,{attributes:true,attributeFilter:['class']});
auth.addEventListener('keydown',event=>{if(event.key!=='Tab')return;const nodes=[...auth.querySelectorAll('button,a,input,select')].filter(n=>!n.disabled&&n.getClientRects().length);const first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}});
window.addEventListener('picgift:navigated',e=>{document.querySelectorAll('.nav-link,.mobile-nav button').forEach(b=>{if(b.dataset.route===e.detail.name)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});});
})();
