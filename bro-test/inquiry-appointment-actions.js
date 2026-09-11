'use strict';
(function(){
  const $=id=>document.getElementById(id);
  function currentAppointment(){
    const id=String($('appointmentId')?.value||'').trim();
    return id&&Array.isArray(appointments)?appointments.find(a=>a.id===id)||null:null;
  }
  function hasGoogleLink(a){return !!String(a?.google_calendar_event_id||'').trim()&&String(a?.google_calendar_status||'').trim().toLowerCase()!=='sync error';}
  function syncButtonLabel(a){return hasGoogleLink(a)?'Update Google Calendar':'Save & Add to Google Calendar';}
  function ensureDialogNotice(){
    let box=$('appointmentActionNotice');
    if(box)return box;
    const dialog=$('appointmentDialog');
    const toolbar=dialog?.querySelector('.toolbar');
    if(!dialog||!toolbar)return null;
    box=document.createElement('div');
    box.id='appointmentActionNotice';
    box.style.display='none';
    box.style.margin='14px 0 10px';
    box.style.padding='10px 12px';
    box.style.borderRadius='8px';
    box.style.fontWeight='700';
    toolbar.insertAdjacentElement('beforebegin',box);
    return box;
  }
  function dialogNotice(text,type=''){
    const box=ensureDialogNotice();if(!box)return;
    if(!text){box.textContent='';box.style.display='none';return;}
    box.textContent=text;box.style.display='block';
    if(type==='error'){box.style.background='#fff3f2';box.style.border='1px solid #f3b3ae';box.style.color='#b3261e';}
    else if(type==='success'){box.style.background='#effaf2';box.style.border='1px solid #9fd3ae';box.style.color='#188038';}
    else{box.style.background='#f3f6f9';box.style.border='1px solid #dfe5ec';box.style.color='#425166';}
  }
  function setGoogleState(text,type=''){
    const state=$('appointmentGoogleState');if(!state)return;
    state.textContent=text||'';
    state.style.fontWeight='700';
    state.style.color=type==='error'?'#b3261e':type==='success'?'#188038':'#687588';
  }
  function refreshActions(a=null){
    const del=$('deleteAppointmentBtn'),google=$('googleAppointmentBtn');
    if(del)del.style.display=a?'inline-flex':'none';
    if(google)google.textContent=syncButtonLabel(a);
    dialogNotice('');
    if(hasGoogleLink(a))setGoogleState('Added to Google Calendar','success');
    else if(String(a?.google_calendar_status||'').toLowerCase()==='sync error')setGoogleState('Google Calendar: needs retry','error');
    else setGoogleState('Not added to Google Calendar');
  }
  function installButtons(){
    const save=$('saveAppointmentBtn');
    if(!save||$('googleAppointmentBtn'))return;
    ensureDialogNotice();
    const google=document.createElement('button');google.type='button';google.id='googleAppointmentBtn';google.className='btn';google.textContent='Save & Add to Google Calendar';
    const del=document.createElement('button');del.type='button';del.id='deleteAppointmentBtn';del.className='btn danger';del.textContent='Delete Appointment';del.style.display='none';
    const state=document.createElement('span');state.id='appointmentGoogleState';state.className='sub';state.style.marginLeft='4px';
    save.insertAdjacentElement('afterend',google);google.insertAdjacentElement('afterend',del);del.insertAdjacentElement('afterend',state);
    google.addEventListener('click',saveAndSyncGoogle);
    del.addEventListener('click',deleteAppointmentConfirmed);
    const originalOpen=openAppointment;
    openAppointment=function(a=null){originalOpen(a);setTimeout(()=>refreshActions(a),0);};
    refreshActions(currentAppointment());
  }
  function appointmentRow(){
    return {
      lead_id:inquiryId,
      appointment_at:$('appointmentAt').value?new Date($('appointmentAt').value).toISOString():null,
      assigned_to:$('appointmentAssigned').value.trim()||null,
      appointment_type:$('appointmentType').value.trim()||null,
      appointment_result:$('appointmentResult').value.trim()||null,
      appointment_result_note:$('appointmentResultNote').value.trim()||null,
      notes:$('appointmentNotes').value.trim()||null,
      updated_at:new Date().toISOString()
    };
  }
  async function saveAppointmentRecord(){
    const id=String($('appointmentId').value||'').trim(),row=appointmentRow();
    if(!row.appointment_at)throw new Error('Appointment date/time is required.');
    let res;
    if(id)res=await db.from('appointments').update(row).eq('id',id).select('*').single();
    else res=await db.from('appointments').insert(row).select('*').single();
    if(res.error)throw res.error;
    if(id)appointments=appointments.map(a=>a.id===id?res.data:a);else appointments.unshift(res.data);
    $('appointmentId').value=res.data.id;
    renderAppointments();refreshActions(res.data);return res.data;
  }
  async function saveAndSyncGoogle(){
    const btn=$('googleAppointmentBtn');if(!btn)return;
    btn.disabled=true;dialogNotice('Saving appointment…');
    try{
      setGoogleState('Saving appointment…');
      let saved=await saveAppointmentRecord();
      if(!window.BROCalendarSync?.syncAppointment)throw new Error('Google Calendar sync is not ready. Refresh BRO and try again.');
      if(String(saved.google_calendar_status||'').trim().toLowerCase()==='sync error'){
        const reset=await db.from('appointments').update({google_calendar_event_id:null,google_calendar_status:'Not Added',updated_at:new Date().toISOString()}).eq('id',saved.id).select('*').single();
        if(reset.error)throw reset.error;
        saved=reset.data;appointments=appointments.map(a=>a.id===saved.id?saved:a);
      }
      setGoogleState(hasGoogleLink(saved)?'Updating Google Calendar…':'Adding to Google Calendar…');
      dialogNotice(hasGoogleLink(saved)?'Updating Google Calendar…':'Adding to Google Calendar…');
      btn.textContent=hasGoogleLink(saved)?'Updating Google…':'Adding to Google…';
      const result=await window.BROCalendarSync.syncAppointment(saved);
      if(!result?.ok)throw result?.error||new Error('Google Calendar update failed.');
      const confirmedId=String(result?.result?.google_event_id||'').trim();
      if(!confirmedId)throw new Error('Google Calendar did not return a confirmed event ID. The appointment remains saved in BRO only.');
      const refreshed=await db.from('appointments').select('*').eq('id',saved.id).single();
      if(refreshed.error)throw refreshed.error;
      if(!refreshed.data?.google_calendar_event_id)throw new Error('Google created the event, but BRO could not save the Google link. Please do not click Add again.');
      appointments=appointments.map(a=>a.id===saved.id?refreshed.data:a);
      refreshActions(refreshed.data);renderAppointments();setGoogleState('Added to Google Calendar','success');
      dialogNotice('Appointment added to Google Calendar.','success');
      setTimeout(()=>$('appointmentDialog')?.close(),900);
    }catch(err){
      const message=err?.message||String(err);setGoogleState('Google Calendar: Error','error');dialogNotice(`Google Calendar error: ${message}`,'error');btn.textContent='Try Google Calendar Again';return;
    }finally{btn.disabled=false;if(btn.textContent!=='Try Google Calendar Again')btn.textContent=syncButtonLabel(currentAppointment());}
  }
  async function deleteAppointmentConfirmed(){
    const a=currentAppointment();if(!a)return;
    const linked=!!String(a.google_calendar_event_id||'').trim();
    const extra=linked?'\n\nBRO will also remove the linked Google event if one exists.':'';
    if(!confirm(`Delete this appointment?${extra}\n\nThis cannot be undone.`))return;
    const btn=$('deleteAppointmentBtn');btn.disabled=true;btn.textContent='Deleting…';dialogNotice('Deleting appointment…');
    let googleWarning='';
    try{
      if(linked&&window.BROCalendarSync?.deleteAppointment){
        const r=await window.BROCalendarSync.deleteAppointment(a);
        if(!r?.ok)googleWarning=r?.error?.message||'Google Calendar could not be updated.';
      }
      const now=new Date().toISOString();
      const {error}=await db.from('appointments').update({deleted_at:now,appointment_status:'Canceled',google_calendar_status:linked?(googleWarning?'Google Delete Error':'Canceled'):a.google_calendar_status,updated_at:now}).eq('id',a.id);
      if(error)throw error;
      appointments=appointments.filter(x=>x.id!==a.id);renderAppointments();
      if(googleWarning){dialogNotice(`Deleted from BRO. Google Calendar warning: ${googleWarning}`,'error');setTimeout(()=>$('appointmentDialog')?.close(),1800);}else{dialogNotice('Appointment deleted.','success');setTimeout(()=>$('appointmentDialog')?.close(),700);}
    }catch(err){dialogNotice(`Could not delete appointment from BRO: ${err?.message||String(err)}`,'error');}
    finally{btn.disabled=false;btn.textContent='Delete Appointment';}
  }
  document.addEventListener('DOMContentLoaded',()=>setTimeout(installButtons,0));
  if(document.readyState!=='loading')setTimeout(installButtons,0);
})();
