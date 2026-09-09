'use strict';
(function(){
  const $=id=>document.getElementById(id);
  const fmt=v=>Number(v||0).toLocaleString(undefined,{style:'currency',currency:'USD'});
  let currentAddendums=[];
  let currentPayments=[];
  let currentJobId=null;
  let installed=false;

  function approvedAddendumTotal(){
    return currentAddendums.filter(a=>String(a.status||'').toLowerCase()==='approved').reduce((sum,a)=>sum+Number(a.amount||0),0);
  }
  function paymentTotal(){return currentPayments.reduce((sum,p)=>sum+Number(p.amount||0),0);}
  function currentJob(){return typeof jobs!=='undefined'?jobs.find(j=>j.id===currentJobId):null;}
  function contractAmount(){const input=$('editContractAmount');if(input&&input.value!=='')return Number(input.value||0);return Number(currentJob()?.contract_amount||0);}
  function adjustedContract(){return contractAmount()+approvedAddendumTotal();}
  function balanceDue(){return Math.max(0,adjustedContract()-paymentTotal());}

  function showAddendumNotice(text,type='error'){
    const n=$('addendumDialogNotice');
    if(!n)return;
    n.textContent=text||'';
    n.className=text?`notice ${type}`:'notice hidden';
  }

  function ensureFinancialRows(){
    const balance=$('editBalanceDue');
    if(!balance||$('editAdjustedContract')) return;
    const balanceWrap=balance.closest('div');
    if(!balanceWrap) return;
    const addendumWrap=document.createElement('div');
    addendumWrap.innerHTML='<label>Approved addendums</label><input id="editApprovedAddendums" type="text" readonly style="font-weight:800;background:#eef3f8">';
    const adjustedWrap=document.createElement('div');
    adjustedWrap.innerHTML='<label>Adjusted contract amount</label><input id="editAdjustedContract" type="text" readonly style="font-weight:800;background:#eef3f8">';
    balanceWrap.insertAdjacentElement('beforebegin',addendumWrap);
    balanceWrap.insertAdjacentElement('beforebegin',adjustedWrap);
  }

  function refreshFinancialSummary(){
    ensureFinancialRows();
    if($('editApprovedAddendums')) $('editApprovedAddendums').value=fmt(approvedAddendumTotal());
    if($('editAdjustedContract')) $('editAdjustedContract').value=fmt(adjustedContract());
    if($('editTotalPaid')) $('editTotalPaid').value=fmt(paymentTotal());
    if($('editBalanceDue')) $('editBalanceDue').value=fmt(balanceDue());
    const paymentSummary=$('jobPaymentSummary');
    if(paymentSummary) paymentSummary.textContent=`Total paid: ${fmt(paymentTotal())} • Balance due: ${fmt(balanceDue())}`;
  }

  function ensureUi(){
    if($('jobAddendumsSection')) return;
    const payments=$('jobPaymentsSection');
    const docs=document.querySelector('#jobDialog .doc-section');
    const anchor=payments||docs;
    if(!anchor) return;
    const section=document.createElement('section');
    section.id='jobAddendumsSection';
    section.className='doc-section';
    section.innerHTML=`<div class="doc-head"><div><h3>Contract Addendums</h3><div class="job-meta">Approved addendums automatically change the adjusted contract amount and balance due.</div></div><button class="btn primary small" type="button" id="addAddendumBtn">+ Add Addendum</button></div><div id="jobAddendumSummary" class="job-meta" style="margin-bottom:10px"></div><div id="jobAddendumList" class="doc-list"></div>`;
    anchor.insertAdjacentElement('beforebegin',section);

    const dialog=document.createElement('dialog');
    dialog.id='addendumDialog';
    dialog.innerHTML=`<form method="dialog" class="card document-dialog"><h2 id="addendumDialogTitle">Add Contract Addendum</h2><div id="addendumDialogNotice" class="notice hidden" style="margin-bottom:10px"></div><input id="addendumId" type="hidden"><div class="form-grid"><div><label>Addendum date</label><input id="addendumDate" type="date"></div><div><label>Status</label><select id="addendumStatus"><option>Approved</option><option>Awaiting Signature</option><option>Draft</option><option>Rejected / Void</option></select></div><div class="wide"><label>Description / scope change</label><input id="addendumDescription" placeholder="Example: Add 4 sheets of decking"></div><div><label>Amount added or deducted</label><input id="addendumAmount" type="number" step="0.01" inputmode="decimal" placeholder="Use a negative number for a credit"></div><div></div><div class="wide"><label>OneDrive link</label><input id="addendumUrl" type="url" placeholder="Optional link to signed addendum"></div><div class="wide"><label>Notes</label><textarea id="addendumNotes" rows="3"></textarea></div></div><div class="toolbar"><button class="btn primary" type="button" id="saveAddendumBtn">Save Addendum</button><button class="btn" value="cancel">Cancel</button></div></form>`;
    document.body.appendChild(dialog);
    $('addAddendumBtn').onclick=()=>openAddendum();
    $('saveAddendumBtn').onclick=saveAddendum;
    document.body.addEventListener('click',e=>{
      const edit=e.target.closest('[data-edit-addendum]');
      if(edit){e.preventDefault();e.stopPropagation();openAddendum(currentAddendums.find(a=>a.id===edit.dataset.editAddendum));return;}
      const del=e.target.closest('[data-delete-addendum]');
      if(del){e.preventDefault();e.stopPropagation();deleteAddendum(del.dataset.deleteAddendum);}
    });
    $('editContractAmount')?.addEventListener('input',refreshFinancialSummary);
  }

  function renderAddendums(){
    ensureUi();
    const box=$('jobAddendumList');
    if(!box) return;
    box.innerHTML=currentAddendums.length?currentAddendums.map(a=>`<div class="doc-row"><div><div class="doc-type">${esc(a.status||'')}</div><div class="doc-notes">${esc(a.addendum_date||'')}</div></div><div><b>${esc(a.description||'')}</b><div class="doc-notes">${esc(a.notes||'')}</div></div><div><b>${esc(fmt(a.amount))}</b></div><div class="doc-notes">${a.onedrive_url?`<a href="${esc(a.onedrive_url)}" target="_blank" rel="noopener noreferrer">Open document</a>`:''}</div><div class="doc-actions"><button class="btn small" type="button" data-edit-addendum="${esc(a.id)}">Edit</button><button class="btn small" type="button" data-delete-addendum="${esc(a.id)}">Delete</button></div></div>`).join(''):'<div class="empty">No contract addendums.</div>';
    if($('jobAddendumSummary')) $('jobAddendumSummary').textContent=`Approved addendums: ${fmt(approvedAddendumTotal())} • Adjusted contract: ${fmt(adjustedContract())}`;
    refreshFinancialSummary();
  }

  async function loadFinancialDetails(jobId){
    currentJobId=jobId;
    ensureUi();
    const [aRes,pRes]=await Promise.all([
      db.from('job_contract_addendums').select('*').eq('job_id',jobId).order('addendum_date',{ascending:true}).order('created_at',{ascending:true}),
      db.from('job_payments').select('*').eq('job_id',jobId).order('payment_date',{ascending:true}).order('created_at',{ascending:true})
    ]);
    if(aRes.error){if(typeof notice==='function')notice(aRes.error.message,'error');return;}
    if(pRes.error){if(typeof notice==='function')notice(pRes.error.message,'error');return;}
    currentAddendums=aRes.data||[];
    currentPayments=pRes.data||[];
    renderAddendums();
  }

  function openAddendum(a=null){
    ensureUi();
    showAddendumNotice('');
    const x=a||{};
    $('addendumDialogTitle').textContent=a?'Edit Contract Addendum':'Add Contract Addendum';
    $('addendumId').value=x.id||'';
    $('addendumDate').value=x.addendum_date||new Date().toLocaleDateString('en-CA');
    $('addendumStatus').value=x.status||'Approved';
    $('addendumDescription').value=x.description||'';
    $('addendumAmount').value=x.amount??'';
    $('addendumUrl').value=x.onedrive_url||'';
    $('addendumNotes').value=x.notes||'';
    $('addendumDialog').showModal();
  }

  async function saveAddendum(){
    const btn=$('saveAddendumBtn');
    showAddendumNotice('');
    const id=$('addendumId').value;
    const description=$('addendumDescription').value.trim();
    if(!currentJobId){showAddendumNotice('This addendum is not connected to a job. Close it and reopen the job.');return;}
    if(!description){showAddendumNotice('Addendum description is required.');return;}
    const amount=Number($('addendumAmount').value||0);
    if(!Number.isFinite(amount)){showAddendumNotice('Enter a valid addendum amount.');return;}
    const {data:authData,error:authError}=await db.auth.getUser();
    if(authError||!authData?.user?.id){showAddendumNotice('Your login session could not be verified. Refresh BRO and try again.');return;}
    const row={job_id:currentJobId,addendum_date:$('addendumDate').value||null,description,amount,status:$('addendumStatus').value||'Approved',onedrive_url:$('addendumUrl').value.trim()||null,notes:$('addendumNotes').value.trim()||null,updated_at:new Date().toISOString()};
    if(!id) row.owner_id=authData.user.id;
    btn.disabled=true;btn.textContent='Saving…';
    try{
      let res;
      if(id) res=await db.from('job_contract_addendums').update(row).eq('id',id).select('*').single();
      else res=await db.from('job_contract_addendums').insert(row).select('*').single();
      if(res.error){showAddendumNotice(res.error.message);return;}
      $('addendumDialog').close();
      await loadFinancialDetails(currentJobId);
      if(typeof notice==='function')notice(id?'Addendum updated.':'Addendum added.','success');
      await refreshCardBalances();
    }finally{btn.disabled=false;btn.textContent='Save Addendum';}
  }

  async function deleteAddendum(id){
    const a=currentAddendums.find(x=>x.id===id);if(!a)return;
    if(!confirm(`Delete this ${fmt(a.amount)} addendum record?`))return;
    const {error}=await db.from('job_contract_addendums').delete().eq('id',id);
    if(error){if(typeof notice==='function')notice(error.message,'error');return;}
    await loadFinancialDetails(currentJobId);
    if(typeof notice==='function')notice('Addendum removed.','success');
    await refreshCardBalances();
  }

  const cardBalances=new Map();
  async function refreshCardBalances(){
    if(typeof jobs==='undefined'||!jobs.length) return;
    const ids=jobs.map(j=>j.id);
    const [pRes,aRes]=await Promise.all([
      db.from('job_payments').select('job_id,amount').in('job_id',ids),
      db.from('job_contract_addendums').select('job_id,amount,status').in('job_id',ids)
    ]);
    if(pRes.error||aRes.error) return;
    const paid=new Map(),adds=new Map();
    (pRes.data||[]).forEach(p=>paid.set(p.job_id,Number(paid.get(p.job_id)||0)+Number(p.amount||0)));
    (aRes.data||[]).forEach(a=>{if(String(a.status||'').toLowerCase()==='approved')adds.set(a.job_id,Number(adds.get(a.job_id)||0)+Number(a.amount||0));});
    cardBalances.clear();
    jobs.forEach(j=>{
      if(j.contract_amount===null||j.contract_amount===undefined||j.contract_amount==='') cardBalances.set(j.id,null);
      else cardBalances.set(j.id,Math.max(0,Number(j.contract_amount||0)+Number(adds.get(j.id)||0)-Number(paid.get(j.id)||0)));
    });
    if(typeof renderAll==='function')renderAll();
  }

  function installCard(){
    if(installed||typeof card!=='function') return;
    installed=true;
    const baseCard=card;
    card=function(j){
      const html=baseCard(j);
      const val=cardBalances.get(j.id);
      const label=val===null||val===undefined?'Not entered':fmt(val);
      const due=`<div class="job-meta"><b style="display:inline">Balance due:</b> ${esc(label)}</div>`;
      return html.replace('<span class="job-badge',due+'<span class="job-badge');
    };
    refreshCardBalances();
  }

  window.addEventListener('bro:payments-changed',async e=>{
    const jobId=e.detail?.jobId;
    if(jobId&&jobId===currentJobId) await loadFinancialDetails(jobId);
    await refreshCardBalances();
  });

  ensureUi();
  installCard();
  if(typeof openJob==='function'){
    const baseOpen=openJob;
    openJob=function(id){const r=baseOpen(id);setTimeout(()=>loadFinancialDetails(id),0);return r;};
  }
  setTimeout(installCard,200);
  setTimeout(refreshCardBalances,500);
})();
