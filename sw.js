/* PICGIFT Halloween 2026: only public static assets are cached.
   Never intercept cross-origin Supabase / OpenAI requests, authenticated API responses,
   private photos, signed URLs, POST requests or non-public objects. */
const VERSION="picgift-official-single-logo-20261008-v17";
const SHELL=[
 "/","/index.html","/styles.css","/mobile-app.css","/app.js","/auth.js","/generator.js",
 "/assets/halloween/picgift-logo-oficial.svg","/assets/halloween/icon-192.png","/assets/halloween/icon-512.png","/i18n.js","/locales/en.json","/collection.css","/experience.js","/photo-editor.js",
 "/assets/halloween/guide/retrato.webp","/assets/halloween/guide/cuerpo-entero.webp","/assets/halloween/guide/sentado.webp","/assets/halloween/guide/evitar.webp","/privacy.html","/delete-account.html",
 "/assets/halloween/backdrops/potions.jpg","/assets/halloween/backdrops/autumn-arch.jpg","/assets/halloween/backdrops/pumpkin-bench.jpg","/assets/halloween/backdrops/lantern-street.jpg","/assets/halloween/journey/result.webp","/assets/halloween/samples/pociones.webp","/assets/halloween/samples/bosque.webp","/assets/halloween/samples/calabazas.webp",
 "/payments.js","/install.js","/config.js","/manifest.webmanifest","/scenes.json",
  "/assets/halloween/scenes/bosque-calabazas.svg","/assets/halloween/scenes/castillo-embrujado.svg",
 "/assets/halloween/scenes/salon-embrujado.svg"
];
const allowed=new Set(SHELL);
self.addEventListener("install",event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(VERSION);
    await Promise.allSettled(SHELL.map(async path=>{
      const response=await fetch(new Request(path,{cache:"reload"}));
      if(response.ok)await cache.put(path,response.clone());
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener("activate",event=>{
  event.waitUntil((async()=>{
    const names=await caches.keys();
    await Promise.all(names.filter(name=>name.startsWith("picgift-shell-")&&name!==VERSION).map(name=>caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch",event=>{
 const req=event.request;
 if(req.method!=="GET")return;
 const url=new URL(req.url);
 if(url.origin!==self.location.origin)return;
 const path=url.pathname;
 if(!allowed.has(path))return;
 event.respondWith((async()=>{
   const cache=await caches.open(VERSION);
   try{
     const response=await fetch(req);
     if(response.ok)await cache.put(path,response.clone());
     return response;
   }catch(error){
     const cached=await cache.match(path);
     if(cached)return cached;
     if(req.mode==="navigate"){const page=await cache.match("/index.html");if(page)return page;}
     return Response.error();
   }
 })());
});