const BUILD='20260911-50-test';
self.addEventListener('install',event=>{self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(self.clients.claim());});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(url.origin!==location.origin)return;
  if(!url.pathname.includes('/bauer-roofing-mission-control/bro-test/'))return;
  const isConfig=url.pathname.endsWith('/config.js');
  const isRelease=url.pathname.endsWith('/release.json');
  if(isConfig||isRelease){
    const fresh=new URL(url.href);
    fresh.search='?build='+encodeURIComponent(BUILD)+'&t='+Date.now();
    event.respondWith(fetch(fresh.toString(),{cache:'no-store'}));
    return;
  }
  if(event.request.mode==='navigate'){
    const fresh=new URL(url.href);
    fresh.searchParams.set('build',BUILD);
    event.respondWith(fetch(fresh.toString(),{cache:'no-store'}));
  }
});
