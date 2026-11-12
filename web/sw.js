// Network-first: users always get the latest deploy; cached copy is only a fallback when offline.
const C='pos-assistant-v2';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET')return;
  const h=new URL(r.url).hostname;
  if(h.endsWith('supabase.co')||h.includes('paystack'))return; // never cache API or payments
  e.respondWith(fetch(r.mode==='navigate'?new Request(r.url,{cache:'no-store'}):r).then(res=>{if(res.ok||res.type==='opaque'){const cp=res.clone();caches.open(C).then(c=>c.put(r,cp))}return res}).catch(()=>caches.match(r)));
});
