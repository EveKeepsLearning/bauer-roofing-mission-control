'use strict';
(function(){
  if(window.__broContactHouseholdsLoaded)return;
  window.__broContactHouseholdsLoaded=true;
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function looksLikeCompany(name){return /\b(llc|inc|church|company|co\.?|roofing|school|bank|hoa|association|ministries|ministry|foundation|apartments|properties)\b/i.test(name||'');}
  function parseName(name){
    const s=String(name||'').trim();
    if(!s)return{first:'',spouse:'',last:'',company:''};
    if(looksLikeCompany(s))return{first:'',spouse:'',last:'',company:s};
    const parts=s.split(/\s+/); const last=parts.length>1?parts.pop():''; const left=parts.join(' ');
    const pair=left.split(/\s*&\s*/);
    return{first:(pair[0]||left||s).trim(),spouse:(pair[1]||'').trim(),last:last.trim(),company:''};
  }
  function formatName(first,spouse,last,company){
    const c=String(company||'').trim(); if(c)return c;
    const f=String(first||'').trim(),s=String(spouse||'').trim(),l=String(last||'').trim();
    return [s?`${f} & ${s}`:f,l].filter(Boolean).join(' ').trim();
  }
  function decorate(input){
    if(!input||input.dataset.householdReady)return;
    input.dataset.householdReady='1'; input.type='hidden';
    const p=input.id.replace(/Name$/,'')||input.id;
    const wrap=document.createElement('div'); wrap.className='wide bro-household-builder';
    wrap.innerHTML=`<label>Contact type<select data-hh-type><option value="person">Person / household</option><option value="company">Company / organization</option></select></label><div class="bro-household-grid"><label>First name<input data-hh="first"></label><label>Spouse / co-owner<input data-hh="spouse"></label><label>Last name<input data-hh="last"></label><label>Company / organization <small>(instead of person name)</small><input data-hh="company"></label></div><label class="bro-name-preview-label">Name BRO will use<output data-hh="preview" style="display:block;padding:8px 0;font-weight:700"></output></label>`;
    input.parentElement.insertBefore(wrap,input);
    const sync=()=>{const companyMode=wrap.querySelector('[data-hh-type]').value==='company';const name=companyMode?wrap.querySelector('[data-hh="company"]').value.trim():formatName(wrap.querySelector('[data-hh="first"]').value,wrap.querySelector('[data-hh="spouse"]').value,wrap.querySelector('[data-hh="last"]').value,companyMode?wrap.querySelector('[data-hh="company"]').value:'');input.value=name;wrap.querySelector('[data-hh="preview"]').textContent=name||'Enter a name above';wrap.querySelectorAll('[data-hh]').forEach(el=>{if(el.dataset.hh==='preview')return;el.parentElement.style.display=(companyMode?(el.dataset.hh!=='company'):(el.dataset.hh==='company'))?'none':'';});};
    wrap.querySelectorAll('input:not([readonly])').forEach(el=>el.addEventListener('input',sync));
    wrap.querySelector('[data-hh-type]').addEventListener('change',sync);wrap.dataset.sourceInput=input.id;
    wrap._broLoad=()=>{const parsed=parseName(input.value);wrap.querySelector('[data-hh-type]').value=parsed.company?'company':'person';wrap.querySelector('[data-hh="first"]').value=parsed.first;wrap.querySelector('[data-hh="spouse"]').value=parsed.spouse;wrap.querySelector('[data-hh="last"]').value=parsed.last;wrap.querySelector('[data-hh="company"]').value=parsed.company;sync();};
    wrap._broLoad();
  }
  function refreshBuilders(){
    ['newContactName','editContactName','contactEditName'].forEach(id=>decorate($(id)));
    document.querySelectorAll('.bro-household-builder').forEach(w=>w._broLoad?.());
  }
  function installStyles(){
    if($('broHouseholdStyles'))return; const s=document.createElement('style');s.id='broHouseholdStyles';s.textContent=`.bro-household-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 12px}.bro-household-grid small{font-weight:400;color:#7b8796}.bro-name-preview-label{display:block;margin-top:10px}.bro-name-preview-label input{background:#f6f8fb;font-weight:700}.bro-merge-results{max-height:320px;overflow:auto;border-top:1px solid #e3e8ef;margin-top:10px}.bro-merge-row{display:flex;gap:10px;justify-content:space-between;align-items:center;padding:10px 2px;border-bottom:1px solid #edf1f5}.bro-merge-meta{font-size:12px;color:#6d7888}.bro-merge-actions{display:flex;gap:6px;flex-wrap:wrap}@media(max-width:700px){.bro-household-grid{grid-template-columns:1fr}.bro-merge-row{display:block}.bro-merge-actions{margin-top:8px}}`;document.head.appendChild(s);
  }
  function ensureMergeDialog(){
    if($('mergeContactDialog'))return;
    const d=document.createElement('dialog');d.id='mergeContactDialog';d.innerHTML=`<form method="dialog" class="card modal-form"><h2>Merge Contacts</h2><p class="sub">Search for the duplicate contact. You choose which contact stays. BRO will move linked inquiries, jobs, communications and tasks before removing the duplicate.</p><div class="search-row"><input id="mergeContactSearch" type="search" placeholder="Name, phone, email or address"><button class="btn primary" id="mergeContactSearchBtn" type="button">Search</button></div><div id="mergeContactResults" class="bro-merge-results"></div><div class="toolbar"><button class="btn" value="cancel">Cancel</button></div></form>`;document.body.appendChild(d);
    $('mergeContactSearchBtn').onclick=searchMerge;$('mergeContactSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();searchMerge();}});
  }
  async function searchMerge(){
    const q=$('mergeContactSearch').value.trim();if(!q)return;const current=typeof selected!=='undefined'?selected?.contact_id:null;if(!current)return;
    const safe=q.replace(/[,%()]/g,' ');let query=db.from('contacts').select('*').or(`name.ilike.%${safe}%,email.ilike.%${safe}%,street_address.ilike.%${safe}%`).neq('id',current).limit(30);
    const {data,error}=await query;if(error){$('mergeContactResults').innerHTML=`<div class="notice error">${esc(error.message)}</div>`;return;}
    $('mergeContactResults').innerHTML=(data||[]).length?(data||[]).map(c=>`<div class="bro-merge-row"><div><b>${esc(c.name)}</b><div class="bro-merge-meta">${esc([c.phone,c.email,c.street_address,c.city,c.state,c.zip].filter(Boolean).join(' • '))}</div></div><div class="bro-merge-actions"><button class="btn small" type="button" data-merge-keep-current="${esc(c.id)}">Merge into current</button><button class="btn small primary" type="button" data-merge-keep-selected="${esc(c.id)}">Use this as main</button></div></div>`).join(''):'<div class="empty-state">No other BRO contacts matched.</div>';
    $('mergeContactResults').querySelectorAll('[data-merge-keep-current]').forEach(b=>b.onclick=()=>mergeContacts(current,b.dataset.mergeKeepCurrent));
    $('mergeContactResults').querySelectorAll('[data-merge-keep-selected]').forEach(b=>b.onclick=()=>mergeContacts(b.dataset.mergeKeepSelected,current));
  }
  async function mergeContacts(keepId,mergeId){
    const [kr,mr]=await Promise.all([db.from('contacts').select('id,name').eq('id',keepId).single(),db.from('contacts').select('id,name').eq('id',mergeId).single()]);
    if(kr.error||mr.error)return alert((kr.error||mr.error).message);
    if(!confirm(`Merge “${mr.data.name}” into “${kr.data.name}”?\n\nAll linked BRO records will move to “${kr.data.name}”. The duplicate contact will then be removed.`))return;
    const {error}=await db.rpc('bro_merge_contacts',{p_keep:keepId,p_merge:mergeId});if(error)return alert(`Could not merge contacts: ${error.message}`);
    location.href=`contacts.html?contact=${encodeURIComponent(keepId)}&merged=1`;
  }
  function addMergeButton(){
    if(location.pathname.split('/').pop()!=='contacts.html')return;const detail=$('contactDetail');if(!detail||detail.classList.contains('hidden')||typeof selected==='undefined'||selected?.source_type!=='BRO')return;const actions=detail.querySelector('.detail-actions');if(!actions||$('mergeContactBtn'))return;const b=document.createElement('button');b.id='mergeContactBtn';b.type='button';b.className='btn';b.textContent='Merge Contact';b.onclick=()=>{ensureMergeDialog();$('mergeContactSearch').value='';$('mergeContactResults').innerHTML='';$('mergeContactDialog').showModal();$('mergeContactSearch').focus();};actions.insertBefore(b,actions.firstChild);
  }
  function install(){installStyles();ensureMergeDialog();refreshBuilders();addMergeButton();new MutationObserver(()=>{refreshBuilders();addMergeButton();}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open','class']});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
