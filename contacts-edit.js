'use strict';
(function(){
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function ensureDialog(){
    if(document.getElementById('editContactDialog')) return;
    const d=document.createElement('dialog');
    d.id='editContactDialog';
    d.innerHTML=`<form method="dialog" class="card modal-form"><h2>Edit Contact</h2><input id="editContactId" type="hidden"><div class="form-grid"><div class="wide"><label>Name or company</label><input id="editContactName"></div><div><label>Phone</label><input id="editContactPhone" type="tel"></div><div><label>Email</label><input id="editContactEmail" type="email"></div><div class="wide"><label>Street address</label><input id="editContactStreet"></div><div><label>City</label><input id="editContactCity"></div><div><label>State</label><input id="editContactState"></div><div><label>ZIP</label><input id="editContactZip"></div><div class="wide"><label>Notes</label><textarea id="editContactNotes"></textarea></div></div><div class="toolbar"><button class="btn primary" id="saveEditContactBtn" type="button">Save Contact</button><button class="btn" value="cancel">Cancel</button></div></form>`;
    document.body.appendChild(d);
    document.getElementById('saveEditContactBtn').onclick=saveEditContact;
  }
  async function openEditContact(){
    const id=selected?.contact_id;
    if(!id) return;
    const r=await db.from('contacts').select('*').eq('id',id).single();
    if(r.error) return notice(r.error.message,'error');
    const c=r.data;
    document.getElementById('editContactId').value=c.id;
    document.getElementById('editContactName').value=c.name||'';
    document.getElementById('editContactPhone').value=c.phone||'';
    document.getElementById('editContactEmail').value=c.email||'';
    document.getElementById('editContactStreet').value=c.street_address||'';
    document.getElementById('editContactCity').value=c.city||'';
    document.getElementById('editContactState').value=c.state||'';
    document.getElementById('editContactZip').value=c.zip||'';
    document.getElementById('editContactNotes').value=c.notes||'';
    document.getElementById('editContactDialog').showModal();
  }
  async function saveEditContact(){
    const id=document.getElementById('editContactId').value;
    const name=document.getElementById('editContactName').value.trim();
    if(!name) return notice('Name or company is required.','error');
    const patch={
      name,
      phone:document.getElementById('editContactPhone').value.trim()||null,
      email:document.getElementById('editContactEmail').value.trim()||null,
      street_address:document.getElementById('editContactStreet').value.trim()||null,
      city:document.getElementById('editContactCity').value.trim()||null,
      state:document.getElementById('editContactState').value.trim()||null,
      zip:document.getElementById('editContactZip').value.trim()||null,
      notes:document.getElementById('editContactNotes').value.trim()||null,
      updated_at:new Date().toISOString()
    };
    const cRes=await db.from('contacts').update(patch).eq('id',id).select('*').single();
    if(cRes.error) return notice(cRes.error.message,'error');
    const leadRes=await db.from('leads').update({homeowner_name:name,phone:patch.phone,email:patch.email,updated_at:new Date().toISOString()}).eq('contact_id',id).is('deleted_at',null);
    if(leadRes.error) return notice(`Contact saved, but linked inquiries could not be refreshed: ${leadRes.error.message}`,'error');
    const jobRes=await db.from('jobs').update({customer_name:name}).eq('customer_id',id).is('deleted_at',null);
    if(jobRes.error) return notice(`Contact saved, but linked jobs could not be refreshed: ${jobRes.error.message}`,'error');
    document.getElementById('editContactDialog').close();
    await openBroContact(id);
    notice('Contact updated everywhere in BRO.','success');
  }
  function addEditButton(){
    ensureDialog();
    const detail=document.getElementById('contactDetail');
    if(!detail || detail.classList.contains('hidden') || selected?.source_type!=='BRO') return;
    const actions=detail.querySelector('.detail-actions');
    if(!actions || document.getElementById('editContactBtn')) return;
    const b=document.createElement('button');
    b.id='editContactBtn';b.type='button';b.className='btn';b.textContent='Edit Contact';b.onclick=openEditContact;
    actions.insertBefore(b,actions.firstChild);
  }
  document.addEventListener('DOMContentLoaded',()=>{
    ensureDialog();
    const detail=document.getElementById('contactDetail');
    if(detail) new MutationObserver(addEditButton).observe(detail,{childList:true,subtree:true});
    setTimeout(addEditButton,300);
  });
})();
