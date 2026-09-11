'use strict';
(function(){
  if(window.__broSalesJobActionsLoaded)return;window.__broSalesJobActionsLoaded=true;
  const cfg=window.BAUER_CONFIG||{};let db=null,lastLeadId='';
  const getDb=()=>db||(db=window.supabase?.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY));

  function installMenuStyles(){
    if(document.getElementById('broSalesContextFixStyles'))return;
    const style=document.createElement('style');
    style.id='broSalesContextFixStyles';
    style.textContent=`
      #salesContext.ctx{
        position:fixed!important;
        z-index:10000!important;
        width:250px!important;
        min-width:250px!important;
        max-width:calc(100vw - 16px)!important;
        height:auto!important;
        max-height:min(520px,calc(100vh - 16px))!important;
        overflow-y:auto!important;
        overflow-x:hidden!important;
        padding:6px!important;
        margin:0!important;
        background:#fff!important;
        border:1px solid #cfd8e3!important;
        border-radius:10px!important;
        box-shadow:0 12px 30px rgba(20,35,55,.22)!important;
      }
      #salesContext.ctx button{
        display:block!important;
        width:100%!important;
        margin:0!important;
        padding:9px 10px!important;
        border:0!important;
        border-radius:7px!important;
        background:#fff!important;
        color:#26384d!important;
        text-align:left!important;
        font:inherit!important;
        font-size:13px!important;
        line-height:1.25!important;
        cursor:pointer!important;
      }
      #salesContext.ctx button:hover{background:#eef4fb!important;}
      #salesContext.ctx button[data-create-job]{font-weight:750!important;color:#145fc2!important;}
    `;
    document.head.appendChild(style);
  }

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
  function install(){installMenuStyles();installContextHook();installSoldDropHook();installOutcomeHook();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,50));else setTimeout(install,50);
})();
