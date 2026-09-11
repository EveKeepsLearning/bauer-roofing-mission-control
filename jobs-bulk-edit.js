'use strict';
(function(){
  if(window.__broBulkJobEditLoaded)return;
  window.__broBulkJobEditLoaded=true;

  const STAGE_OPTIONS=['Awarded','Deposit','Material Ordered','Ready to Schedule','Scheduled','Material Delivered','In Production','Work Complete','Final Payment / Closeout'];
  const STAGE_ORDER={awarded:1,contract:2,material:3,ready:4,scheduled:5,delivered:6,production:7,complete:8,closeout:9};
  const dirty=new Map();

  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function isoDate(v){return String(v||'').slice(0,10);}
  function stageText(j){return typeof stageLabel==='function'?stageLabel(j):(j.stage||'Awarded');}
  function normalizedStage(j){const s=stageText(j);return s==='Contract / Deposit'?'Deposit':s;}
  function stageNum(j){const key=typeof stageKey==='function'?stageKey(j):'';return STAGE_ORDER[key]||99;}
  function nextNum(j){const n=stageNum(j);return n===99?99:Math.min(9,n+1);}
  function numberedStage(j){const n=stageNum(j);return n===99?normalizedStage(j):`${n}. ${normalizedStage(j)}`;}
  function numberedNext(j){const label=typeof nextStep==='function'?nextStep(j):'';const n=nextNum(j);return n===99?label:`${n}. ${label}`;}
  function kindClass(j){const raw=String((typeof jobType==='function'?jobType(j):(j.job_type||j.primary_category||''))||'').toLowerCase();if(raw.includes('repair'))return'bro-repair';if(raw.includes('reroof')||raw.includes('re-roof')||raw.includes('re roof'))return'bro-reroof';return'';}
  function docsFor(j){if(typeof documents==='undefined')return[];return documents.filter(d=>d.job_id===j.id).sort((a,b)=>String(b.document_date||b.created_at||'').localeCompare(String(a.document_date||a.created_at||'')));}
  function paymentSummary(j){const amount=Number(j.amount_due);if(Number.isFinite(amount))return `Balance ${amount.toLocaleString(undefined,{style:'currency',currency:'USD',minimumFractionDigits:2})}`;return'Add / view payment';}

  function installStyles(){
    if(document.getElementById('broBulkJobEditStyles'))return;
    const s=document.createElement('style');s.id='broBulkJobEditStyles';s.textContent=`
      .bulk-edit-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;background:#fff;border:1px solid #dfe5ec;border-radius:10px;margin-bottom:8px;position:sticky;top:42px;z-index:7;box-shadow:0 2px 8px rgba(31,48,72,.06)}
      .bulk-edit-bar .bulk-status{font-size:12px;color:#687588;margin-right:auto}.bulk-save{font-weight:700}
      .jobs-table.bulk-edit-table{min-width:2050px}.jobs-table.bulk-edit-table td{vertical-align:middle;padding:6px 8px}.jobs-table.bulk-edit-table input,.jobs-table.bulk-edit-table select{width:100%;min-width:115px;margin:0;padding:7px 8px;font-size:13px;background:#fff}
      .jobs-table.bulk-edit-table .col-job{min-width:92px}.jobs-table.bulk-edit-table .col-customer{min-width:210px}.jobs-table.bulk-edit-table .col-stage{min-width:185px}.jobs-table.bulk-edit-table .col-installer{min-width:125px}.jobs-table.bulk-edit-table .col-next{min-width:230px}.jobs-table.bulk-edit-table .col-files{min-width:260px}.jobs-table.bulk-edit-table tr.bro-dirty{box-shadow:inset 0 0 0 2px #d59b23}.jobs-table.bulk-edit-table tr.bro-saving{opacity:.65}.jobs-table.bulk-edit-table .payment-cell{white-space:nowrap}.jobs-table.bulk-edit-table button{padding:6px 9px}.bulk-file-links{display:flex;gap:5px;align-items:center;flex-wrap:wrap}.bulk-file-link{display:inline-block;max-width:155px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.bulk-file-more{font-size:11px;color:#687588}.bulk-readonly{font-size:12px;color:#536176}
    `;document.head.appendChild(s);
  }

  function ensureToolbar(){
    const tableView=document.getElementById('tableView');if(!tableView)return;
    let bar=document.getElementById('bulkEditBar');
    if(!bar){bar=document.createElement('div');bar.id='bulkEditBar';bar.className='bulk-edit-bar';bar.innerHTML='<b>Quick Edit Jobs</b><span class="bulk-status" id="bulkEditStatus">Edit several rows, then save them together.</span><button class="btn" type="button" id="bulkRevertBtn">Revert changes</button><button class="btn primary bulk-save" type="button" id="bulkSaveBtn">Save all changes</button>';const wrap=document.getElementById('jobsTableWrap');tableView.insertBefore(bar,wrap);document.getElementById('bulkSaveBtn').onclick=saveAll;document.getElementById('bulkRevertBtn').onclick=()=>{dirty.clear();renderEditableTable();updateStatus();};}
    document.querySelector('.jobs-table')?.classList.add('bulk-edit-table');
  }

  function ensureHeaders(){
    const head=document.querySelector('.jobs-table thead');if(!head)return;
    head.innerHTML='<tr><th data-bulk-sort="job">Job #</th><th data-bulk-sort="customer">Customer</th><th data-bulk-sort="type">Type</th><th data-bulk-sort="stage">Production stage</th><th data-bulk-sort="start">Start work</th><th>Complete work</th><th data-bulk-sort="installer">Installer</th><th>Customer update due</th><th>Payments</th><th>Files</th><th data-bulk-sort="next">Next step</th></tr>';
    head.querySelectorAll('[data-bulk-sort]').forEach(th=>{const key=th.dataset.bulkSort;th.style.cursor='pointer';th.title='Click to sort';if(typeof tableSort!=='undefined'&&tableSort.key===key)th.textContent+=tableSort.dir==='desc'?' ▼':' ▲';else th.textContent+=' ↕';th.onclick=()=>{if(typeof tableSort==='undefined')return;if(tableSort.key===key)tableSort.dir=tableSort.dir==='asc'?'desc':'asc';else tableSort={key,dir:'asc'};renderEditableTable();};});
  }

  function sortRows(rows){
    if(typeof tableSort==='undefined'||!tableSort.key)return rows;
    const dir=tableSort.dir==='desc'?-1:1;
    const value=(j,key)=>{if(key==='job')return j.job_number||'';if(key==='customer')return j.customer_name||'';if(key==='type')return typeof jobType==='function'?jobType(j):(j.job_type||j.primary_category||'');if(key==='stage')return stageNum(j);if(key==='start')return j.confirmed_start_date||j.target_start_date||'';if(key==='installer')return j.installer||'';if(key==='next')return nextNum(j);return'';};
    return [...rows].sort((a,b)=>{const av=value(a,tableSort.key),bv=value(b,tableSort.key);if(av===''&&bv==='')return 0;if(av==='')return 1;if(bv==='')return-1;if(typeof av==='number'&&typeof bv==='number')return(av-bv)*dir;return String(av).localeCompare(String(bv),undefined,{numeric:true,sensitivity:'base'})*dir;});
  }

  function markDirty(jobId,field,value,row){const patch=dirty.get(jobId)||{};patch[field]=value||null;dirty.set(jobId,patch);row?.classList.add('bro-dirty');updateStatus();}
  function updateStatus(msg){const el=document.getElementById('bulkEditStatus');if(!el)return;el.textContent=msg||`${dirty.size} job${dirty.size===1?'':'s'} changed${dirty.size?' — ready to save.':' — edit several rows, then save them together.'}`;}

  function fileCell(j){const docs=docsFor(j);const links=docs.slice(0,2).map(d=>`<a class="bulk-file-link" href="${esc(d.onedrive_url||'#')}" target="_blank" rel="noopener noreferrer" title="${esc(d.file_name||d.document_type||'File')}">${esc(d.document_type||d.file_name||'File')}</a>`).join('');return `<div class="bulk-file-links">${links}${docs.length>2?`<span class="bulk-file-more">+${docs.length-2} more</span>`:''}<button class="btn small" type="button" data-bulk-file>+ File</button></div>`;}

  function renderEditableTable(){
    ensureToolbar();ensureHeaders();
    const body=document.getElementById('jobsTableBody');if(!body)return;
    const rows=typeof filtered==='function'?sortRows(filtered()):[];
    body.innerHTML=rows.length?rows.map(j=>{
      const pending=dirty.get(j.id)||{};
      const stage=pending.stage??normalizedStage(j);
      const start=pending.confirmed_start_date??isoDate(j.confirmed_start_date||j.target_start_date);
      const finish=pending.completion_date??isoDate(j.completion_date||j.production_finished_date);
      const installer=pending.installer??(j.installer||'');
      const comm=pending.client_communication_due_date??isoDate(j.client_communication_due_date);
      return `<tr data-job-id="${esc(j.id)}" class="${kindClass(j)}${dirty.has(j.id)?' bro-dirty':''}"><td class="col-job"><b>${esc(j.job_number||'')}</b></td><td class="col-customer">${esc(j.customer_name||'')}</td><td>${esc(typeof jobType==='function'?jobType(j):(j.job_type||''))}</td><td class="col-stage"><select data-bulk-field="stage">${STAGE_OPTIONS.map(x=>`<option${x===stage?' selected':''}>${x}</option>`).join('')}</select><div class="job-meta">${esc(numberedStage(j))}</div></td><td><input type="date" data-bulk-field="confirmed_start_date" value="${esc(start)}"></td><td><input type="date" data-bulk-field="completion_date" value="${esc(finish)}"></td><td class="col-installer"><input data-bulk-field="installer" value="${esc(installer)}" placeholder="Installer"></td><td><input type="date" data-bulk-field="client_communication_due_date" value="${esc(comm)}"></td><td class="payment-cell"><button class="btn small" type="button" data-bulk-payment>${esc(paymentSummary(j))}</button></td><td class="col-files">${fileCell(j)}</td><td class="col-next"><span class="bulk-readonly">${esc(numberedNext(j))}</span></td></tr>`;
    }).join(''):'<tr><td colspan="11" class="empty">No active jobs match.</td></tr>';

    body.querySelectorAll('[data-bulk-field]').forEach(input=>input.addEventListener('change',e=>{const row=e.target.closest('tr[data-job-id]');if(!row)return;markDirty(row.dataset.jobId,e.target.dataset.bulkField,e.target.value,row);}));
    body.querySelectorAll('[data-bulk-payment]').forEach(btn=>btn.onclick=async e=>{e.stopPropagation();const id=btn.closest('tr[data-job-id]')?.dataset.jobId;if(!id)return;if(window.BRO_PAYMENTS?.openPaymentForJob){await window.BRO_PAYMENTS.openPaymentForJob(id);}else if(typeof openJob==='function'){openJob(id);setTimeout(()=>document.getElementById('addPaymentBtn')?.click(),200);}});
    body.querySelectorAll('[data-bulk-file]').forEach(btn=>btn.onclick=e=>{e.stopPropagation();const id=btn.closest('tr[data-job-id]')?.dataset.jobId;const j=typeof jobs!=='undefined'?jobs.find(x=>x.id===id):null;if(!j)return;const idInput=document.getElementById('editJobId');const addr=document.getElementById('editAddress');if(idInput)idInput.value=id;if(addr)addr.value=j.property_address||'';if(typeof openDocumentDialog==='function')openDocumentDialog();});
    updateStatus();
  }

  async function saveAll(){
    if(!dirty.size){updateStatus('No unsaved changes.');return;}
    const btn=document.getElementById('bulkSaveBtn');if(btn){btn.disabled=true;btn.textContent='Saving...';}
    let saved=0,failed=0;
    for(const [id,patch0] of [...dirty.entries()]){
      const row=document.querySelector(`tr[data-job-id="${CSS.escape(id)}"]`);row?.classList.add('bro-saving');
      const patch={...patch0,updated_at:new Date().toISOString(),production_last_update_at:new Date().toISOString(),production_last_update_by:'Eve'};
      const res=await db.from('jobs').update(patch).eq('id',id).select('*').single();row?.classList.remove('bro-saving');
      if(res.error){failed++;row?.classList.add('bro-dirty');continue;}
      const idx=jobs.findIndex(j=>j.id===id);if(idx>=0)jobs[idx]=res.data;dirty.delete(id);saved++;
    }
    if(btn){btn.disabled=false;btn.textContent='Save all changes';}
    if(typeof renderAll==='function')renderAll();
    updateStatus(failed?`${saved} saved; ${failed} could not be saved.`:`${saved} job${saved===1?'':'s'} saved.`);
    if(typeof notice==='function')notice(failed?'Some quick edits could not be saved.':'Job updates saved.',failed?'error':'success');
  }

  function install(){
    installStyles();ensureToolbar();
    if(typeof renderTable==='function'&&!window.__broBulkRenderWrapped){window.__broBulkRenderWrapped=true;renderTable=renderEditableTable;}
    const table=document.querySelector('.jobs-table');if(table&&!table.dataset.broBulkOpen){table.dataset.broBulkOpen='1';table.addEventListener('dblclick',e=>{if(e.target.closest('input,select,button,a'))return;const row=e.target.closest('tr[data-job-id]');if(row&&typeof openJob==='function')openJob(row.dataset.jobId);});}
    if(typeof saveDocument==='function'&&!window.__broBulkSaveDocumentWrapped){window.__broBulkSaveDocumentWrapped=true;const base=saveDocument;saveDocument=async function(){const r=await base();setTimeout(renderEditableTable,0);return r;};}
    if(typeof deleteDocument==='function'&&!window.__broBulkDeleteDocumentWrapped){window.__broBulkDeleteDocumentWrapped=true;const base=deleteDocument;deleteDocument=async function(id){const r=await base(id);setTimeout(renderEditableTable,0);return r;};}
    renderEditableTable();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,500),{once:true});else setTimeout(install,500);
})();
