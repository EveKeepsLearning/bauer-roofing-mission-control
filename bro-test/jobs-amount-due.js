'use strict';
(() => {
  function money(v){
    if(v===null||v===undefined||v==='') return 'Not entered';
    const n=Number(v);
    if(!Number.isFinite(n)) return String(v);
    return n.toLocaleString(undefined,{style:'currency',currency:'USD'});
  }

  function ensureAmountDueField(){
    if(document.getElementById('editAmountDue')) return;
    const contractDate=document.getElementById('editContractDate');
    if(!contractDate) return;
    const wrap=document.createElement('div');
    wrap.innerHTML='<label>Amount due</label><input id="editAmountDue" type="number" min="0" step="0.01" placeholder="Current balance owed">';
    contractDate.closest('div')?.insertAdjacentElement('afterend',wrap);
  }

  ensureAmountDueField();

  if(typeof card==='function'){
    const baseCard=card;
    card=function(j){
      const html=baseCard(j);
      const due=`<div class="job-meta"><b style="display:inline">Amount due:</b> ${esc(money(j.amount_due))}</div>`;
      return html.replace('<span class="job-badge',due+'<span class="job-badge');
    };
  }

  if(typeof openJob==='function'){
    const baseOpenJob=openJob;
    openJob=function(id){
      ensureAmountDueField();
      baseOpenJob(id);
      const j=jobs.find(x=>x.id===id);
      const input=document.getElementById('editAmountDue');
      if(input) input.value=(j?.amount_due??'');
    };
  }

  if(typeof saveJob==='function'){
    const baseSaveJob=saveJob;
    const btn=document.getElementById('saveJobBtn');
    if(btn){
      btn.onclick=async()=>{
        const id=document.getElementById('editJobId')?.value;
        const raw=document.getElementById('editAmountDue')?.value;
        const amountDue=raw===''?null:Number(raw);
        if(raw!==''&&!Number.isFinite(amountDue)) return notice('Enter a valid amount due.','error');
        const res=await db.from('jobs').update({amount_due:amountDue}).eq('id',id);
        if(res.error) return notice(res.error.message,'error');
        await baseSaveJob();
      };
    }
  }

  setTimeout(()=>{if(typeof renderAll==='function')renderAll();},400);
})();
