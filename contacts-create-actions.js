'use strict';
(function(){
  if(window.__broContactsCreateActionsLoaded)return;
  window.__broContactsCreateActionsLoaded=true;

  let createInquiryAfterContact=false;

  function contactDialogTitle(text){
    const h=document.querySelector('#contactDialog h2');
    if(h)h.textContent=text;
  }

  function install(){
    const addContact=document.getElementById('addContactBtn');
    const saveContact=document.getElementById('saveNewContactBtn');
    const dialog=document.getElementById('contactDialog');
    if(!addContact||!saveContact||!dialog)return;

    if(!document.getElementById('addContactWithInquiryBtn')){
      const button=document.createElement('button');
      button.id='addContactWithInquiryBtn';
      button.type='button';
      button.className='btn primary';
      button.textContent='+ Contact with Inquiry';
      addContact.classList.remove('primary');
      addContact.insertAdjacentElement('beforebegin',button);
      button.addEventListener('click',()=>{
        createInquiryAfterContact=true;
        addContact.click();
        contactDialogTitle('Add Contact + Inquiry');
      });
    }

    addContact.addEventListener('click',()=>{
      if(!createInquiryAfterContact)contactDialogTitle('Add New Contact');
    });

    if(!saveContact.dataset.broContactInquiryWrapped){
      saveContact.dataset.broContactInquiryWrapped='1';
      const originalSave=saveContact.onclick;
      saveContact.onclick=async function(event){
        const wantsInquiry=createInquiryAfterContact;
        const beforeId=(typeof selected!=='undefined'&&selected?.contact_id)||'';
        if(typeof originalSave==='function')await originalSave.call(this,event);

        if(!wantsInquiry||dialog.open)return;
        createInquiryAfterContact=false;

        try{
          const afterId=(typeof selected!=='undefined'&&selected?.contact_id)||'';
          if(!afterId||afterId===beforeId||typeof fillInquiry!=='function')return;
          const result=await db.from('contacts').select('*').eq('id',afterId).single();
          if(result.error)throw result.error;
          fillInquiry(result.data);
        }catch(error){
          console.warn('Contact was saved, but BRO could not open the new inquiry form:',error);
          if(typeof notice==='function')notice('Contact saved. Use + Inquiry on the contact to continue.','success');
        }
      };
    }

    dialog.addEventListener('cancel',()=>{createInquiryAfterContact=false;contactDialogTitle('Add New Contact');});
    dialog.addEventListener('close',()=>{if(dialog.returnValue==='cancel')createInquiryAfterContact=false;});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
