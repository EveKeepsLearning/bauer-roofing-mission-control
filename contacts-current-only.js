'use strict';
(function(){
  if(window.__broContactsCurrentOnlyLoaded)return;
  window.__broContactsCurrentOnlyLoaded=true;
  function strip(){
    const detail=document.getElementById('contactDetail');
    if(detail){detail.querySelectorAll('.history-section').forEach(section=>{const t=(section.textContent||'').toLowerCase();if(t.includes('preserved marketsharp')||t.includes('archived inquiries')||t.includes('archived jobs'))section.remove();});}
    const results=document.getElementById('searchResults');
    if(results){results.querySelectorAll('.result').forEach(row=>{const t=(row.textContent||'').toLowerCase();if(t.includes('preserved marketsharp')||t.includes('older history'))row.remove();});}
    document.querySelectorAll('.archive-badge').forEach(x=>x.remove());
  }
  function install(){strip();const targets=[document.getElementById('contactDetail'),document.getElementById('searchResults')].filter(Boolean);targets.forEach(target=>new MutationObserver(strip).observe(target,{childList:true,subtree:true}));}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();