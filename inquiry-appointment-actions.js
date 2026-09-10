'use strict';
(function(){
  const $=id=>document.getElementById(id);
  function currentAppointment(){
    const id=String($('appointmentId')?.value||'').trim();
    return id&&Array.isArray(appointments)?appointments.find(a=>a.id===id)||null:null;
  }
  function syncButtonLabel(a){return a?.google_calendar_event_id?'Update Google Calendar':'Save & Add to Google Calendar';}
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
    if(a?.google_calendar_event_id)setGoogleState('Added to Google Calendar','success');
    else if(a?.google_calendar_status==='Sync Error')setGoogleState('Google Calendar: Error','error');
    else setGoogleState('Not added to Google Calendar');
  }
  function installButtons(){
    const save=$('saveAppointmentBtn');
    if(!save||$('googleAppointmentBtn'))return;
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
    renderAppointments();
    refreshActions(res.data);
    return res.data;
  }
  async function saveAndSyncGoogle(){
    const btn=$('googleAppointmentBtn');if(!btn)return;
    btn.disabled=true;
    try{
      setGoogleState('Saving appointment…');
      const saved=await saveAppointmentRecord();
      if(!window.BROCalendarSync?.syncAppointment)throw new Error('Google Calendar sync is not ready. Refresh BRO and try again.');
      setGoogleState(saved.google_calendar_event_id?'Updating Google Calendar…':'Adding to Google Calendar…');
      btn.textContent=saved.google_calendar_event_id?'Updating Google…':'Adding to Google…';
      const result=await window.BROCalendarSync.syncAppointment(saved);
      if(!result?.ok)throw result?.error||new Error('Google Calendar update failed.');
      const confirmedId=String(result?.result?.google_event_id||result?.appointment?.google_calendar_event_id||'').trim();
      if(!confirmedId)throw new Error('Google Calendar did not return a confirmed event ID. The appointment remains saved in BRO only.');
      const refreshed=await db.from('appointments').select('*').eq('id',saved.id).single();
      if(refreshed.error)throw refreshed.error;
      if(!refreshed.data?.google_calendar_event_id)throw new Error('The Google event was created, but BRO could not verify the link. Please do not click Add again.');
      appointments=appointments.map(a=>a.id===saved.id?refreshed.data:a);
      refreshActions(refreshed.data);
      renderAppointments();
      notice(saved.google_calendar_event_id?'Appointment updated in Google Calendar.':'Appointment saved and added to Google Calendar.','success');
      setGoogleState('Added to Google Calendar','success');
      setTimeout(()=>$('appointmentDialog')?.close(),450);
    }catch(err){
      const message=err?.message||String(err);
      setGoogleState('Google Calendar: Error','error');
      notice(`Could not add appointment to Google Calendar: ${message}`,'error');
      btn.textContent='Try Google Calendar Again';
      return;
    }finally{btn.disabled=false;if(currentAppointment()?.google_calendar_event_id)btn.textContent='Update Google Calendar';else if(btn.textContent!=='Try Google Calendar Again')btn.textContent='Save & Add to Google Calendar';}
  }
  async function deleteAppointmentConfirmed(){
    const a=currentAppointment();if(!a)return;
    const where=a.google_calendar_event_id?' from BRO and Google Calendar':' from BRO';
    if(!confirm(`Delete this appointment${where}?\n\nThis cannot be undone.`))return;
    const btn=$('deleteAppointmentBtn');btn.disabled=true;btn.textContent='Deleting…';
    try{
      if(a.google_calendar_event_id){
        if(!window.BROCalendarSync?.deleteAppointment)throw new Error('Google Calendar sync is not ready. Refresh BRO and try again.');
        const r=await window.BROCalendarSync.deleteAppointment(a);
        if(!r?.ok)throw r?.error||new Error('Google Calendar deletion failed.');
      }
      const now=new Date().toISOString();
      const {error}=await db.from('appointments').update({deleted_at:now,appointment_status:'Canceled',google_calendar_status:a.google_calendar_event_id?'Canceled':a.google_calendar_status,updated_at:now}).eq('id',a.id);
      if(error)throw error;
      appointments=appointments.filter(x=>x.id!==a.id);$('appointmentDialog').close();renderAppointments();notice('Appointment deleted.','success');
    }catch(err){notice(`Could not delete appointment: ${err?.message||String(err)}`,'error');}
    finally{btn.disabled=false;btn.textContent='Delete Appointment';}
  }
  document.addEventListener('DOMContentLoaded',()=>setTimeout(installButtons,0));
  if(document.readyState!=='loading')setTimeout(installButtons,0);
})();
