'use strict';
(function(){
  if(window.__broContactDeleteLoaded)return;
  window.__broContactDeleteLoaded=true;
  const $=id=>document.getElementById(id);
  function getDb(){try{return typeof db!=='undefined'&&db?db:window.BROUX?.client?.()||null;}catch{return window.BROUX?.client?.()||null;}}
  async function deleteCurrentContact(){
    const client=getDb(),id=$('editContactId')?.value;
    if(!client||!id)return;
    const name=$('editContactName')?.value.trim()||'this contact';
    const [leadCount,jobCount]=await Promise.all([
      client.from('leads').select('id',{count:'exact',head:true}).eq('contact_id',id),
      client.from('jobs').select('id',{count:'exact',head:true}).eq('customer_id',id)
    ]);
    if(leadCount.error)return window.notice?.(leadCount.error.message,'error');
    if(jobCount.error)return window.notice?.(jobCount.error.message,'error');
    const inquiryTotal=leadCount.count||0,jobTotal=jobCount.count||0;
    const linked=inquiryTotal||jobTotal?`\n\nLinked records will stay in BRO but will no longer point to this Contact: ${inquiryTotal} inquiry record(s), ${jobTotal} job record(s).`:'';
    const warning=`Delete ${name}?\n\nThis permanently deletes the Contact record and its contact-level communication history.${linked}\n\nType DELETE to continue.`;
    if(prompt(warning,'')!=='DELETE')return;
    const button=$('deleteContactBtn');if(button)button.disabled=true;
    try{
      const jobsRes=await client.from('jobs').update({customer_id:null}).eq('customer_id',id);if(jobsRes.error)throw jobsRes.error;
      const leadsRes=await client.from('leads').update({contact_id:null}).eq('contact_id',id);if(leadsRes.error)throw leadsRes.error;
      const result=await client.from('contacts').delete().eq('id',id).select('id');if(result.error)throw result.error;
      if(!result.data?.length)throw new Error('The contact was not deleted. Refresh and try again.');
      $('editContactDialog')?.close();
      const detail=$('contactDetail');if(detail){detail.classList.add('hidden');detail.innerHTML='';}
      try{selected=null;}catch(_){ }
      if(typeof notice==='function')notice('Contact deleted. Any inquiries and jobs were kept in BRO.','success');
    }catch(error){if(typeof notice==='function')notice('Could not delete contact: '+(error?.message||String(error)),'error');else alert(error?.message||String(error));}
    finally{if(button)button.disabled=false;}
  }
  function install(){
    const dialog=$('editContactDialog');if(!dialog)return false;
    const toolbar=dialog.querySelector('.toolbar');if(!toolbar)return false;
    let button=$('deleteContactBtn');
    if(!button){button=document.createElement('button');button.id='deleteContactBtn';button.type='button';button.className='btn danger';button.textContent='Delete Contact';const cancel=toolbar.querySelector('[value="cancel"]');toolbar.insertBefore(button,cancel||null);}
    if(!button.dataset.broDeleteBound){button.dataset.broDeleteBound='1';button.addEventListener('click',deleteCurrentContact);}
    return true;
  }
  function start(){if(install())return;const observer=new MutationObserver(()=>{if(install())observer.disconnect();});observer.observe(document.body,{childList:true,subtree:true});setTimeout(install,300);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
