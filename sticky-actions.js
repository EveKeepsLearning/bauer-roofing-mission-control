'use strict';
(function(){
  if(window.__broStickyActionsLoaded)return;window.__broStickyActionsLoaded=true;
  function installStyles(){if(document.getElementById('broGlobalStickyActionsStyles'))return;const s=document.createElement('style');s.id='broGlobalStickyActionsStyles';s.textContent=`.bro-global-sticky-actions{position:sticky!important;bottom:0!important;z-index:1200!important;background:rgba(255,255,255,.98)!important;border-top:1px solid #dfe5ec!important;box-shadow:0 -4px 12px rgba(31,48,72,.08)!important;padding:10px!important;margin-left:-10px!important;margin-right:-10px!important}.bro-global-sticky-actions .btn{margin-top:0!important}dialog form.card,dialog .card{padding-bottom:0!important}`;document.head.appendChild(s);}
  function qualifies(button){const t=(button.textContent||'').trim().toLowerCase();return /^(save|create|update|add|send|merge)/.test(t)||t.includes('save &')||t.includes('google calendar');}
  function scan(root=document){
    root.querySelectorAll('button').forEach(button=>{
      if(!qualifies(button))return;
      const bar=button.closest('.toolbar,.toolbar2,.dialog-actions,.actions,.form-actions,.footer-actions')||button.parentElement;
      if(!bar)return;
      if(button.closest('dialog')||/save|create|update|merge/i.test(button.textContent||''))bar.classList.add('bro-global-sticky-actions');
    });
  }
  function install(){installStyles();scan();new MutationObserver(()=>scan()).observe(document.body,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
