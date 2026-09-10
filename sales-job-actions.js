'use strict';
(function(){
  if(window.__broSalesJobActionsLoaded)return;window.__broSalesJobActionsLoaded=true;
  const cfg=window.BAUER_CONFIG||{};let db=null,lastLeadId='';
  const getDb=()=>db||(db=window.supabase?.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY));
  async function openForLead(id){
    if(!id||!window.BROJobHandoff?.open)return;
    const client=getDb();if(!client)return;
    const {data,error}=await client.from('leads').select('*').eq('id',id).single();
    if(error)return;
    window.BROJobHandoff.open({...data,lead_id:data.id,customer_name:data.homeowner_name,contact_id:data.contact_id});
  }
  function installContextHook(){
    document.addEventListener('contextmenu',e=>{const card=e.target.closest('.sales-card[data-lead-id]');if(card)lastLeadId=card.dataset.leadId;},true);
    const menu=document.getElementById('salesContext');if(!menu)return;
    new MutationObserver(()=>{
      if(!lastLeadId||menu.style.display==='none'||menu.querySelector('[data-create-job]'))return;
      const btn=document.createElement('button');btn.type='button';btn.dataset.createJob='1';btn.textContent='Create Job';
      btn.onclick=e=>{e.preventDefault();e.stopPropagation();menu.style.display='none';openForLead(lastLeadId);};
      const first=menu.querySelector('button');if(first)first.insertAdjacentElement('afterend',btn);else menu.appendChild(btn);
    }).observe(menu,{childList:true,subtree:true,attributes:true,attributeFilter:['style']});
  }
  function installSoldDropHook(){
    document.addEventListener('drop',e=>{
      const col=e.target.closest('.pipe-col[data-stage="Sold"]');if(!col)return;
      const id=e.dataTransfer?.getData('text/plain')||lastLeadId;if(!id)return;
      setTimeout(()=>openForLead(id),450);
    },true);
  }
  function installOutcomeHook(){
    const btn=document.getElementById('saveOutcome');if(!btn)return;
    btn.addEventListener('click',()=>{
      const result=String(document.getElementById('outcomeResult')?.value||'').toLowerCase();
      const id=document.getElementById('outcomeLeadId')?.value;
      if(result==='contract signed'||result.includes('sold'))setTimeout(()=>openForLead(id),550);
    });
  }
  function install(){installContextHook();installSoldDropHook();installOutcomeHook();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,50));else setTimeout(install,50);
})();
