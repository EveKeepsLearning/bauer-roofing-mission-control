'use strict';
(function(){
  const $=id=>document.getElementById(id);
  const fmt=v=>Number(v||0).toLocaleString(undefined,{style:'currency',currency:'USD'});
  let currentPayments=[];

  function ensureUi(){
    if($('jobPaymentsSection')) return;
    const docSection=document.querySelector('#jobDialog .doc-section');
    if(!docSection) return;
    const section=document.createElement('section');
    section.id='jobPaymentsSection';
    section.className='doc-section';
    section.innerHTML=`<div class="doc-head"><div><h3>Payments</h3><div class="job-meta">Add as many payments as needed. Balance due updates automatically.</div></div><button class="btn primary small" type="button" id="addPaymentBtn">+ Add Payment</button></div><div id="jobPaymentSummary" class="job-meta" style="margin-bottom:10px"></div><div id="jobPaymentList" class="doc-list"></div>`;
    docSection.insertAdjacentElement('beforebegin',section);

    const dialog=document.createElement('dialog');
    dialog.id='paymentDialog';
    dialog.innerHTML=`<form method="dialog" class="card document-dialog"><h2 id="paymentDialogTitle">Add Payment</h2><input id="paymentId" type="hidden"><div class="form-grid"><div><label>Payment date</label><input id="paymentDate" type="date"></div><div><label>Amount</label><input id="paymentAmount" type="number" min="0" step="0.01" inputmode="decimal"></div><div><label>Payment type / milestone</label><select id="paymentType"><option>Deposit</option><option>Payment at Start</option><option>Progress Payment</option><option>Final Payment</option><option>Insurance Payment</option><option>Other</option></select></div><div><label>Payment method</label><select id="paymentMethod"><option value="">Select...</option><option>Check</option><option>Square</option><option>Credit Card</option><option>ACH</option><option>Cash</option><option>Insurance</option><option>Other</option></select></div><div class="wide"><label>Notes</label><textarea id="paymentNotes" rows="3"></textarea></div></div><div class="toolbar"><button class="btn primary" type="button" id="savePaymentBtn">Save Payment</button><button class="btn" value="cancel">Cancel</button></div></form>`;
    document.body.appendChild(dialog);
    $('addPaymentBtn').onclick=()=>openPayment();
    $('savePaymentBtn').onclick=savePayment;
    document.body.addEventListener('click',e=>{
      const edit=e.target.closest('[data-edit-payment]');
      if(edit){e.preventDefault();openPayment(currentPayments.find(p=>p.id===edit.dataset.editPayment));return;}
      const del=e.target.closest('[data-delete-payment]');
      if(del){e.preventDefault();deletePayment(del.dataset.deletePayment);}
    });
  }

  function refreshSummary(){
    ensureUi();
    const total=currentPayments.reduce((sum,p)=>sum+Number(p.amount||0),0);
    const contract=Number($('editContractAmount')?.value||0);
    const balance=Math.max(0,contract-total);
    if($('editTotalPaid')) $('editTotalPaid').value=fmt(total);
    if($('editBalanceDue')) $('editBalanceDue').value=fmt(balance);
    if($('jobPaymentSummary')) $('jobPaymentSummary').textContent=`Total paid: ${fmt(total)} • Balance due: ${fmt(balance)}`;
  }

  function renderPayments(){
    ensureUi();
    const box=$('jobPaymentList');
    if(!box) return;
    box.innerHTML=currentPayments.length?currentPayments.map(p=>`<div class="doc-row"><div><div class="doc-type">${p.payment_type||'Payment'}</div><div class="doc-notes">${p.payment_date||''}</div></div><div><b>${fmt(p.amount)}</b><div class="doc-notes">${p.payment_method||''}</div></div><div class="doc-notes">${p.notes||''}</div><div></div><div class="doc-actions"><button class="btn small" type="button" data-edit-payment="${p.id}">Edit</button><button class="btn small" type="button" data-delete-payment="${p.id}">Delete</button></div></div>`).join(''):'<div class="empty">No payments recorded yet.</div>';
    refreshSummary();
  }

  async function loadForJob(jobId){
    ensureUi();
    if(!jobId) return;
    const {data,error}=await db.from('job_payments').select('*').eq('job_id',jobId).order('payment_date',{ascending:true}).order('created_at',{ascending:true});
    if(error){if(typeof notice==='function') notice(error.message,'error');return;}
    currentPayments=data||[];
    renderPayments();
  }

  function openPayment(p=null){
    ensureUi();
    const x=p||{};
    $('paymentDialogTitle').textContent=p?'Edit Payment':'Add Payment';
    $('paymentId').value=x.id||'';
    $('paymentDate').value=x.payment_date||new Date().toLocaleDateString('en-CA');
    $('paymentAmount').value=x.amount??'';
    $('paymentType').value=x.payment_type||'Deposit';
    $('paymentMethod').value=x.payment_method||'';
    $('paymentNotes').value=x.notes||'';
    $('paymentDialog').showModal();
  }

  async function syncJobStage(jobId){
    const res=await db.from('jobs').select('stage,deposit_status').eq('id',jobId).single();
    if(res.error) return null;
    const localJob=typeof jobs!=='undefined'?jobs.find(j=>j.id===jobId):null;
    if(localJob){localJob.stage=res.data.stage;localJob.deposit_status=res.data.deposit_status;}
    if($('editStage')) $('editStage').value=res.data.stage||'Awarded';
    if(typeof renderAll==='function') renderAll();
    return res.data;
  }

  async function savePayment(){
    const jobId=$('editJobId')?.value,id=$('paymentId').value;
    if(!jobId) return;
    const amount=Number($('paymentAmount').value||0);
    if(!(amount>0)){if(typeof notice==='function') notice('Payment amount must be greater than zero.','error');return;}
    const paymentType=$('paymentType').value||'Payment';
    const row={job_id:jobId,payment_date:$('paymentDate').value||null,payment_type:paymentType,amount,payment_method:$('paymentMethod').value||null,notes:$('paymentNotes').value.trim()||null,updated_at:new Date().toISOString()};
    let res;
    if(id) res=await db.from('job_payments').update(row).eq('id',id).select('*').single();
    else res=await db.from('job_payments').insert(row).select('*').single();
    if(res.error){if(typeof notice==='function') notice(res.error.message,'error');return;}
    $('paymentDialog').close();
    await loadForJob(jobId);
    const stageState=await syncJobStage(jobId);
    window.dispatchEvent(new CustomEvent('bro:payments-changed',{detail:{jobId}}));
    const moved=stageState?.stage==='Contract / Deposit';
    const paidInFull=stageState?.deposit_status==='Paid in Full';
    if(typeof notice==='function') notice(paidInFull?'Payment saved. Job is paid in full.':(moved?'Payment saved. Job is in Contract / Deposit.':(id?'Payment updated.':'Payment added.')),'success');
  }

  async function deletePayment(id){
    const p=currentPayments.find(x=>x.id===id);if(!p)return;
    if(!confirm(`Delete this ${fmt(p.amount)} payment record?`))return;
    const jobId=$('editJobId')?.value;
    const {error}=await db.from('job_payments').delete().eq('id',id);
    if(error){if(typeof notice==='function') notice(error.message,'error');return;}
    await loadForJob(jobId);
    await syncJobStage(jobId);
    window.dispatchEvent(new CustomEvent('bro:payments-changed',{detail:{jobId}}));
    if(typeof notice==='function') notice('Payment removed.','success');
  }

  ensureUi();
  window.BRO_PAYMENTS={loadForJob,refreshSummary};
  const originalOpen=typeof openJob==='function'?openJob:null;
  if(originalOpen){openJob=function(id){const r=originalOpen(id);loadForJob(id);return r;};}
  const current=$('editJobId')?.value;if(current)loadForJob(current);
})();
