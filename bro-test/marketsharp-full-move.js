(function(){
  'use strict';
  async function moveFully(){
    if(typeof selected==='undefined'||!selected||selected.source_type!=='MarketSharp Archive') return;
    const id=selected.marketsharp_contact_id;
    if(!confirm('Move this preserved MarketSharp contact fully into Bauer Roofing Operations?\n\nThe original MarketSharp archive will stay preserved and linked. Historical records will remain history; active MarketSharp work will remain active.')) return;
    const b=document.getElementById('moveMarketSharpFullyBtn');
    if(b){b.disabled=true;b.textContent='Moving into BRO…';}
    const {data,error}=await db.rpc('bauer_promote_marketsharp_contact_full',{p_marketsharp_contact_id:id});
    if(error){notice('Could not move this contact into BRO: '+error.message,'error');if(b){b.disabled=false;b.textContent='Move Fully into BRO';}return;}
    const r=data||{};
    notice(`Moved ${r.name||'contact'} fully into BRO: ${r.inquiries_created||0} inquiries, ${r.appointments_created||0} appointments, and ${r.jobs_created||0} jobs added. The preserved MarketSharp archive is still linked.`,'success');
    if(r.contact_id) await openBroContact(r.contact_id);
  }
  function addButton(){
    const detail=document.getElementById('contactDetail');
    if(!detail||detail.classList.contains('hidden')) return;
    if(typeof selected==='undefined'||!selected||selected.source_type!=='MarketSharp Archive') return;
    const actions=detail.querySelector('.detail-actions');
    if(!actions||document.getElementById('moveMarketSharpFullyBtn')) return;
    const b=document.createElement('button');
    b.id='moveMarketSharpFullyBtn';b.type='button';b.className='btn success';b.textContent='Move Fully into BRO';b.onclick=moveFully;
    actions.insertBefore(b,actions.firstChild);
  }
  document.addEventListener('DOMContentLoaded',()=>{
    const detail=document.getElementById('contactDetail');
    if(detail)new MutationObserver(addButton).observe(detail,{childList:true,subtree:true});
    addButton();
  });
})();