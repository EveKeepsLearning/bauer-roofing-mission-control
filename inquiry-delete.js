'use strict';
(function(){
  const button=document.createElement('button');
  button.type='button';button.id='deleteInquiryBtn';button.className='btn';
  button.style.color='#b42318';button.textContent='Delete Inquiry';
  const job=document.getElementById('jobBtn');
  if(!job)return;
  job.after(button);
  button.onclick=async()=>{
    if(typeof inquiry==='undefined'||!inquiry||!db)return;
    button.disabled=true;
    try{
      const {data:current,error}=await db.from('leads').select('id,lead_number,homeowner_name,contact_id,updated_at').eq('id',inquiry.id).single();
      if(error)throw error;
      if(!confirm(`Permanently delete inquiry #${current.lead_number||'(no number)'} — ${current.homeowner_name||'Unnamed customer'}?\n\nUse this only for a mistake. For an inquiry attached to the wrong person, use Move to Another Contact.\n\nThe customer stays. Inquiries with jobs, appointments, or estimate history must have those records handled first. Existing messages/tasks and preserved MarketSharp history are retained. This cannot be undone.`))return;
      const result=await db.rpc('bro_delete_inquiry',{p_inquiry_id:current.id,p_expected_updated_at:current.updated_at});
      if(result.error)throw result.error;
      location.href=current.contact_id?`contacts.html?contact=${encodeURIComponent(current.contact_id)}`:'all-inquiries.html';
    }catch(error){notice(error.message||String(error),'error');}
    finally{button.disabled=false;}
  };
})();
