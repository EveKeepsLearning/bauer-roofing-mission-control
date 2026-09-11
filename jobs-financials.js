'use strict';
(function(){
  const $=id=>document.getElementById(id);
  const fmt=v=>Number.isFinite(Number(v))?Number(v).toLocaleString(undefined,{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}):'$0.00';
  const parseMoney=v=>{const raw=String(v??'').replace(/[$,\s]/g,'');if(raw==='')return null;const n=Number(raw);return Number.isFinite(n)?n:null;};
  const wireMoneyInput=input=>{
    if(!input||input.dataset.broMoneyReady)return;
    input.dataset.broMoneyReady='1';
    input.type='text';input.inputMode='decimal';
    input.addEventListener('focus',()=>{const n=parseMoney(input.value);input.value=n==null?'':n.toFixed(2);input.select();});
    input.addEventListener('blur',()=>{const n=parseMoney(input.value);input.value=n==null?'':fmt(n);});
  };
  const setMoney=(id,v)=>{const input=$(id);if(!input)return;wireMoneyInput(input);input.value=(v===null||v===undefined||v==='')?'':fmt(v);};

  function installFields(){
    if($('editEstimatePrice')){wireMoneyInput($('editEstimatePrice'));wireMoneyInput($('editContractAmount'));return;}
    const grid=document.querySelector('#jobDialog .form-grid');
    if(!grid) return;
    const stage=$('editStage')?.parentElement;
    if(!stage) return;
    const wrap=document.createElement('div');
    wrap.className='wide';
    wrap.innerHTML=`<div style="border:1px solid #dfe5ec;border-radius:10px;padding:12px;background:#f8fbff"><div style="font-weight:800;margin-bottom:9px">Job Financials</div><div class="form-grid"><div><label>Estimate / quoted price</label><input id="editEstimatePrice" type="text" inputmode="decimal" placeholder="$0.00"></div><div><label>Contract amount</label><input id="editContractAmount" type="text" inputmode="decimal" placeholder="$0.00"></div><div><label>Total paid</label><input id="editTotalPaid" type="text" readonly style="font-weight:800;background:#eef3f8"></div><div><label>Balance due</label><input id="editBalanceDue" type="text" readonly style="font-weight:800;background:#eef3f8"></div></div></div>`;
    stage.insertAdjacentElement('afterend',wrap);
    wireMoneyInput($('editEstimatePrice'));wireMoneyInput($('editContractAmount'));
    $('editContractAmount').addEventListener('input',()=>window.BRO_PAYMENTS?.refreshSummary?.());
    $('editContractAmount').addEventListener('blur',()=>window.BRO_PAYMENTS?.refreshSummary?.());
  }

  function fillFinancials(j){
    installFields();
    if(!j) return;
    setMoney('editEstimatePrice',j.estimate_price);
    setMoney('editContractAmount',j.contract_amount);
    if($('editTotalPaid')) $('editTotalPaid').value=fmt(0);
    if($('editBalanceDue')) $('editBalanceDue').value=fmt(Number(j.contract_amount||0));
    window.BRO_PAYMENTS?.loadForJob?.(j.id);
  }

  async function saveFinancials(){
    const id=$('editJobId')?.value;
    if(!id) return true;
    const estimate=parseMoney($('editEstimatePrice')?.value),contract=parseMoney($('editContractAmount')?.value);
    if($('editEstimatePrice')?.value.trim()&&estimate==null){notice?.('Enter a valid estimate amount.','error');return false;}
    if($('editContractAmount')?.value.trim()&&contract==null){notice?.('Enter a valid contract amount.','error');return false;}
    const patch={estimate_price:estimate,contract_amount:contract,updated_at:new Date().toISOString()};
    const {error}=await db.from('jobs').update(patch).eq('id',id);
    if(error){if(typeof notice==='function') notice(error.message,'error');return false;}
    await window.BRO_PAYMENTS?.syncBalance?.();
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
