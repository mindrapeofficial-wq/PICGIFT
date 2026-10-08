/* PICGIFT Navidad 2026: only public static assets are cached.
   Never intercept cross-origin Supabase / OpenAI requests, authenticated API responses,
   private photos, signed URLs, POST requests or non-public objects. */
const VERSION="picgift-shell-2026-10-v1";
const SHELL=[
 "/","/index.html","/styles.css","/app.js","/auth.js","/generator.js",
 "/payments.js","/config.js","/manifest.webmanifest","/logo.svg","/scenes.json",
 "/assets/scenes/golden-bokeh.jpg","/assets/scenes/reading-corner.jpg",
 "/assets/scenes/santa-workshop.jpg","/assets/scenes/christmas-chair.jpg",
 "/assets/scenes/white-trunk.jpg","/assets/scenes/winter-window.jpg",
 "/assets/scenes/cabinet-teddies.jpg"
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