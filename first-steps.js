(()=>{'use strict';
 const dialog=document.getElementById('first-steps');
 if(!dialog)return;
 let user=null;
 const key=()=> 'picgift-first-steps-v1:'+user?.id;
 function seen(){try{return localStorage.getItem(key())==='done'}catch{return false}}
 function open(){if(!dialog.open)dialog.showModal();}
 function finish(){
  if(user){try{localStorage.setItem(key(),'done')}catch{}}
  dialog.close();
  window.dispatchEvent(new Event('picgift:onboarding-complete'));
 }
 document.addEventListener('click',event=>{
  if(event.target.closest('[data-first-steps]'))open();
  if(event.target.closest('[data-first-steps-done]'))finish();
 });
 dialog.addEventListener('cancel',event=>{event.preventDefault();finish()});
 window.addEventListener('picgift:auth',event=>{
  user=event.detail.user||null;
  if(!user){dialog.close();return}
  if((window.PicgiftNative||window.matchMedia('(max-width:820px)').matches)&&!seen())open();
  else window.dispatchEvent(new Event('picgift:onboarding-complete'));
 });
})();
