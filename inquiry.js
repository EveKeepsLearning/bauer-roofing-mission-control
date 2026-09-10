'use strict';
const cfg=window.BAUER_CONFIG||{};
const $=id=>document.getElementById(id);
let db=null;
let inquiry=null;
let appointments=[];
let linkedJob=null;
let resolvedContactId='';
const params=new URLSearchParams(location.search);
const inquiryId=params.get('id');
const requestedContactId=params.get('contact');

function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));}
function notice(t,type=''){const n=$('notice');if(!n)return;n.textContent=t||'';n.className=`notice ${type}`.trim();if(!t)n.classList.add('hidden');}
function localInput(v){if(!v)return'';const d=new Date(v);if(Number.isNaN(d.getTime()))return'';const pad=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;}
function dateTimeLabel(v){if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString();}
function norm(v){return String(v||'').trim().toLowerCase();}
function phoneDigits(v){return String(v||'').replace(/\D/g,'');}
function exactContactId(){return inquiry?.contact_id||requestedContactId||linkedJob?.customer_id||resolvedContactId||'';}
function fullAddress(){return [inquiry?.street_address,inquiry?.city,inquiry?.state,inquiry?.zip].filter(Boolean).join(', ');}

function renderCustomerSummary(){
  const box=$('customerSummary');
  if(!box||!inquiry)return;
  const number=inquiry.lead_number?`Inquiry #${esc(inquiry.lead_number)}`:'Inquiry number not assigned';
  const name=esc(inquiry.homeowner_name||'Unnamed customer');
  const addr=esc(fullAddress()||'No property address');
  box.innerHTML=`
    <div class="customer-summary-main">
      <div class="customer-kicker">${number}</div>
      <div class="customer-name">${name}</div>
      <div class="customer-address">${addr}</div>
    </div>
    <div class="customer-contact-grid">
      <div><span>Phone</span>${inquiry.phone?`<a href="tel:${esc(phoneDigits(inquiry.phone))}">${esc(inquiry.phone)}</a>`:'<b>—</b>'}</div>
      <div><span>Email</span>${inquiry.email?`<a href="mailto:${esc(inquiry.email)}">${esc(inquiry.email)}</a>`:'<b>—</b>'}</div>
      <div><span>Assigned</span><b>${esc(inquiry.assigned_to||inquiry.salesperson||'—')}</b></div>
      <div><span>Source</span><b>${esc(inquiry.source||'—')}</b></div>
    </div>
    <div class="customer-quick-actions">
      ${inquiry.phone?`<a class="btn small" href="tel:${esc(phoneDigits(inquiry.phone))}">Call</a><a class="btn small" href="sms:${esc(phoneDigits(inquiry.phone))}">Text</a>`:''}
      ${inquiry.email?`<a class="btn small" href="mailto:${esc(inquiry.email)}">Email</a>`:''}
    </div>`;
}

function fill(){
  if(!inquiry)return;
  $('title').textContent=inquiry.lead_number?`Inquiry #${inquiry.lead_number} — ${inquiry.homeowner_name||'Unnamed customer'}`:`Inquiry — ${inquiry.homeowner_name||'Unnamed customer'}`;
  $('subtitle').textContent=inquiry.lead_number?'Customer and inquiry details':'No inquiry number has been assigned yet';
  $('leadNumber').value=inquiry.lead_number||'';
  $('inquiryAt').value=localInput(inquiry.inquiry_at||inquiry.received_at);
  $('takenBy').value=inquiry.inquiry_taken_by||inquiry.taken_by||'';
  $('assignedTo').value=inquiry.assigned_to||inquiry.salesperson||'';
  $('source').value=inquiry.source||'';
  $('sourceSecondary').value=inquiry.lead_source_secondary||'';
  $('productInterest').value=inquiry.product_interest||'';
  $('productDescription').value=inquiry.product_description||'';
  $('workCategory').value=inquiry.work_category||'';
  $('phone').value=inquiry.phone||'';
  $('email').value=inquiry.email||'';
  $('address').value=inquiry.street_address||'';
  $('city').value=inquiry.city||'';
  $('state').value=inquiry.state||'';
  $('zip').value=inquiry.zip||'';
  $('notes').value=inquiry.notes||'';
  renderCustomerSummary();
}

async function linkContact(cid){
  if(!cid)return'';
  const {error}=await db.from('leads').update({contact_id:cid,updated_at:new Date().toISOString()}).eq('id',inquiryId);
  if(error)throw error;
  inquiry.contact_id=cid;
  resolvedContactId=cid;
  if(linkedJob&&!linkedJob.customer_id){
    await db.from('jobs').update({customer_id:cid,updated_at:new Date().toISOString()}).eq('id',linkedJob.id);
    linkedJob.customer_id=cid;
  }
  return cid;
}

async function findExactContact(){
  if(!inquiry)return'';
  const searches=[];
  if(inquiry.email) searches.push(db.from('contacts').select('*').ilike('email',inquiry.email.trim()).limit(5));
  if(inquiry.phone) searches.push(db.from('contacts').select('*').eq('phone',inquiry.phone).limit(5));
  if(inquiry.homeowner_name) searches.push(db.from('contacts').select('*').ilike('name',inquiry.homeowner_name.trim()).limit(10));
  if(!searches.length)return'';
  const results=await Promise.all(searches);
  const map=new Map();
  results.forEach(r=>(r.data||[]).forEach(c=>map.set(c.id,c)));
  const candidates=[...map.values()].filter(c=>{
    const emailMatch=inquiry.email&&c.email&&norm(inquiry.email)===norm(c.email);
    const phoneMatch=inquiry.phone&&c.phone&&phoneDigits(inquiry.phone)===phoneDigits(c.phone);
    const nameMatch=inquiry.homeowner_name&&c.name&&norm(inquiry.homeowner_name)===norm(c.name);
    const streetMatch=inquiry.street_address&&c.street_address&&norm(inquiry.street_address)===norm(c.street_address);
    return emailMatch||phoneMatch||(nameMatch&&streetMatch);
  });
  return candidates.length===1?candidates[0].id:'';
}

async function ensureContactId(){
  const known=exactContactId();
  if(known){
    if(!inquiry.contact_id)await linkContact(known);
    return known;
  }
  const match=await findExactContact();
  if(match)return linkContact(match);
  const name=String(inquiry?.homeowner_name||'').trim();
  if(!name)throw new Error('This inquiry needs a customer name before a contact can be created.');
  const row={
    name,
    phone:inquiry.phone||null,
    email:inquiry.email||null,
    street_address:inquiry.street_address||null,
    city:inquiry.city||null,
    state:inquiry.state||null,
    zip:inquiry.zip||null,
    notes:`Created from ${inquiry.lead_number?`Inquiry #${inquiry.lead_number}`:'an existing inquiry'} so the inquiry and contact remain linked.`
  };
  const {data,error}=await db.from('contacts').insert(row).select('*').single();
  if(error)throw error;
  return linkContact(data.id);
}

async function goToContact(){
  try{
    notice('Opening customer contact…');
    const cid=await ensureContactId();
    location.href=`contacts.html?contact=${encodeURIComponent(cid)}`;
  }catch(err){
    notice(`Could not open the customer contact: ${err?.message||String(err)}`,'error');
  }
}

function renderAppointments(){
  const box=$('appointmentList');
  box.innerHTML=appointments.length?appointments.map(a=>`<div class="appt" data-appt-id="${esc(a.id)}"><div class="appt-grid"><div><b>${esc(dateTimeLabel(a.appointment_at))}</b><div class="sub">${esc(a.appointment_type||'Appointment')}</div></div><div><b>${esc(a.assigned_to||'')}</b><div>${esc(a.notes||'')}</div></div><div>${esc(a.appointment_result||a.appointment_status||'')}</div></div></div>`).join(''):'<div class="empty">No appointments yet.</div>';
  box.querySelectorAll('[data-appt-id]').forEach(el=>el.onclick=()=>openAppointment(appointments.find(a=>a.id===el.dataset.apptId)));
}
function openAppointment(a=null){const x=a||{};$('appointmentTitle').textContent=a?'Edit Appointment':'Add Appointment';$('appointmentId').value=x.id||'';$('appointmentAt').value=localInput(x.appointment_at);$('appointmentAssigned').value=x.assigned_to||inquiry?.assigned_to||'Roy';$('appointmentType').value=x.appointment_type||'';$('appointmentResult').value=x.appointment_result||'';$('appointmentResultNote').value=x.appointment_result_note||'';$('appointmentNotes').value=x.notes||'';$('appointmentDialog').showModal();}
async function saveInquiry(){const patch={lead_number:$('leadNumber').value.trim()||null,inquiry_at:$('inquiryAt').value?new Date($('inquiryAt').value).toISOString():null,inquiry_taken_by:$('takenBy').value.trim()||null,assigned_to:$('assignedTo').value.trim()||null,source:$('source').value.trim()||null,lead_source_secondary:$('sourceSecondary').value.trim()||null,product_interest:$('productInterest').value.trim()||null,product_description:$('productDescription').value.trim()||null,work_category:$('workCategory').value.trim()||null,phone:$('phone').value.trim()||null,email:$('email').value.trim()||null,street_address:$('address').value.trim()||null,city:$('city').value.trim()||null,state:$('state').value.trim()||null,zip:$('zip').value.trim()||null,notes:$('notes').value.trim()||null,updated_at:new Date().toISOString()};const {data,error}=await db.from('leads').update(patch).eq('id',inquiryId).select('*').single();if(error)return notice(error.message,'error');inquiry=data;fill();notice('Inquiry updated.','success');}
async function saveAppointment(){const id=$('appointmentId').value;const row={lead_id:inquiryId,appointment_at:$('appointmentAt').value?new Date($('appointmentAt').value).toISOString():null,assigned_to:$('appointmentAssigned').value.trim()||null,appointment_type:$('appointmentType').value.trim()||null,appointment_result:$('appointmentResult').value.trim()||null,appointment_result_note:$('appointmentResultNote').value.trim()||null,notes:$('appointmentNotes').value.trim()||null,updated_at:new Date().toISOString()};let res;if(id)res=await db.from('appointments').update(row).eq('id',id).select('*').single();else res=await db.from('appointments').insert(row).select('*').single();if(res.error)return notice(res.error.message,'error');if(id)appointments=appointments.map(a=>a.id===id?res.data:a);else appointments.unshift(res.data);$('appointmentDialog').close();renderAppointments();notice(id?'Appointment updated.':'Appointment added.','success');}
function installContextMenu(){if($('inquiryContext'))return;const style=document.createElement('style');style.textContent='.inquiry-ctx{position:fixed;z-index:6000;min-width:220px;background:#fff;border:1px solid #cfd8e3;border-radius:9px;box-shadow:0 10px 28px rgba(20,35,55,.18);padding:5px;display:none}.inquiry-ctx button{display:block;width:100%;border:0;background:#fff;text-align:left;padding:8px 9px;border-radius:6px;cursor:pointer}.inquiry-ctx button:hover{background:#eef4fb}';document.head.appendChild(style);const menu=document.createElement('div');menu.id='inquiryContext';menu.className='inquiry-ctx';document.body.appendChild(menu);}
function hideContext(){const m=$('inquiryContext');if(m)m.style.display='none';}
function showContext(e,appt=null){const m=$('inquiryContext');if(!m||!inquiry)return;const items=[];if(appt)items.push(['Edit appointment',()=>openAppointment(appt)]);items.push(['Open this customer contact',()=>goToContact()]);if(inquiry.phone)items.push(['Call customer',()=>location.href=`tel:${phoneDigits(inquiry.phone)}`],['Text customer',()=>location.href=`sms:${phoneDigits(inquiry.phone)}`]);if(inquiry.email)items.push(['Email customer',()=>location.href=`mailto:${inquiry.email}`]);if(!appt)items.push(['Add appointment',()=>openAppointment()],['Save inquiry',()=>saveInquiry()]);if(linkedJob)items.push(['Open job',()=>location.href=`jobs.html?job=${encodeURIComponent(linkedJob.id)}`]);items.push(['Copy inquiry number',()=>navigator.clipboard?.writeText(inquiry.lead_number||'')],['Copy address',()=>navigator.clipboard?.writeText(fullAddress())]);m.innerHTML=items.map((x,i)=>`<button type="button" data-mi="${i}">${esc(x[0])}</button>`).join('');m.querySelectorAll('button').forEach((b,i)=>b.onclick=()=>{hideContext();items[i][1]();});m.style.display='block';requestAnimationFrame(()=>{const r=m.getBoundingClientRect();m.style.left=Math.max(8,Math.min(e.clientX,innerWidth-r.width-8))+'px';m.style.top=Math.max(8,Math.min(e.clientY,innerHeight-r.height-8))+'px';});}
async function load(){if(!inquiryId)return notice('No inquiry was selected.','error');const [iRes,aRes,jRes]=await Promise.all([db.from('leads').select('*').eq('id',inquiryId).single(),db.from('appointments').select('*').eq('lead_id',inquiryId).is('deleted_at',null).order('appointment_at',{ascending:false}),db.from('jobs').select('*').eq('lead_id',inquiryId).is('deleted_at',null).order('created_at',{ascending:false}).limit(1)]);if(iRes.error)return notice(iRes.error.message,'error');inquiry=iRes.data;appointments=aRes.data||[];linkedJob=(jRes.data||[])[0]||null;fill();renderAppointments();if(linkedJob){$('jobBtn').style.display='inline-flex';$('jobBtn').onclick=()=>location.href=`jobs.html?job=${encodeURIComponent(linkedJob.id)}`;}}
async function start(){installContextMenu();db=supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);const {data,error}=await db.auth.getSession();if(error)return notice(error.message,'error');if(!data.session){location.href='index.html';return;}await load();}
$('saveInquiryBtn').onclick=saveInquiry;
$('addAppointmentBtn').onclick=()=>openAppointment();
$('saveAppointmentBtn').onclick=saveAppointment;
$('backBtn').onclick=goToContact;
document.addEventListener('click',e=>{if(!e.target.closest('#inquiryContext'))hideContext();});
document.addEventListener('contextmenu',e=>{const apptEl=e.target.closest('[data-appt-id]');const inPage=e.target.closest('.shell');if(!inPage)return;e.preventDefault();const appt=apptEl?appointments.find(a=>a.id===apptEl.dataset.apptId):null;showContext(e,appt);});
document.addEventListener('keydown',e=>{if(e.key==='Escape')hideContext();});
start();