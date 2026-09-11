'use strict';
(function(){
  if(window.__broContactsLinkNavigationLoaded)return;
  window.__broContactsLinkNavigationLoaded=true;

  document.addEventListener('click',function(e){
    const link=e.target.closest('#contactDetail a.history-item[href]');
    if(!link)return;
    if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
    const href=link.getAttribute('href');
    if(!href)return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    window.location.assign(new URL(href,window.location.href).href);
  },true);
})();
