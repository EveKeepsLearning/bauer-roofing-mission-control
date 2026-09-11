'use strict';
(function(){
  if(window.__broContactsCurrentOnlyLoaded)return;
  window.__broContactsCurrentOnlyLoaded=true;

  function isArchiveSection(section){
    if(section.classList.contains('archived-history-section'))return true;
    const heading=section.querySelector(':scope > h3');
    const title=String(heading?.textContent||'').trim().toLowerCase();
    return title==='preserved marketsharp history'||title==='archived inquiries'||title==='archived jobs';
  }

  function strip(){
    const detail=document.getElementById('contactDetail');
    if(detail)detail.querySelectorAll('.history-section').forEach(section=>{if(isArchiveSection(section))section.remove();});
    const results=document.getElementById('searchResults');
    if(results)results.querySelectorAll('.result').forEach(row=>{
      if(row.matches('[data-source-type="MarketSharp Archive"]')||row.querySelector('.archive-badge'))row.remove();
    });
    document.querySelectorAll('.archive-badge').forEach(x=>x.remove());
  }

  function install(){
    strip();
    [document.getElementById('contactDetail'),document.getElementById('searchResults')].filter(Boolean)
      .forEach(target=>new MutationObserver(strip).observe(target,{childList:true,subtree:true}));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
