'use strict';
(function(){
  if(window.__broBulkJobEditLoaded)return;
  window.__broBulkJobEditLoaded=true;

  const STAGE_OPTIONS=['Awarded','Deposit','Material Ordered','Ready to Schedule','Scheduled','Material Delivered','In Production','Work Complete','Final Payment / Closeout'];
  const dirty=new Map();

  function escAttr(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function isoDate(v){return String(v||'').slice(0,10);}
  function stageText(j){return typeof stageLabel==='function'?stageLabel(j):(j.stage||'Awarded');}
  function normalizedStage(j){const s=stageText(j);return s==='Contract / Deposit'?'Deposit':s;}
  function kindClass(j){const raw=String((typeof jobType==='function'?jobType(j):(j.job_type||j.primary_category||''))||'').toLowerCase();if(raw.includes('repair'))return'bro-repair';if(raw.includes('reroof')||raw.includes('re-roof')||raw.includes('re roof'))return'bro-reroof';return'';}
  function nextNumber(j){const key=typeof stageKey==='function'?stageKey(j):'';const map={awarded:2,contract:3,material:4,ready:5,scheduled:6,delivered:7,production:8,complete:9,closeout:9};return map[key]||'';}
  function numberedStage(j){const key=typeof stageKey==='function'?stageKey(j):'';const map={awarded:1,contract:2,material:3,ready:4,scheduled:5,delivered:6,production:7,complete:8,closeout:9};const n=map[key];return n?`${n}. ${normalizedStage(j)}`:normalizedStage(j);}
  function numberedNext(j){const label=typeof nextStep==='function'?nextStep(j):'';const n=nextNumber(j);return n?`${n}. ${label}`:label;}

  function installStyles(){
    if(document.getElementById('broBulkJobEditStyles'))return;
    const s=document.createElement('style');s.id='broBulkJobEditStyles';s.textContent=`
      .bulk-edit-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;background:#fff;border:1px solid #dfe5ec;border-radius:10px;margin-bottom:8px;position:sticky;top:42px;z-index:7;box-shadow:0 2px 8px rgba(31,48,72,.06)}
      .bulk-edit-bar .bulk-status{font-size:12px;color:#687588;margin-right:auto}.bulk-save{font-weight:700}
      .jobs-table.bulk-edit-table{min-width:1500px}.jobs-table.bulk-edit-table td{vertical-align:middle;padding:6px 8px}.jobs-table.bulk-edit-table input,.jobs-table.bulk-edit-table select{width:100%;min-width:115px;margin:0;padding:7px 8px;font-size:13px;background:#fff}
      .jobs-table.bulk-edit-table .col-job{min-width:92px}.jobs-table.bulk-edit-table .col-customer{min-width:220px}.jobs-table.bulk-edit-table .col-stage{min-width:190px}.jobs-table.bulk-edit-table .col-installer{min-width:120px}.jobs-table.bulk-edit-table .col-next{min-width:230px}.jobs-table.bulk-edit-table tr.bro-dirty{box-shadow:inset 0 0 0 2px #d59b23}.jobs-table.bulk-edit-table tr.bro-saving{opacity:.65}.jobs-table.bulk-edit-table .payment-cell{white-space:nowrap}.jobs-table.bulk-edit-table button{padding:6px 9px}
    `;document.head.appendChild(s);
  }

  function ensureToolbar(){
    const tableView=document.getElementById('tableView');if(!tableView)return;
    let bar=document.getElementById('bulkEditBar');
    if(!bar){bar=document.createElement('div');bar.id='bulkEditBar';bar.className='bulk-edit-bar';bar.innerHTML='<b>Quick Edit Jobs</b><span class="bulk-status" id="bulkEditStatus">Edit several rows, then save them together.</span><button class="btn" type="button" id="bulkRevertBtn">Revert changes</button><button class="btn primary bulk-save" type="button" id="bulkSaveBtn">Save all changes</button>';const wrap=document.getElementById('jobsTableWrap');tableView.insertBefore(bar,wrap);document.getElementById('bulkSaveBtn').onclick=saveAll;document.getElementById('bulkRevertBtn').onclick=()=>{dirty.clear();renderTable();updateStatus();};}
    document.querySelector('.jobs-table')?.classList.add('bulk-edit-table');
  }

  function markDirty(jobId,field,value,row){
    const patch=dirty.get(jobId)||{};patch[field]=value||null;dirty.set(jobId,patch);row?.classList.add('bro-dirty');updateStatus();
  }
  function updateStatus(msg){const el=document.getElementById('bulkEditStatus');if(!el)return;el.textContent=msg||`${dirty.size} job${dirty.size===1?'':'s'} changed${dirty.size?' — ready to save.':' — edit several rows, then save them together.'}`;}

  function renderEditableTable(){
    ensureToolbar();
    const body=document.getElementById('jobsTableBody');if(!body)return;
    const rows=typeof sortTableRows==='function'&&typeof filtered==='function'?sortTableRows(filtered()):(typeof filtered==='function'?filtered():[]);
    body.innerHTML=rows.length?rows.map(j=>{
      const pending=dirty.get(j.id)||{};
      const stage=pending.stage??normalizedStage(j);
      const start=pending.confirmed_start_date??isoDate(j.confirmed_start_date||j.target_start_date);
      const finish=pending.completion_date??isoDate(j.completion_date||j.production_finished_date);
      const installer=pending.installer??(j.installer||'');
      const comm=pending.client_communication_due_date??isoDate(j.client_communication_due_date);
      return `<tr data-job-id="${escAttr(j.id)}" class="${kindClass(j)}${dirty.has(j.id)?' bro-dirty':''}"><td class="col-job"><b>${escAttr(j.job_number||'')}</b></td><td class="col-customer">${escAttr(j.customer_name||'')}</td><td>${escAttr(typeof jobType==='function'?jobType(j):(j.job_type||''))}</td><td class="col-stage"><select data-bulk-field="stage"><option value="">Choose…</option>${STAGE_OPTIONS.map(x=>`<option${x===stage?' selected':''}>${x}</option>`).join('')}</select><div class="job-meta">${escAttr(numberedStage(j))}</div></td><td><input type="date" data-bulk-field="confirmed_start_date" value="${escAttr(start)}"></td><td><input type="date" data-bulk-field="completion_date" value="${escAttr(finish)}"></td><td class="col-installer"><input data-bulk-field="installer" value="${escAttr(installer)}" placeholder="Installer"></td><td><input type="date" data-bulk-field="client_communication_due_date" value="${escAttr(comm)}"></td><td class="payment-cell"><button class="btn small" type="button" data-bulk-payment>Add / View Payment</button></td><td class="col-next">${escAttr(numberedNext(j))}</td></tr>`;
    }).join(''):'<tr><td colspan="10" class="empty">No active jobs match.</td></tr>';

    body.querySelectorAll('[data-bulk-field]').forEach(input=>input.addEventListener('change',e=>{const row=e.target.closest('tr[data-job-id]');if(!row)return;markDirty(row.dataset.jobId,e.target.dataset.bulkField,e.target.value,row);}));
    body.querySelectorAll('[data-bulk-payment]').forEach(btn=>btn.onclick=async e=>{e.stopPropagation();const row=btn.closest('tr[data-job-id]');const id=row?.dataset.jobId;if(!id)return;if(window.BRO_PAYMENTS?.openPaymentForJob){await window.BRO_PAYMENTS.openPaymentForJob(id);}else if(typeof openJob==='function'){openJob(id);setTimeout(()=>document.getElementById('addPaymentBtn')?.click(),250);}});
    if(typeof refreshSortHeaders==='function')refreshSortHeaders();
    updateStatus();
  }

  async function saveAll(){
    if(!dirty.size){updateStatus('No unsaved changes.');return;}
    const btn=document.getElementById('bulkSaveBtn');if(btn){btn.disabled=true;btn.textContent='Saving…';}
    let saved=0;let failed=0;
    for(const [id,patch0] of [...dirty.entries()]){
      const row=document.querySelector(`tr[data-job-id="${CSS.escape(id)}"]`);row?.classList.add('bro-saving');
      const patch={...patch0,updated_at:new Date().toISOString(),production_last_update_at:new Date().toISOString(),production_last_update_by:'Eve'};
      if(patch.stage==='Deposit')patch.stage='Deposit';
      const res=await db.from('jobs').update(patch).eq('id',id).select('*').single();
      row?.classList.remove('bro-saving');
      if(res.error){failed++;row?.classList.add('bro-dirty');continue;}
      const idx=jobs.findIndex(j=>j.id===id);if(idx>=0)jobs[idx]=res.data;dirty.delete(id);saved++;
    }
    if(btn){btn.disabled=false;btn.textContent='Save all changes';}
    if(typeof renderAll==='function')renderAll();
    updateStatus(failed?`${saved} saved; ${failed} could not be saved.`:`${saved} job${saved===1?'':'s'} saved.`);
    if(typeof notice==='function')notice(failed?'Some quick edits could not be saved.':'Job updates saved.',''+(failed?'error':'success'));
  }

  function install(){
    installStyles();ensureToolbar();
    if(typeof renderTable==='function'&&!window.__broBulkRenderWrapped){window.__broBulkRenderWrapped=true;renderTable=renderEditableTable;}
    const table=document.querySelector('.jobs-table');if(table&&!table.dataset.broBulkOpen){table.dataset.broBulkOpen='1';table.addEventListener('dblclick',e=>{if(e.target.closest('input,select,button'))return;const row=e.target.closest('tr[data-job-id]');if(row&&typeof openJob==='function')openJob(row.dataset.jobId);});}
    renderEditableTable();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,350),{once:true});else setTimeout(install,350);
})();
