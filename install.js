/* PICGIFT · installable mobile web experience.
   Never stores customer images or credentials in local offline caches. */
(()=>{
"use strict";
const button=document.getElementById("install-picgift");
const hint=document.getElementById("install-help");
const offline=document.getElementById("connection-state");
let proposal=null;
const standalone=()=>window.matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
function updateConnectivity(){
 if(offline){offline.classList.toggle("hidden",navigator.onLine);offline.textContent="Sin conexión: puedes explorar contenidos guardados, pero el inicio de sesión y la IA necesitan internet.";}
}
function showInstall(){
 if(!button)return;
 const isApple=/iPad|iPhone|iPod/i.test(navigator.userAgent);
 const isMobile=/Android|iPad|iPhone|iPod/i.test(navigator.userAgent);
 if(window.PicgiftNative){button.classList.add('hidden');return;}
 if(standalone()){button.classList.add("hidden");if(hint)hint.textContent="Ya estás utilizando PICGIFT como aplicación instalada.";return}
 if(proposal||isMobile){
   button.classList.remove("hidden");
   button.textContent=proposal?"Instalar PICGIFT":"Añadir al inicio";
 }
}
window.addEventListener("beforeinstallprompt",event=>{
 event.preventDefault();
 proposal=event;
 showInstall();
});
window.addEventListener("appinstalled",()=>{proposal=null;if(button)button.classList.add('hidden');if(hint)hint.textContent='PICGIFT se ha instalado correctamente.';});
if(button)button.addEventListener("click",async()=>{
 if(proposal){
   const choice=proposal;proposal=null;
   choice.prompt();
   await choice.userChoice.catch(()=>{});
   showInstall();
   return;
 }
 if(hint){hint.textContent=/iPad|iPhone|iPod/i.test(navigator.userAgent)
  ?"En Safari: pulsa Compartir y selecciona «Añadir a pantalla de inicio»."
  :"En Chrome: abre el menú del navegador y selecciona «Instalar aplicación» o «Añadir a pantalla de inicio».";}
});
window.addEventListener("online",updateConnectivity);
window.addEventListener("offline",updateConnectivity);
updateConnectivity();showInstall();
if("serviceWorker" in navigator&&location.protocol==="https:"){
 let wasControlled=Boolean(navigator.serviceWorker.controller),reloading=false;
 const banner=document.getElementById("update-banner");
 const btn=document.getElementById("update-picgift");
 const showUpdate=()=>banner?.classList.remove("hidden");
 if(btn)btn.addEventListener("click",()=>location.reload());
 navigator.serviceWorker.addEventListener("controllerchange",()=>{
   if(!wasControlled||reloading)return;
   if(document.getElementById("photo")?.files?.length){showUpdate();return}
   reloading=true;location.reload();
 });
 window.addEventListener("load",async()=>{
  try{
   const reg=await navigator.serviceWorker.register("./sw.js",{scope:"./"});
   if(wasControlled)reg.update().catch(()=>{});
  }catch{}
 },{once:true});
 window.addEventListener("pageshow",()=>{
  navigator.serviceWorker.getRegistration("./").then(r=>r?.update()).catch(()=>{});
 });
}
})();