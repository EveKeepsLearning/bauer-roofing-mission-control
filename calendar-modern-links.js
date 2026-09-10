'use strict';
(function(){
  const cfg=window.BAUER_CONFIG||{};
  function upgradeLinks(root=document){
    root.querySelectorAll('a[href*="index.html?view=leads&lead="]').forEach(a=>{
      try{
        const u=new URL(a.href,location.href);
        const id=u.searchParams.get('lead');
        if(!id)return;
        a.href=`inquiry.html?id=${encodeURIComponent(id)}&v=${encodeURIComponent(cfg.APP_VERSION||'')}`;
        a.textContent='Open Inquiry';
        a.title='Open the current Contact / Inquiry record';
      }catch(_){ }
    });
  }
  function install(){
    upgradeLinks();
    const observer=new MutationObserver(mutations=>{
      for(const m of mutations){
        m.addedNodes.forEach(n=>{
          if(n.nodeType===1)upgradeLinks(n);
        });
      }
      upgradeLinks();
    });
    observer.observe(document.body,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
