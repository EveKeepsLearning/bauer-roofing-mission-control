'use strict';
(function(){
  const $=id=>document.getElementById(id);
  const fmt=v=>Number.isFinite(Number(v))?Number(v).toLocaleString(undefined,{style:'currency',currency:'USD'}):'$0.00';

  function installFields(){
    if($('editEstimatePrice')) return;
    const grid=document.querySelector('#jobDialog .form-grid');
    if(!grid) return;
    const stage=$('editStage')?.parentElement;
    if(!stage) return;
    const wrap=document.createElement('div');
    wrap.className='wide';
    wrap.innerHTML=`<div style="border:1px solid #dfe5ec;border-radius:10px;padding:12px;background:#f8fbff"><div style="font-weight:800;margin-bottom:9px">Job Financials</div><div class="form-grid"><div><label>Estimate / quoted price</label><input id="editEstimatePrice" type="number" min="0" step="0.01" inputmode="decimal"></div><div><label>Contract amount</label><input id="editContractAmount" type="number" min="0" step="0.01" inputmode="decimal"></div><div><label>Total paid</label><input id="editTotalPaid" type="text" readonly style="font-weight:800;background:#eef3f8"></div><div><label>Balance due</label><input id="editBalanceDue" type="text" readonly style="font-weight:800;background:#eef3f8"></div></div></div>`;
    stage.insertAdjacentElement('afterend',wrap);
    $('editContractAmount').addEventListener('input',()=>window.BRO_PAYMENTS?.refreshSummary?.());
  }

  function fillFinancials(j){
    installFields();
    if(!j) return;
    $('editEstimatePrice').value=j.estimate_price??'';
    $('editContractAmount').value=j.contract_amount??'';
    if($('editTotalPaid')) $('editTotalPaid').value=fmt(0);
    if($('editBalanceDue')) $('editBalanceDue').value=fmt(Number(j.contract_amount||0));
    window.BRO_PAYMENTS?.loadForJob?.(j.id);
  }

  async function saveFinancials(){
    const id=$('editJobId')?.value;
    if(!id) return true;
    const val=id=>{const raw=$(id)?.value;return raw===''||raw==null?null:Number(raw);};
    const patch={estimate_price:val('editEstimatePrice'),contract_amount:val('editContractAmount'),updated_at:new Date().toISOString()};
    const {error}=await db.from('jobs').update(patch).eq('id',id);
    if(error){if(typeof notice==='function') notice(error.message,'error');return false;}
    return true;
  }

  installFields();
  if(typeof openJob==='function'){
    const originalOpenJob=openJob;
    openJob=function(id){const result=originalOpenJob(id);const j=typeof jobs!=='undefined'?jobs.find(x=>x.id===id):null;fillFinancials(j);return result;};
  }
  const saveBtn=$('saveJobBtn');
  if(saveBtn && typeof saveJob==='function'){
    const originalSaveJob=saveJob;
    saveBtn.onclick=async()=>{const ok=await saveFinancials();if(ok) await originalSaveJob();};
  }
  const currentId=$('editJobId')?.value;
  if(currentId && typeof jobs!=='undefined') fillFinancials(jobs.find(x=>x.id===currentId));
})();
