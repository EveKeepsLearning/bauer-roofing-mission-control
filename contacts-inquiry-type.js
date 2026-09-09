'use strict';
(function(){
  const mapCategory=value=>({
    'Roofing (Asphalt)':'Roofing',
    'Metal Roofing':'Roofing',
    'Repairs':'Repair',
    'Windows':'Windows',
    'Siding':'Siding',
    'Gutters':'Gutters',
    'Miscellaneous':'Other',
    'Warranty':'Repair',
    'Ventilation':'Repair',
    'Other':'Other'
  }[value]||'Roofing');

  function nowLocalInput(){
    const d=new Date(),pad=n=>String(n).padStart(2,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function initializeInquiryExtras(){
    const at=document.getElementById('inquiryAt');
    const type=document.getElementById('inquiryProductInterest');
    const desc=document.getElementById('inquiryProductDescription');
    if(at)at.value=nowLocalInput();
    if(type)type.value='';
    if(desc)desc.value='';
  }

  document.body.addEventListener('click',e=>{
    if(e.target.closest('#detailInquiryBtn'))setTimeout(initializeInquiryExtras,0);
  },true);

  const type=document.getElementById('inquiryProductInterest');
  if(type)type.addEventListener('change',()=>{
    const category=document.getElementById('inquiryWorkCategory');
    if(category&&type.value)category.value=mapCategory(type.value);
  });

  const saveButton=document.getElementById('saveInquiryBtn');
  if(saveButton)saveButton.onclick=async()=>{
    const cid=document.getElementById('inquiryContactId').value;
    const r=await db.from('contacts').select('*').eq('id',cid).single();
    if(r.error)return notice(r.error.message,'error');
    const c=r.data;
    const selectedType=document.getElementById('inquiryProductInterest').value;
    if(!selectedType)return notice('Choose the Product Interest / Inquiry Type.','error');
    const atValue=document.getElementById('inquiryAt').value;
    const row={
      contact_id:c.id,
      lead_number:document.getElementById('inquiryLeadNumber').value.trim()||null,
      homeowner_name:c.name,
      street_address:document.getElementById('inquiryAddress').value.trim()||c.street_address||null,
      phone:c.phone||null,
      email:c.email||null,
      source:document.getElementById('inquirySource').value.trim()||'Repeat Business',
      import_source:'Contact Inquiry',
      product_interest:selectedType,
      product_description:document.getElementById('inquiryProductDescription').value.trim()||null,
      work_category:document.getElementById('inquiryWorkCategory').value,
      lead_status:'Appointment Wanted',
      assigned_to:document.getElementById('inquiryAssigned').value.trim()||'Roy',
      notes:document.getElementById('inquiryNotes').value.trim()||null,
      inquiry_at:atValue?new Date(atValue).toISOString():new Date().toISOString(),
      lead_date:(atValue?atValue.slice(0,10):new Date().toLocaleDateString('en-CA'))
    };
    const {data,error}=await db.from('leads').insert(row).select('*').single();
    if(error)return notice(error.message,'error');
    document.getElementById('inquiryDialog').close();
    location.href=`inquiry.html?id=${encodeURIComponent(data.id)}&contact=${encodeURIComponent(c.id)}`;
  };
})();