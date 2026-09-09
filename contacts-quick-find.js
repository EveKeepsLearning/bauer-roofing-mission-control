'use strict';
(function(){
  const $=id=>document.getElementById(id);
  const fieldIds=['qfName','qfAddress','qfCity','qfState','qfZip','qfPhone','qfEmail','qfInquiry','qfJob'];
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function renderRows(rows){
    const box=$('searchResults');
    box.innerHTML=rows.length?rows.map((r,i)=>`<button class="result" type="button" data-qf-index="${i}"><div><div class="result-name">${esc(r.display_name)}${r.source_type==='MarketSharp Archive'?'<span class="archive-badge">Older history</span>':''}</div><div class="result-meta">${esc(r.context_summary||'')}</div></div><div><div>${esc(r.phone||'')}</div><div class="result-meta">${esc(r.email||'')}</div></div><div><div>${esc([r.street_address,r.city,r.state,r.zip].filter(Boolean).join(', '))}</div><div class="result-meta">${esc(r.source_type==='BRO'?'Bauer Roofing Operations':'Preserved MarketSharp history')}</div></div></button>`).join(''):'<div class="empty-state">No contacts matched those fields.</div>';
    box.querySelectorAll('[data-qf-index]').forEach(b=>b.onclick=()=>openResult(rows[Number(b.dataset.qfIndex)]));
  }
  async function quickFind(){
    const args={
      p_name:$('qfName').value.trim()||null,
      p_address:$('qfAddress').value.trim()||null,
      p_city:$('qfCity').value.trim()||null,
      p_state:$('qfState').value.trim()||null,
      p_zip:$('qfZip').value.trim()||null,
      p_phone:$('qfPhone').value.trim()||null,
      p_email:$('qfEmail').value.trim()||null,
      p_inquiry_number:$('qfInquiry').value.trim()||null,
      p_job_number:$('qfJob').value.trim()||null
    };
    if(!Object.values(args).some(Boolean)){
      $('searchResults').innerHTML='<div class="empty-state">Enter at least one Quick Find field.</div>';
      return;
    }
    $('contactDetail').classList.add('hidden');
    $('searchResults').innerHTML='<div class="empty-state">Searching…</div>';
    const {data,error}=await db.rpc('bauer_contact_search_advanced',args);
    if(error){if(typeof notice==='function')notice(error.message,'error');$('searchResults').innerHTML='<div class="empty-state">Quick Find could not be completed.</div>';return;}
    renderRows(data||[]);
  }
  function clearQuickFind(){
    fieldIds.forEach(id=>$(id).value='');
    $('searchResults').innerHTML='<div class="empty-state">Search by any field above.</div>';
    $('contactDetail').classList.add('hidden');
    $('qfName').focus();
  }
  $('quickFindBtn').onclick=quickFind;
  $('quickFindClearBtn').onclick=clearQuickFind;
  fieldIds.forEach(id=>$(id).addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();quickFind();}}));
})();