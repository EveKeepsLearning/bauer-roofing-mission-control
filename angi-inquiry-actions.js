'use strict';
(function(){
  if(window.__broAngiInquiryActionsLoaded)return;
  window.__broAngiInquiryActionsLoaded=true;

  let attempts=0;
  const maxAttempts=50;

  function esc(v){
    return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function ensureStyles(){
    if(document.getElementById('broAngiInquiryActionStyles'))return;
    const style=document.createElement('style');
    style.id='broAngiInquiryActionStyles';
    style.textContent=`
      .bro-angi-queue-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;align-items:stretch;margin-bottom:7px}
      .bro-angi-queue-item>.angi-queue-row{margin:0!important;width:100%}
      .bro-angi-create-inquiry{white-space:normal;min-width:118px;line-height:1.15;padding:8px 9px!important}
      @media (max-width:700px){.bro-angi-queue-item{grid-template-columns:1fr}.bro-angi-create-inquiry{width:100%}}
    `;
    document.head.appendChild(style);
  }

  async function suggestNextInquiryNumber(){
    const input=document.getElementById('leadNumber');
    if(!input)return;
    input.value='';
    try{
      if(typeof window.BRORefreshInquiryNumberSuggestion==='function'){
        await window.BRORefreshInquiryNumberSuggestion(input);
      }else if(typeof window.BRONextInquiryNumber==='function'){
        input.placeholder='Suggested next inquiry #: '+await window.BRONextInquiryNumber();
      }
    }catch(error){
      console.warn('Could not refresh inquiry number suggestion:',error);
    }
  }

  async function openInquiryForAngiProspect(id){
    if(typeof state==='undefined')return;
    const prospect=(state.prospects||[]).find(p=>String(p.id)===String(id));
    if(!prospect)return;

    if(prospect.contact_id){
      try{pendingRelatedContactId=prospect.contact_id;}catch(_){ }
    }

    if(typeof openAngiAppointment==='function'){
      openAngiAppointment(id);
    }else if(typeof openLeadDialog==='function'){
      openLeadDialog(prospect);
      const status=document.getElementById('leadStatus');
      if(status)status.value='Appointment Scheduled';
    }else{
      return;
    }

    const title=document.getElementById('leadDialogTitle');
    if(title)title.textContent='Create Inquiry / Set Appointment';
    await suggestNextInquiryNumber();
  }

  function install(){
    if(typeof angiQueueRowHtml!=='function'||typeof renderAngiQueue!=='function'||typeof state==='undefined'){
      attempts++;
      if(attempts<maxAttempts)setTimeout(install,100);
      return;
    }

    ensureStyles();

    if(!window.__broAngiQueueRowInquiryWrapped){
      window.__broAngiQueueRowInquiryWrapped=true;
      const originalRow=angiQueueRowHtml;
      const wrappedRow=function(p){
        const row=originalRow(p);
        return `<div class="bro-angi-queue-item">${row}<button type="button" class="btn primary small bro-angi-create-inquiry" data-angi-create-inquiry="${esc(p.id)}">Create Inquiry<br>/ Set Appt</button></div>`;
      };
      try{angiQueueRowHtml=wrappedRow;}catch(_){window.angiQueueRowHtml=wrappedRow;}
    }

    if(!window.__broAngiInquiryClickInstalled){
      window.__broAngiInquiryClickInstalled=true;
      document.body.addEventListener('click',event=>{
        const button=event.target.closest('[data-angi-create-inquiry]');
        if(!button)return;
        event.preventDefault();
        event.stopPropagation();
        openInquiryForAngiProspect(button.dataset.angiCreateInquiry);
      });
    }

    renderAngiQueue();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,0),{once:true});
  else setTimeout(install,0);
})();
