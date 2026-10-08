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
 if(standalone()){button.classList.add("hidden");if(hint)hint.textContent="Ya estás utilizando PICGIFT como aplicación instalada.";return}
 if(proposal||isApple){
   button.classList.remove("hidden");
   button.textContent=proposal?"Instalar PICGIFT":"Añadir al inicio";
 }
}
window.addEventListener("beforeinstallprompt",event=>{
 event.preventDefault();
 proposal=event;
 showInstall();
});
window.addEventListener("appinstalled",()=>{proposal=null;showInstall()});
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
 window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js",{scope:"./"}).catch(()=>{}),{once:true});
}
})();