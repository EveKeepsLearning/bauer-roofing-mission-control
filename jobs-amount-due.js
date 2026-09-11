'use strict';
(() => {
  function money(v){
    if(v===null||v===undefined||v==='') return 'Not entered';
    const n=Number(v);
    if(!Number.isFinite(n)) return String(v);
    return n.toLocaleString(undefined,{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2});
  }

  function ensureAmountDueField(){
    if(document.getElementById('editAmountDue')) return;
    const contractDate=document.getElementById('editContractDate');
    if(!contractDate) return;
    const wrap=document.createElement('div');
    wrap.innerHTML='<label>Amount due</label><input id="editAmountDue" type="text" readonly style="font-weight:800;background:#eef3f8" placeholder="$0.00">';
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
      const result=baseOpenJob(id);
      const j=jobs.find(x=>x.id===id);
      const input=document.getElementById('editAmountDue');
      if(input) input.value=(j?.amount_due===null||j?.amount_due===undefined)?'':money(j.amount_due);
      return result;
    };
  }

  window.addEventListener('bro:payments-changed',()=>{
    const id=document.getElementById('editJobId')?.value;
    const j=typeof jobs!=='undefined'?jobs.find(x=>x.id===id):null;
    const input=document.getElementById('editAmountDue');
    if(input&&j)input.value=money(j.amount_due);
  });

  setTimeout(()=>{if(typeof renderAll==='function')renderAll();},400);
})();
