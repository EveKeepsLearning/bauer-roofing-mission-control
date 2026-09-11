'use strict';
(() => {
  function appointmentLabel(v){
    if(!v) return '';
    const d=new Date(v);
    if(Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  }

  async function enhanceAppointmentDisplay(){
    if(typeof db==='undefined'||!db) return;
    const links=[...document.querySelectorAll('#contactDetail .history-section a.history-item[href*="inquiry.html?id="]')];
    if(!links.length) return;
    const ids=links.map(a=>{
      try{return new URL(a.href,location.href).searchParams.get('id');}catch{return null;}
    }).filter(Boolean);
    if(!ids.length) return;

    const {data,error}=await db.from('appointments')
      .select('lead_id,appointment_at,appointment_status,deleted_at')
      .in('lead_id',ids)
      .is('deleted_at',null)
      .order('appointment_at',{ascending:true});
    if(error) return;

    const byLead=new Map();
    (data||[]).forEach(a=>{
      if(!a.lead_id||!a.appointment_at) return;
      if(String(a.appointment_status||'').toLowerCase()==='cancelled') return;
      if(!byLead.has(a.lead_id)) byLead.set(a.lead_id,a);
    });

    links.forEach(a=>{
      let leadId=null;
      try{leadId=new URL(a.href,location.href).searchParams.get('id');}catch{}
      const right=a.querySelector('.history-grid')?.children?.[2];
      if(!right) return;
      const appt=byLead.get(leadId);
      const next=appt?appointmentLabel(appt.appointment_at):(['Appointment Scheduled','Appointment Wanted','New Inquiry'].includes(right.textContent.trim())?'':right.textContent.trim());
      if(right.textContent.trim()!==next) right.textContent=next;
    });
  }

  if(typeof openBroContact==='function'){
    const baseOpenBroContact=openBroContact;
    openBroContact=async function(id){
      await baseOpenBroContact(id);
      await enhanceAppointmentDisplay();
    };
  }

  // Do not observe #contactDetail and rewrite it from inside the observer.
  // That pattern can continuously retrigger itself and make inquiry links unresponsive.
  setTimeout(enhanceAppointmentDisplay,250);
  setTimeout(enhanceAppointmentDisplay,750);
})();
