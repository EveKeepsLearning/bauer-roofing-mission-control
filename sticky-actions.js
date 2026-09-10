'use strict';
(function(){
  if(window.__broStickyActionsLoaded)return;window.__broStickyActionsLoaded=true;
  function installStyles(){if(document.getElementById('broGlobalStickyActionsStyles'))return;const s=document.createElement('style');s.id='broGlobalStickyActionsStyles';s.textContent=`.bro-global-sticky-actions{position:sticky!important;bottom:0!important;z-index:1200!important;background:rgba(255,255,255,.98)!important;border-top:1px solid #dfe5ec!important;box-shadow:0 -4px 12px rgba(31,48,72,.08)!important;padding:10px!important;margin-left:-10px!important;margin-right:-10px!important}.bro-global-sticky-actions .btn{margin-top:0!important}dialog form.card,dialog .card{padding-bottom:0!important}.bro-inquiry-save-dock{position:fixed;left:50%;bottom:0;transform:translateX(-50%);z-index:1150;width:min(1100px,94vw);display:flex;justify-content:flex-end;align-items:center;gap:10px;padding:9px 14px;background:rgba(255,255,255,.98);border:1px solid #dfe5ec;border-bottom:0;border-radius:12px 12px 0 0;box-shadow:0 -4px 14px rgba(31,48,72,.12)}.bro-inquiry-save-dock.hidden{display:none!important}body.bro-has-inquiry-save-dock{padding-bottom:64px}`;document.head.appendChild(s);}
  function qualifies(button){const t=(button.textContent||'').trim().toLowerCase();return /^(save|create|update|add|send|merge)/.test(t)||t.includes('save &')||t.includes('google calendar');}
  function scan(root=document){
    root.querySelectorAll('button').forEach(button=>{
      if(!qualifies(button))return;
      const bar=button.closest('.toolbar,.toolbar2,.dialog-actions,.actions,.form-actions,.footer-actions')||button.parentElement;
      if(!bar)return;
      if(button.closest('dialog')||/save|create|update|merge/i.test(button.textContent||''))bar.classList.add('bro-global-sticky-actions');
    });
  }
  function installInquiryDock(){
    const path=(location.pathname.split('/').pop()||'').toLowerCase();
    if(path!=='inquiry.html'||document.getElementById('broInquirySaveDock'))return;
    const original=document.getElementById('saveInquiryBtn');if(!original)return;
    const dock=document.createElement('div');dock.id='broInquirySaveDock';dock.className='bro-inquiry-save-dock';
    const label=document.createElement('span');label.className='sub';label.textContent='Inquiry changes';label.style.marginRight='auto';
    const save=document.createElement('button');save.type='button';save.className='btn primary';save.textContent='Save Inquiry';
    save.addEventListener('click',()=>original.click());
    dock.append(label,save);document.body.appendChild(dock);document.body.classList.add('bro-has-inquiry-save-dock');
    const sync=()=>{const anyDialog=[...document.querySelectorAll('dialog')].some(d=>d.open);dock.classList.toggle('hidden',anyDialog);save.disabled=original.disabled;};
    sync();new MutationObserver(sync).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open','disabled']});
  }
  function install(){installStyles();scan();installInquiryDock();new MutationObserver(()=>{scan();installInquiryDock();}).observe(document.body,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
