'use strict';
(function(root){
  const join=(...v)=>v.filter(x=>x!=null&&String(x).trim()).join(', ');
  const date=v=>{if(!v)return '';const d=new Date(/^\d{4}-\d{2}-\d{2}$/.test(v)?v+'T12:00:00':v);return Number.isNaN(d.getTime())?'':d.toLocaleDateString('en-US',{timeZone:'America/New_York'});};
  const bool=v=>v===true?'Yes':v===false?'No':'';
  async function build(template,lead={},contact={},appointments=[],lib=root.PDFLib,fontBytes=null,fontkit=root.fontkit){
    const {PDFDocument,StandardFonts,rgb}=lib;
    const doc=await PDFDocument.load(template);
    if(doc.getPageCount()!==2)throw new Error('The measure-sheet template must contain two pages.');
    // Page 1 is intentionally never drawn on: measurements remain exactly as supplied.
    if(fontBytes&&fontkit)doc.registerFontkit(fontkit);
    const page=doc.getPage(1),font=await doc.embedFont(fontBytes||StandardFonts.Helvetica,{subset:true});
    const shortened=[];
    const clean=v=>String(v??'').replace(/[\r\n]+/g,' ').replace(/[–—]/g,'-').replace(/[“”]/g,'"').replace(/[‘’]/g,"'");
    const enc=v=>Array.from(clean(v)).map(c=>{try{font.encodeText(c);return c;}catch(_){return '?';}}).join('');
    function field(label,value,x,top,width,size=10){
      if(value==null||value==='')return;
      let text=enc(value),s=size;
      while(s>8&&font.widthOfTextAtSize(text,s)>width)s-=.25;
      if(font.widthOfTextAtSize(text,s)>width){shortened.push(label);while(text.length&&font.widthOfTextAtSize(text+'...',s)>width)text=text.slice(0,-1);text+='...';}
      page.drawRectangle({x:x-1,y:792-top-12,width:width+2,height:14,color:rgb(1,1,1)});
      page.drawText(text,{x,y:792-top-9,size:s,font,color:rgb(0,0,0)});
    }
    function mark(x,top){page.drawText('X',{x,y:792-top-7,size:10,font,color:rgb(0,0,0)});}
    const name=lead.homeowner_name||contact.name||'';
    field('Inquiry number',lead.lead_number,99,75,87);
    field('Inquiry date',date(lead.inquiry_at||lead.lead_date||lead.received_at),233,75,104);
    field('Taken by',lead.inquiry_taken_by||lead.taken_by,407,75,164);
    field('Customer',name,84,104.6,258);
    // Remove First/Last hints because BRO also supports household and company names.
    page.drawRectangle({x:130,y:792-125,width:145,height:12,color:rgb(1,1,1)});
    field('Co-owner',lead.spouse_name,399,104.6,171);
    field('Job address',lead.street_address||contact.street_address,115,134.1,455);
    field('City / state / ZIP',join(lead.city||contact.city,lead.state||contact.state,lead.zip||contact.zip),96,157.7,216);
    field('Subdivision',lead.subdivision,384,157.7,186);
    field('Primary phone',lead.phone||contact.phone,123,181.2,104);
    const secondary=lead.phone_secondary||contact.phone_secondary,label=lead.phone_secondary_label||contact.phone_secondary_label||'';
    field('Secondary phone',secondary,/spouse|co.?owner/i.test(label)?474:274,181.2,104);
    field('Email',lead.email||contact.email,125,204.7,427);
    field('Mailing address',join(lead.mailing_street_address,lead.mailing_city,lead.mailing_state,lead.mailing_zip)||join(contact.street_address,contact.city,contact.state,contact.zip),132,228.2,438);
    field('Directions',lead.directions,98,251.8,472);
    field('Insurance related',bool(lead.insurance_related),175,275.3,39);
    field('Insurance company',lead.insurance_company,278,275.3,292);
    field('Shingle age',lead.shingle_age,283,333,53);
    field('Desired timing',lead.desired_work_timing,282,352.9,260);
    if(lead.roof_layers==='1')mark(358,372.8);
    else if(lead.roof_layers==='2')mark(422,372.8);
    else if(lead.roof_layers)field('Layers',lead.roof_layers,460,372.8,105);
    field('Current leak',bool(lead.current_leak)?'('+bool(lead.current_leak)+')':'',158,392.8,54);
    field('Current leak location',lead.current_leak_location,289,392.8,281);
    field('Prior leak',bool(lead.prior_leak)?'('+bool(lead.prior_leak)+')':'',129,412.7,54);
    field('Prior leak location',lead.prior_leak_location,261,412.7,309);
    if(/1.story|2.story/i.test(lead.home_type||''))mark(/1.story/i.test(lead.home_type)?210:285,432.6);else if(lead.home_type)field('Home type',lead.home_type,355,432.6,59);
    if(/walk|steep/i.test(lead.roof_pitch||''))mark(/steep/i.test(lead.roof_pitch)?435:363,452.5);else if(lead.roof_pitch)field('Roof pitch',lead.roof_pitch,492,452.5,70);
    if(/cash|financing/i.test(lead.payment_plan||''))mark(/cash/i.test(lead.payment_plan)?105:170,472.5);else if(lead.payment_plan)field('Payment plan',lead.payment_plan,270,472.5,90);
    // Summarize attribution in its own area; keep original referral choices available for handwriting.
    field('Source',join(lead.source,lead.lead_source_secondary,lead.referral_category,lead.referral_detail),103,512.3,467,9);
    const current=appointments.filter(a=>!a.deleted_at&&!/cancel|reschedul/i.test(a.appointment_status||'')&&a.appointment_at).sort((a,b)=>new Date(b.appointment_at)-new Date(a.appointment_at));
    const measure=current.find(a=>/measure|inspection|sales appointment/i.test(a.appointment_type||''));
    const proposal=current.find(a=>/proposal|estimate|presentation/i.test(a.appointment_type||'')&&!/measure/i.test(a.appointment_type||''));
    function appointment(a,top){if(!a)return;const d=new Date(a.appointment_at);field('Appointment time',d.toLocaleTimeString('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'}),165,top,100);field('Appointment day',d.toLocaleDateString('en-US',{timeZone:'America/New_York',weekday:'short'}),309,top,52);field('Appointment date',date(a.appointment_at),409,top,84);}
    appointment(measure,677);appointment(proposal,696.9);
    field('Salesperson',lead.assigned_to||lead.salesperson||measure?.assigned_to,100,716.8,205);
    // The template's "competitor bid" field is deliberately not filled with our quoted price.
    doc.setTitle(`Measure Sheet - ${name} - ${lead.lead_number||''}`);
    doc.catalog.getOrCreateViewerPreferences().setDuplex(lib.Duplex.DuplexFlipLongEdge);
    return {bytes:await doc.save(),pages:doc.getPageCount(),shortened};
  }
  root.BROMeasurePDF={build};
  if(typeof module!=='undefined'&&module.exports)module.exports={build};
})(typeof globalThis!=='undefined'?globalThis:this);
