'use strict';
(async()=>{
  const $=id=>document.getElementById(id),cfg=window.BAUER_CONFIG||{},params=new URLSearchParams(location.search);
  const status=$('printStatus');
  let blobUrl;
  try{
    const db=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
    const {data:auth,error:authError}=await db.auth.getSession();if(authError)throw authError;
    if(!auth.session)throw new Error('Sign into BRO in the Today tab, then reload this page.');
    let job={},lead={},contact={},appointments=[],leadId=params.get('inquiry');
    if(params.get('job')){
      const r=await db.from('jobs').select('*').eq('id',params.get('job')).single();if(r.error)throw r.error;job=r.data;leadId=job.lead_id;if(!leadId)throw new Error('This job has no linked inquiry. Link the correct inquiry before printing its lead sheet.');
      // Never guess which inquiry belongs to a legacy job by customer name or number.
    }
    if(leadId){const r=await db.from('leads').select('*').eq('id',leadId).single();if(r.error)throw r.error;lead=r.data;
      const a=await db.from('appointments').select('*').eq('lead_id',leadId).is('deleted_at',null).order('appointment_at',{ascending:false});if(a.error)throw a.error;appointments=a.data||[];
    }
    if(!leadId&&!job.id)throw new Error('Open Print Measure Sheet from an inquiry or job.');
    const contactId=lead.contact_id;
    if(contactId){const r=await db.from('contacts').select('*').eq('id',contactId).maybeSingle();if(r.error)throw r.error;contact=r.data||{};}
    const template=await fetch('assets/measure-sheet-template.pdf');if(!template.ok)throw new Error('The measure sheet template could not load. Please try again.');
    const fontResponse=await fetch('assets/measure-sheet-font.ttf');if(!fontResponse.ok)throw new Error('Print font could not load. Please try again.');
    const result=await BROMeasurePDF.build(await template.arrayBuffer(),lead,contact,appointments,window.PDFLib,await fontResponse.arrayBuffer(),window.fontkit);
    blobUrl=URL.createObjectURL(new Blob([result.bytes],{type:'application/pdf'}));
    $('sheetCustomer').textContent=[lead.homeowner_name||contact.name,lead.lead_number?'Inquiry #'+lead.lead_number:''].filter(Boolean).join(' • ');
    const frame=$('sheetPreview');frame.src=blobUrl;frame.classList.remove('hidden');
    for(const id of ['downloadSheet','openSheet']){$(id).href=blobUrl;$(id).classList.remove('hidden');}
    $('downloadSheet').download=('Measure-Sheet-'+(lead.lead_number||'Customer')).replace(/[^a-z0-9._-]/gi,'-')+'.pdf';
    $('printSheet').disabled=false;$('printSheet').onclick=()=>{try{frame.contentWindow.focus();frame.contentWindow.print();}catch(_){window.open(blobUrl,'_blank','noopener');}};
    status.textContent=`Ready — ${result.pages} pages.`+(result.shortened.length?' Some long fields were shortened to fit: '+result.shortened.join(', ')+'. Review the preview before printing.':'');
    window.addEventListener('pagehide',()=>URL.revokeObjectURL(blobUrl),{once:true});
  }catch(e){status.textContent='Could not prepare the sheet: '+(e.message||String(e));status.className='notice error';}
})();
