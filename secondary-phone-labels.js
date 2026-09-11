'use strict';
(function(){
  if(window.__broSecondaryPhoneLabelsLoaded)return;
  window.__broSecondaryPhoneLabelsLoaded=true;
  const $=id=>document.getElementById(id);
  const trim=v=>String(v||'').trim();
  const labelOrDefault=v=>trim(v)||'Other';

  function addFieldAfter(inputId,labelId,defaultValue='Other'){
    const input=$(inputId);if(!input||$(labelId))return null;
    const wrap=input.closest('div');if(!wrap)return null;
    const field=document.createElement('div');
    field.innerHTML=`<label>Secondary phone label</label><input id="${labelId}" placeholder="Cell, Work, Spouse, Home…" value="${defaultValue}">`;
    wrap.insertAdjacentElement('afterend',field);
    return field.querySelector('input');
  }

  function addInlineLabel(inputId,labelId,defaultValue='Other'){
    const input=$(inputId);if(!input||$(labelId))return null;
    const wrap=input.closest('div');if(!wrap)return null;
    const field=document.createElement('div');
    field.innerHTML=`<label>Secondary phone label</label><input id="${labelId}" placeholder="Cell, Work, Spouse, Home…" value="${defaultValue}">`;
    wrap.insertAdjacentElement('afterend',field);
    return field.querySelector('input');
  }

  async function updateLeadAndContact(leadId,contactId,label){
    if(typeof db==='undefined'||!db)return;
    const clean=labelOrDefault(label);
    if(leadId)await db.from('leads').update({phone_secondary_label:clean,updated_at:new Date().toISOString()}).eq('id',leadId);
    if(contactId)await db.from('contacts').update({phone_secondary_label:clean,updated_at:new Date().toISOString()}).eq('id',contactId);
  }

  function installMainApp(){
    const leadPhone2=$('leadPhone2');
    if(leadPhone2){
      addFieldAfter('leadPhone2','leadPhone2Label');
      if(typeof openLeadEdit==='function'&&!openLeadEdit.__broSecondaryWrapped){
        const original=openLeadEdit;
        const wrapped=function(id){const result=original(id);const lead=typeof state!=='undefined'?(state.leads||[]).find(x=>String(x.id)===String(id)):null;if($('leadPhone2Label'))$('leadPhone2Label').value=lead?.phone_secondary_label||'Other';return result;};
        wrapped.__broSecondaryWrapped=true;openLeadEdit=wrapped;
      }
      if(typeof clearLeadForm==='function'&&!clearLeadForm.__broSecondaryWrapped){
        const original=clearLeadForm;
        const wrapped=function(){const result=original();if($('leadPhone2Label'))$('leadPhone2Label').value='Other';return result;};
        wrapped.__broSecondaryWrapped=true;clearLeadForm=wrapped;
      }
      if(typeof openRelatedInquiry==='function'&&!openRelatedInquiry.__broSecondaryWrapped){
        const original=openRelatedInquiry;
        const wrapped=function(contactKey){const result=original(contactKey);try{const group=typeof contactGroups==='function'?contactGroups().find(x=>x.key===contactKey):null;if($('leadPhone2Label'))$('leadPhone2Label').value=group?.contact?.phone_secondary_label||group?.inquiries?.[0]?.phone_secondary_label||'Other';}catch(_){}return result;};
        wrapped.__broSecondaryWrapped=true;openRelatedInquiry=wrapped;
      }
      if(typeof saveLead==='function'&&!saveLead.__broSecondaryWrapped){
        const original=saveLead;
        const wrapped=async function(){
          const editId=trim($('leadEditId')?.value),prospectId=trim($('leadProspectId')?.value),leadNumber=trim($('leadNumber')?.value),label=labelOrDefault($('leadPhone2Label')?.value),knownContact=typeof pendingRelatedContactId!=='undefined'?pendingRelatedContactId:'';
          const result=await original();
          try{
            let leadId=editId,contactId=knownContact;
            if(!leadId&&typeof db!=='undefined'&&db){
              let q=db.from('leads').select('id,contact_id').is('deleted_at',null).order('created_at',{ascending:false}).limit(1);
              if(prospectId)q=q.eq('prospect_id',prospectId);else if(leadNumber)q=q.eq('lead_number',leadNumber);
              const r=await q;if(!r.error&&r.data?.length){leadId=r.data[0].id;contactId=contactId||r.data[0].contact_id||'';}
            }
            await updateLeadAndContact(leadId,contactId,label);
          }catch(e){console.warn('Secondary phone label could not be saved:',e);}
          return result;
        };
        wrapped.__broSecondaryWrapped=true;saveLead=wrapped;
        if($('saveLeadBtn'))$('saveLeadBtn').onclick=saveLead;
      }
    }

    if($('contactPhoneSecondary')){
      addInlineLabel('contactPhoneSecondary','contactPhoneSecondaryLabel');
      if(typeof openContactEdit==='function'&&!openContactEdit.__broSecondaryWrapped){
        const original=openContactEdit;const wrapped=function(key){const result=original(key);try{const group=typeof contactGroups==='function'?contactGroups().find(x=>x.key===key):null;if($('contactPhoneSecondaryLabel'))$('contactPhoneSecondaryLabel').value=group?.contact?.phone_secondary_label||group?.inquiries?.[0]?.phone_secondary_label||'Other';}catch(_){}return result;};wrapped.__broSecondaryWrapped=true;openContactEdit=wrapped;
      }
      if(typeof saveContactEdit==='function'&&!saveContactEdit.__broSecondaryWrapped){
        const original=saveContactEdit;const wrapped=async function(){const key=trim($('contactEditKey')?.value),label=labelOrDefault($('contactPhoneSecondaryLabel')?.value);const result=await original();try{const group=typeof contactGroups==='function'?contactGroups().find(x=>x.key===key):null;if(group?.contact?.id)await db.from('contacts').update({phone_secondary_label:label,updated_at:new Date().toISOString()}).eq('id',group.contact.id);for(const lead of group?.inquiries||[])await db.from('leads').update({phone_secondary_label:label,updated_at:new Date().toISOString()}).eq('id',lead.id);}catch(e){console.warn(e);}return result;};wrapped.__broSecondaryWrapped=true;saveContactEdit=wrapped;if($('saveContactBtn'))$('saveContactBtn').onclick=saveContactEdit;
      }
    }
  }

  function installStandaloneContacts(){
    if(!$('contactSearchInput'))return;
    addFieldAfter('newContactPhone','newContactPhoneSecondaryLabel');
    const primary=$('newContactPhone');
    if(primary&&!$('newContactPhoneSecondary')){
      const labelField=$('newContactPhoneSecondaryLabel')?.closest('div');
      if(labelField){const phoneField=document.createElement('div');phoneField.innerHTML='<label>Secondary phone</label><input id="newContactPhoneSecondary" type="tel">';labelField.insertAdjacentElement('afterend',phoneField);}
    }
    const save=$('saveNewContactBtn');
    if(save&&!save.dataset.broSecondaryPhoneSave){
      save.dataset.broSecondaryPhoneSave='1';
      save.onclick=async()=>{
        const name=trim($('newContactName')?.value);if(!name)return typeof notice==='function'&&notice('Name or company is required.','error');
        const row={name,phone:trim($('newContactPhone')?.value)||null,phone_secondary:trim($('newContactPhoneSecondary')?.value)||null,phone_secondary_label:labelOrDefault($('newContactPhoneSecondaryLabel')?.value),email:trim($('newContactEmail')?.value)||null,street_address:trim($('newContactStreet')?.value)||null,city:trim($('newContactCity')?.value)||null,state:trim($('newContactState')?.value)||null,zip:trim($('newContactZip')?.value)||null,notes:trim($('newContactNotes')?.value)||null};
        const {data,error}=await db.from('contacts').insert(row).select('*').single();if(error)return notice(error.message,'error');$('contactDialog').close();$('contactSearchInput').value=data.name;await searchContacts();await openBroContact(data.id);notice('Contact added.','success');
      };
    }
    if(typeof openBroContact==='function'&&!openBroContact.__broSecondaryWrapped){
      const original=openBroContact;const wrapped=async function(id){const result=await original(id);try{const r=await db.from('contacts').select('phone_secondary,phone_secondary_label').eq('id',id).single();if(!r.error&&r.data?.phone_secondary){const facts=$('contactDetail')?.querySelector('.contact-facts');if(facts&&!facts.querySelector('[data-bro-secondary-phone]')){const div=document.createElement('div');div.className='fact';div.dataset.broSecondaryPhone='1';const digits=String(r.data.phone_secondary).replace(/\D/g,'');div.innerHTML=`<label>${labelOrDefault(r.data.phone_secondary_label)} phone</label><div><a href="tel:${digits}">${r.data.phone_secondary}</a></div>`;facts.appendChild(div);}}}catch(e){console.warn(e);}return result;};wrapped.__broSecondaryWrapped=true;openBroContact=wrapped;
    }
  }

  function installStandaloneEdit(){
    const dlg=$('editContactDialog');if(!dlg)return;
    addFieldAfter('editContactPhone','editContactPhoneSecondaryLabel');
    const labelField=$('editContactPhoneSecondaryLabel')?.closest('div');
    if(labelField&&!$('editContactPhoneSecondary')){const f=document.createElement('div');f.innerHTML='<label>Secondary phone</label><input id="editContactPhoneSecondary" type="tel">';labelField.insertAdjacentElement('afterend',f);}
    if(typeof openEditContact==='function'&&!openEditContact.__broSecondaryWrapped){const original=openEditContact;const wrapped=async function(){const result=await original();const id=trim($('editContactId')?.value);if(id){const r=await db.from('contacts').select('phone_secondary,phone_secondary_label').eq('id',id).single();if(!r.error){$('editContactPhoneSecondary').value=r.data?.phone_secondary||'';$('editContactPhoneSecondaryLabel').value=r.data?.phone_secondary_label||'Other';}}return result;};wrapped.__broSecondaryWrapped=true;openEditContact=wrapped;}
    const save=$('saveEditContactBtn');if(save&&!save.dataset.broSecondaryPhoneSave){save.dataset.broSecondaryPhoneSave='1';save.onclick=async()=>{const id=trim($('editContactId')?.value),name=trim($('editContactName')?.value);if(!name)return notice('Name or company is required.','error');const patch={name,phone:trim($('editContactPhone')?.value)||null,phone_secondary:trim($('editContactPhoneSecondary')?.value)||null,phone_secondary_label:labelOrDefault($('editContactPhoneSecondaryLabel')?.value),email:trim($('editContactEmail')?.value)||null,street_address:trim($('editContactStreet')?.value)||null,city:trim($('editContactCity')?.value)||null,state:trim($('editContactState')?.value)||null,zip:trim($('editContactZip')?.value)||null,notes:trim($('editContactNotes')?.value)||null,updated_at:new Date().toISOString()};const c=await db.from('contacts').update(patch).eq('id',id);if(c.error)return notice(c.error.message,'error');const l=await db.from('leads').update({homeowner_name:name,phone:patch.phone,phone_secondary:patch.phone_secondary,phone_secondary_label:patch.phone_secondary_label,email:patch.email,updated_at:new Date().toISOString()}).eq('contact_id',id).is('deleted_at',null);if(l.error)return notice(`Contact saved, but linked inquiries could not be refreshed: ${l.error.message}`,'error');$('editContactDialog').close();await openBroContact(id);notice('Contact updated everywhere in BRO.','success');};}
  }

  function install(){installMainApp();installStandaloneContacts();installStandaloneEdit();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{install();setTimeout(install,400);setTimeout(install,1200);},{once:true});else{install();setTimeout(install,400);setTimeout(install,1200);}
})();
