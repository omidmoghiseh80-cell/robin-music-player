const CACHE="arad-music-shell-v2";
const FILES=["./","./index.html","./style.css","./app.js","./manifest.json","./assets/icon.svg"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener("fetch",e=>{
  const u=new URL(e.request.url);
  if(u.hostname.includes("github.com")||u.hostname.includes("githubusercontent.com")||u.hostname.includes("api.github.com")) return;
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{const clone=res.clone();caches.open(CACHE).then(c=>c.put(e.request,clone));return res;})));
});