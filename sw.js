const CACHE = 'offcourse-v3.0.0';
const CORE = ['./','./index.html','./styles.css','./v2.css','./v3.css','./app.js','./v3.js','./db.js','./manifest.webmanifest','./icon.svg','./apple-touch-icon.png','./icon-192.png','./icon-512.png'];

self.addEventListener('install', e => e.waitUntil(
  caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())
));

self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())
));

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin === location.origin) {
    e.respondWith(fetch(e.request).then(res => {
      const copy=res.clone(); caches.open(CACHE).then(c=>c.put(e.request,copy)); return res;
    }).catch(()=>caches.match(e.request).then(c=>c||caches.match('./index.html'))));
    return;
  }
  e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
    if(res && res.status===200){ const copy=res.clone(); caches.open(CACHE).then(c=>c.put(e.request,copy)); }
    return res;
  })));
});

function tileXY(lat,lng,z){
  const n=2**z, x=Math.floor((lng+180)/360*n);
  const latRad=lat*Math.PI/180;
  const y=Math.floor((1-Math.asinh(Math.tan(latRad))/Math.PI)/2*n);
  return {x,y};
}

self.addEventListener('message', e => {
  const d=e.data||{};
  if(d.type!=='CACHE_TILES'||!Number.isFinite(d.lat)||!Number.isFinite(d.lng))return;
  e.waitUntil((async()=>{
    const cache=await caches.open(CACHE), urls=[];
    for(const z of [10,11,12,13,14]){
      const c=tileXY(d.lat,d.lng,z);
      for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){
        const x=c.x+dx,y=c.y+dy;
        urls.push(`https://a.tile.openstreetmap.org/${z}/${x}/${y}.png`);
      }
    }
    for(const u of urls){
      try{ const req=new Request(u,{mode:'cors'}); const res=await fetch(req); if(res.ok)await cache.put(req,res.clone()); }catch{}
    }
  })());
});
