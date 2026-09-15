'use strict';
(function(){
  if(window.__broContactsArchiveAgeLoaded)return;
  window.__broContactsArchiveAgeLoaded=true;
  const $=id=>document.getElementById(id);
  let clickedWasArchive=false;

  function rememberSelection(event){
    const row=event.target.closest?.('.result');
    if(!row)return;
    clickedWasArchive=!!row.querySelector('.archive-badge');
  }

  function relabelDetail(){
    const detail=$('contactDetail');
    if(!detail||detail.classList.contains('hidden'))return;
    const sub=detail.querySelector('.detail-head .sub');
    if(!sub||!String(sub.textContent||'').toLowerCase().includes('marketsharp'))return;
    if(clickedWasArchive){
      sub.textContent='Preserved MarketSharp history — older than 10 years';
      return;
    }
    sub.textContent='MarketSharp history';
    detail.querySelectorAll('.history-section h3').forEach(h=>{
      if(h.textContent.trim()==='Archived Inquiries')h.textContent='Inquiries';
      if(h.textContent.trim()==='Archived Jobs')h.textContent='Jobs';
    });
  }

  function install(){
    $('searchResults')?.addEventListener('click',rememberSelection,true);
    const detail=$('contactDetail');
    if(detail)new MutationObserver(relabelDetail).observe(detail,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
    relabelDetail();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
