'use strict';
(function(){
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function ensureDialog(){
    if(document.getElementById('editContactDialog')) return;
    const d=document.createElement('dialog');
    d.id='editContactDialog';
    d.innerHTML=`<form method="dialog" class="card modal-form"><h2>Edit Contact</h2><input id="editContactId" type="hidden"><div class="form-grid"><div class="wide"><label>Name or company</label><input id="editContactName"></div><div><label>Phone</label><input id="editContactPhone" type="tel"></div><div><label>Email</label><input id="editContactEmail" type="email"></div><div class="wide"><label>Street address</label><input id="editContactStreet"></div><div><label>City</label><input id="editContactCity"></div><div><label>State</label><input id="editContactState"></div><div><label>ZIP</label><input id="editContactZip"></div><div class="wide"><label>Notes</label><textarea id="editContactNotes"></textarea></div></div><div class="toolbar"><button class="btn primary" id="saveEditContactBtn" type="button">Save Contact</button><button class="btn danger" id="deleteContactBtn" type="button">Delete Contact</button><button class="btn" value="cancel">Cancel</button></div></form>`;
    document.body.appendChild(d);
    document.getElementById('saveEditContactBtn').onclick=saveEditContact;
    document.getElementById('deleteContactBtn').onclick=deleteContact;
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
  async function deleteContact(){
    const id=document.getElementById('editContactId').value;
    const name=document.getElementById('editContactName').value.trim()||'this contact';
    if(!id)return;
    const [leadCount,jobCount]=await Promise.all([
      db.from('leads').select('id',{count:'exact',head:true}).eq('contact_id',id),
      db.from('jobs').select('id',{count:'exact',head:true}).eq('customer_id',id)
    ]);
    if(leadCount.error)return notice(leadCount.error.message,'error');
    if(jobCount.error)return notice(jobCount.error.message,'error');
    const inquiryTotal=leadCount.count||0,jobTotal=jobCount.count||0;
    const warning=`Delete ${name}?\n\nThis permanently deletes the Contact record and its contact-level communication history.${inquiryTotal||jobTotal?`\n\n${inquiryTotal} linked inquiry${inquiryTotal===1?'':'ies'} and ${jobTotal} linked job${jobTotal===1?'':'s'} will stay in BRO, but their Contact link will be removed.`:''}\n\nType DELETE to continue.`;
    if(prompt(warning,'')!=='DELETE')return;
    const button=document.getElementById('deleteContactBtn');button.disabled=true;
    try{
      const jobsRes=await db.from('jobs').update({customer_id:null}).eq('customer_id',id);
      if(jobsRes.error)throw jobsRes.error;
      const leadsRes=await db.from('leads').update({contact_id:null}).eq('contact_id',id);
      if(leadsRes.error)throw leadsRes.error;
      const result=await db.from('contacts').delete().eq('id',id).select('id');
      if(result.error)throw result.error;
      if(!result.data?.length)throw new Error('The contact was not deleted. Refresh and try again.');
      document.getElementById('editContactDialog').close();
      const detail=document.getElementById('contactDetail');if(detail){detail.classList.add('hidden');detail.innerHTML='';}
      try{selected=null;}catch(_){ }
      notice('Contact deleted. Any inquiries and jobs were kept in BRO.','success');
    }catch(error){notice('Could not delete contact: '+(error?.message||String(error)),'error');}
    finally{button.disabled=false;}
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
