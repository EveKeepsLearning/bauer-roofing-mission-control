'use strict';
(function(){
  const mapCategory=value=>({
    'Roofing (Asphalt)':'Roofing','Metal Roofing':'Roofing','Repairs':'Repair','Windows':'Windows','Siding':'Siding','Gutters':'Gutters','Miscellaneous':'Other','Warranty':'Repair','Ventilation':'Repair','Other':'Other'
  }[value]||'Roofing');
  let pendingInquiry=null;

  function nowLocalInput(){const d=new Date(),pad=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;}
  function dialogNotice(text,type='error'){
    let n=document.getElementById('inquiryDialogNotice');
    if(!n){n=document.createElement('div');n.id='inquiryDialogNotice';const h=document.querySelector('#inquiryDialog h2');if(h)h.insertAdjacentElement('afterend',n);}
    n.className=`notice ${type}`;n.textContent=text;n.style.marginBottom='10px';
  }
  function clearDialogNotice(){const n=document.getElementById('inquiryDialogNotice');if(n){n.textContent='';n.className='notice hidden';}}
  async function initializeInquiryExtras(){
    clearDialogNotice();
    const at=document.getElementById('inquiryAt'),type=document.getElementById('inquiryProductInterest'),desc=document.getElementById('inquiryProductDescription');
    if(at)at.value=nowLocalInput();if(type)type.value='';if(desc)desc.value='';
    const taken=document.getElementById('inquiryTakenBy');if(taken)taken.value='Eve';
    const assigned=document.getElementById('inquiryAssigned');if(assigned)assigned.value='Roy';
    const source=document.getElementById('inquirySource');if(source)source.value='';
    const secondary=document.getElementById('inquirySourceSecondary');if(secondary)secondary.value='';
    const cid=document.getElementById('inquiryContactId')?.value;
    if(cid&&typeof db!=='undefined'&&db){
      const r=await db.from('contacts').select('street_address,city,state,zip').eq('id',cid).single();
      if(!r.error&&r.data){
        const c=r.data;
        const street=document.getElementById('inquiryAddress');if(street&&!street.value)street.value=c.street_address||'';
        const city=document.getElementById('inquiryCity');if(city)city.value=c.city||'';
        const state=document.getElementById('inquiryState');if(state)state.value=c.state||'SC';
        const zip=document.getElementById('inquiryZip');if(zip)zip.value=c.zip||'';
      }
    }
  }

  document.body.addEventListener('click',e=>{if(e.target.closest('#detailInquiryBtn'))setTimeout(initializeInquiryExtras,0);},true);
  const type=document.getElementById('inquiryProductInterest');if(type)type.addEventListener('change',()=>{const category=document.getElementById('inquiryWorkCategory');if(category&&type.value)category.value=mapCategory(type.value);});

  function ensureAppointmentDialog(){
    if(document.getElementById('newInquiryAppointmentDialog'))return;
    const d=document.createElement('dialog');d.id='newInquiryAppointmentDialog';d.innerHTML=`<form method="dialog" class="card modal-form"><h2>Set Appointment</h2><div id="appointmentDialogNotice" class="notice hidden"></div><div class="sub" id="appointmentInquiryLabel" style="margin-bottom:12px"></div><div class="form-grid"><div><label>Appointment date/time</label><input id="newAppointmentAt" type="datetime-local"></div><div><label>Assigned to</label><select id="newAppointmentAssigned"><option>Roy</option><option>Eve</option><option>Jonathan</option><option>Other</option></select></div><div><label>Appointment type</label><select id="newAppointmentType"><option value="Sales Appointment">Sales Appointment</option><option value="Inspection">Inspection</option><option value="Estimate / Follow-up">Estimate / Follow-up</option><option value="Other">Other</option></select></div><div class="wide"><label>Appointment notes</label><textarea id="newAppointmentNotes" rows="3"></textarea></div></div><div class="toolbar"><button class="btn primary" id="saveNewAppointmentBtn" type="button">Save Appointment</button><button class="btn" id="skipNewAppointmentBtn" type="button">No Appointment Yet</button></div></form>`;
    document.body.appendChild(d);
    document.getElementById('saveNewAppointmentBtn').onclick=saveAppointment;
    document.getElementById('skipNewAppointmentBtn').onclick=finishWithoutAppointment;
  }
  function openAppointmentStep(data,c){
    ensureAppointmentDialog();pendingInquiry={data,c};document.getElementById('appointmentInquiryLabel').textContent=`Inquiry #${data.lead_number||''} — ${c.name||''}`;document.getElementById('newAppointmentAt').value='';document.getElementById('newAppointmentAssigned').value=data.assigned_to||'Roy';document.getElementById('newAppointmentType').value='Sales Appointment';document.getElementById('newAppointmentNotes').value='';const n=document.getElementById('appointmentDialogNotice');n.className='notice hidden';n.textContent='';document.getElementById('newInquiryAppointmentDialog').showModal();
  }
  function finishWithoutAppointment(){if(!pendingInquiry)return;const {data,c}=pendingInquiry;document.getElementById('newInquiryAppointmentDialog').close();location.href=`inquiry.html?id=${encodeURIComponent(data.id)}&contact=${encodeURIComponent(c.id)}`;}
  async function saveAppointment(){
    if(!pendingInquiry)return;const at=document.getElementById('newAppointmentAt').value;if(!at){const n=document.getElementById('appointmentDialogNotice');n.className='notice error';n.textContent='Choose the appointment date and time.';return;}
    const {data,c}=pendingInquiry;const row={lead_id:data.id,appointment_at:new Date(at).toISOString(),appointment_status:'Scheduled',assigned_to:document.getElementById('newAppointmentAssigned').value||'Roy',appointment_type:document.getElementById('newAppointmentType').value||'Sales Appointment',notes:document.getElementById('newAppointmentNotes').value.trim()||null,import_source:'Contact Inquiry'};
    const res=await db.from('appointments').insert(row).select('*').single();if(res.error){const n=document.getElementById('appointmentDialogNotice');n.className='notice error';n.textContent=res.error.message;return;}
    document.getElementById('newInquiryAppointmentDialog').close();location.href=`inquiry.html?id=${encodeURIComponent(data.id)}&contact=${encodeURIComponent(c.id)}`;
  }

  const saveButton=document.getElementById('saveInquiryBtn');
  if(saveButton)saveButton.onclick=async()=>{
    clearDialogNotice();saveButton.disabled=true;saveButton.textContent='Creating…';
    try{
      const cid=document.getElementById('inquiryContactId').value;const r=await db.from('contacts').select('*').eq('id',cid).single();if(r.error){dialogNotice(r.error.message);return;}const c=r.data;
      const selectedType=document.getElementById('inquiryProductInterest').value;if(!selectedType){dialogNotice('Choose the Product Interest / Inquiry Type.');return;}
      if(!document.getElementById('inquirySource').value){dialogNotice('Choose how this customer found Bauer Roofing.');return;}
      const number=document.getElementById('inquiryLeadNumber').value.trim();if(!number){dialogNotice('Inquiry Number is required.');return;}
      const dup=await db.from('leads').select('id,homeowner_name').eq('lead_number',number).is('deleted_at',null).limit(1);if(dup.error){dialogNotice(dup.error.message);return;}if((dup.data||[]).length){dialogNotice(`Inquiry #${number} is already assigned to ${dup.data[0].homeowner_name||'another contact'}. Choose the correct next number before creating this inquiry.`);return;}
      const atValue=document.getElementById('inquiryAt').value;
      const row={contact_id:c.id,lead_number:number,homeowner_name:c.name,street_address:document.getElementById('inquiryAddress').value.trim()||c.street_address||null,city:document.getElementById('inquiryCity')?.value.trim()||c.city||null,state:document.getElementById('inquiryState')?.value.trim()||c.state||null,zip:document.getElementById('inquiryZip')?.value.trim()||c.zip||null,phone:c.phone||null,phone_secondary:c.phone_secondary||null,phone_secondary_label:c.phone_secondary_label||null,email:c.email||null,source:document.getElementById('inquirySource').value||null,lead_source_secondary:document.getElementById('inquirySourceSecondary')?.value||null,import_source:'Contact Inquiry',product_interest:selectedType,product_description:document.getElementById('inquiryProductDescription').value.trim()||null,work_category:document.getElementById('inquiryWorkCategory').value,lead_status:'New Inquiry',inquiry_taken_by:document.getElementById('inquiryTakenBy')?.value||'Eve',assigned_to:document.getElementById('inquiryAssigned').value||'Roy',notes:document.getElementById('inquiryNotes').value.trim()||null,inquiry_at:atValue?new Date(atValue).toISOString():new Date().toISOString(),lead_date:(atValue?atValue.slice(0,10):new Date().toLocaleDateString('en-CA'))};
      const {data,error}=await db.from('leads').insert(row).select('*').single();if(error){dialogNotice(error.message);return;}
      document.getElementById('inquiryDialog').close();openAppointmentStep(data,c);
    }finally{saveButton.disabled=false;saveButton.textContent='Create Inquiry';}
  };
  ensureAppointmentDialog();
})();

