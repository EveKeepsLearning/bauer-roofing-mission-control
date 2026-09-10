'use strict';
(function(){
  const cfg=window.BAUER_CONFIG||{};
  const params=new URLSearchParams(location.search);
  const inquiryId=params.get('id');
  if(!inquiryId)return;

  const $=id=>document.getElementById(id);
  const val=id=>String($(id)?.value||'').trim();
  const nullable=id=>val(id)||null;
  const boolValue=id=>{
    const v=val(id).toLowerCase();
    if(v==='yes')return true;
    if(v==='no')return false;
    return null;
  };
  const boolLabel=v=>v===true?'Yes':v===false?'No':'';
  const norm=v=>String(v||'').trim().toLowerCase();
  const phoneDigits=v=>String(v||'').replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const localInput=v=>{
    if(!v)return'';
    const d=new Date(v);if(Number.isNaN(d.getTime()))return'';
    const p=n=>String(n).padStart(2,'0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  function database(){
    if(window.__broInquirySheetDb)return window.__broInquirySheetDb;
    if(!window.supabase||!cfg.SUPABASE_URL||!cfg.SUPABASE_ANON_KEY)return null;
    window.__broInquirySheetDb=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
    return window.__broInquirySheetDb;
  }

  function addStyles(){
    if($('broLeadSheetStyles'))return;
    const s=document.createElement('style');
    s.id='broLeadSheetStyles';
    s.textContent=`
      .bro-lead-sheet{padding:0!important;overflow:hidden}
      .bro-sheet-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;padding:16px 18px;background:#f8fafc;border-bottom:1px solid #dfe5ec}
      .bro-sheet-head h2{margin:0;font-size:18px}.bro-sheet-head .sub{margin-top:3px}
      .bro-sheet-section{padding:16px 18px;border-bottom:1px solid #e7ebf0}.bro-sheet-section:last-of-type{border-bottom:0}
      .bro-sheet-section h3{margin:0 0 12px;font-size:15px;color:#27384d}
      .bro-sheet-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:11px 12px}
      .bro-sheet-grid .span2{grid-column:span 2}.bro-sheet-grid .span3{grid-column:span 3}.bro-sheet-grid .span4{grid-column:1/-1}
      .bro-sheet-grid label{display:block;font-size:11px;font-weight:700;color:#637286;margin-bottom:4px}
      .bro-sheet-grid input,.bro-sheet-grid select,.bro-sheet-grid textarea{width:100%;border:1px solid #cfd8e3;border-radius:8px;padding:8px 9px;background:#fff;font:inherit}
      .bro-sheet-grid textarea{min-height:72px;resize:vertical}
      .bro-inline-note{font-size:11px;color:#7a8797;margin-top:4px}
      .bro-sheet-save{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 18px;background:#fff;position:sticky;bottom:0;z-index:5;border-top:1px solid #dfe5ec}
      .bro-save-status{font-size:12px;color:#5f6f81}.bro-save-status.ok{color:#16743a}.bro-save-status.err{color:#b3261e}
      @media(max-width:850px){.bro-sheet-grid{grid-template-columns:1fr 1fr}.bro-sheet-grid .span3,.bro-sheet-grid .span4{grid-column:1/-1}}
      @media(max-width:560px){.bro-sheet-grid{grid-template-columns:1fr}.bro-sheet-grid .span2,.bro-sheet-grid .span3,.bro-sheet-grid .span4{grid-column:auto}}
    `;
    document.head.appendChild(s);
  }

  function input(id,label,value='',cls=''){
    return `<div class="${cls}"><label for="${id}">${label}</label><input id="${id}" value="${esc(value)}"></div>`;
  }
  function select(id,label,value,options,cls=''){
    return `<div class="${cls}"><label for="${id}">${label}</label><select id="${id}"><option value=""></option>${options.map(o=>`<option value="${esc(o)}" ${String(value||'')===String(o)?'selected':''}>${esc(o)}</option>`).join('')}</select></div>`;
  }
  function textarea(id,label,value='',cls=''){
    return `<div class="${cls}"><label for="${id}">${label}</label><textarea id="${id}">${esc(value)}</textarea></div>`;
  }

  function leadSheetHtml(r){
    return `
      <div class="bro-sheet-head">
        <div><h2>Residential Roofing Lead / Inquiry</h2><div class="sub">Built from Bauer Roofing's lead sheet. Leave fields blank when they do not apply.</div></div>
        <div class="sub">Inquiry #${esc(r.lead_number||'—')}</div>
      </div>

      <div class="bro-sheet-section">
        <h3>Customer & Lead Information</h3>
        <div class="bro-sheet-grid">
          ${input('leadNumber','Inquiry / Lead No.',r.lead_number)}
          `<div><label for="inquiryAt">Date / time</label><input id="inquiryAt" type="datetime-local" value="${esc(localInput(r.inquiry_at||r.received_at))}"></div>`
          ${input('takenBy','Taken by',r.inquiry_taken_by||r.taken_by)}
          ${input('assignedTo','Assigned to',r.assigned_to||r.salesperson)}
          ${input('homeownerName','Name / Company',r.homeowner_name,'span2')}
          ${input('spouseName','Spouse / Co-Owner',r.spouse_name,'span2')}
          ${input('firstName','First name',r.first_name)}
          ${input('lastName','Last name',r.last_name)}
          ${input('phone','Phone (Primary)',r.phone)}
          ${input('phoneSecondary','Phone (Secondary)',r.phone_secondary)}
          ${input('email','E-mail address',r.email,'span2')}
        </div>
      </div>

      <div class="bro-sheet-section">
        <h3>Job Address</h3>
        <div class="bro-sheet-grid">
          ${input('address','Job Address',r.street_address,'span2')}
          ${input('city','City',r.city)}
          ${input('zip','ZIP',r.zip)}
          ${input('state','State',r.state||'SC')}
          ${input('subdivision','Subdivision',r.subdivision,'span3')}
          ${textarea('directions','Directions',r.directions,'span4')}
        </div>
      </div>

      <div class="bro-sheet-section">
        <h3>Mailing Address & Insurance</h3>
        <div class="bro-sheet-grid">
          ${input('mailingStreet','Mailing Address',r.mailing_street_address,'span2')}
          ${input('mailingCity','Mailing City',r.mailing_city)}
          ${input('mailingState','Mailing State',r.mailing_state)}
          ${input('mailingZip','Mailing ZIP',r.mailing_zip)}
          ${select('insuranceRelated','Insurance related?',boolLabel(r.insurance_related),['Yes','No'])}
          ${input('insuranceCompany','Insurance Company',r.insurance_company,'span2')}
        </div>
      </div>

      <div class="bro-sheet-section">
        <h3>Roof / Home Information</h3>
        <div class="bro-sheet-grid">
          ${input('shingleAge','How old are the shingles?',r.shingle_age)}
          ${input('desiredWorkTiming','When do they hope to have the work done?',r.desired_work_timing,'span2')}
          ${select('roofLayers','Layers of shingles',r.roof_layers,['1','2','Unknown'])}
          ${select('currentLeak','Any leaks now?',boolLabel(r.current_leak),['Yes','No'])}
          ${input('currentLeakLocation','If yes, where?',r.current_leak_location,'span3')}
          ${select('priorLeak','Has it ever leaked?',boolLabel(r.prior_leak),['Yes','No'])}
          ${input('priorLeakLocation','If yes, where?',r.prior_leak_location,'span3')}
          ${select('homeType','Type of home',r.home_type,['1-story','2-story','Other'])}
          ${select('roofPitch','Roof pitch / slope',r.roof_pitch,['Walk','Steep','Unknown'])}
          ${select('paymentPlan','Payment',r.payment_plan,['Cash','Financing','Insurance','Unknown'])}
        </div>
      </div>

      <div class="bro-sheet-section">
        <h3>How They Found Bauer Roofing</h3>
        <div class="bro-sheet-grid">
          ${input('source','Lead source',r.source,'span2')}
          ${input('sourceSecondary','Source detail / secondary source',r.lead_source_secondary,'span2')}
          ${select('referralCategory','Referral / advertising category',r.referral_category,[
            'Previous client','Other referral','Employee referral','Real estate agent','Yelp','Angi Ads','HomeAdvisor','Vital Storm','Signs - Office','Signs - Truck Sign','Signs - Jobsite','Internet - BCI','Internet - Classic','Internet - MRA','Internet - Other','Media Advertising','Telephone Solicitation','Yellow Pages - AT&T','Yellow Pages - Talking Phone Book','Direct Mail','Canvassing','Other'
          ],'span2')}
          ${input('referralDetail','Who / which piece / where?',r.referral_detail,'span2')}
        </div>
      </div>

      <div class="bro-sheet-section">
        <h3>Work Requested & Office Notes</h3>
        <div class="bro-sheet-grid">
          ${input('productInterest','Product interest',r.product_interest,'span2')}
          ${input('workCategory','Work category',r.work_category)}
          ${input('productDescription','Product description',r.product_description,'span4')}
          ${textarea('notes','Notes',r.notes,'span4')}
        </div>
      </div>

      <div class="bro-sheet-save">
        <div id="broLeadSheetSaveStatus" class="bro-save-status"></div>
        <button class="btn primary" id="saveInquiryBtn" type="button">Save Inquiry</button>
      </div>`;
  }

  async function exactContactFor(r){
    const db=database();
    if(!db||!r)return null;
    if(r.contact_id){
      const {data}=await db.from('contacts').select('*').eq('id',r.contact_id).maybeSingle();
      if(data)return data;
    }
    const candidates=new Map();
    const queries=[];
    if(r.email)queries.push(db.from('contacts').select('*').ilike('email',String(r.email).trim()).limit(10));
    if(r.phone)queries.push(db.from('contacts').select('*').eq('phone',r.phone).limit(10));
    if(r.homeowner_name)queries.push(db.from('contacts').select('*').ilike('name',String(r.homeowner_name).trim()).limit(20));
    if(queries.length){
      const results=await Promise.all(queries);
      results.forEach(x=>(x.data||[]).forEach(c=>candidates.set(c.id,c)));
    }
    const exact=[...candidates.values()].filter(c=>{
      const em=r.email&&c.email&&norm(r.email)===norm(c.email);
      const ph=r.phone&&c.phone&&phoneDigits(r.phone)===phoneDigits(c.phone);
      const ns=r.homeowner_name&&c.name&&r.street_address&&c.street_address&&norm(r.homeowner_name)===norm(c.name)&&norm(r.street_address)===norm(c.street_address);
      return em||ph||ns;
    });
    return exact.length===1?exact[0]:null;
  }

  async function ensureContact(r){
    const db=database();
    if(!db||!r||!String(r.homeowner_name||'').trim())return r;
    let contact=await exactContactFor(r);
    if(!contact){
      const mailing=r.mailing_street_address||r.street_address||null;
      const {data,error}=await db.from('contacts').insert({
        name:r.homeowner_name,
        phone:r.phone||null,
        email:r.email||null,
        street_address:mailing,
        city:r.mailing_city||r.city||null,
        state:r.mailing_state||r.state||null,
        zip:r.mailing_zip||r.zip||null,
        notes:`Created from Inquiry ${r.lead_number?'#'+r.lead_number:r.id} to keep Contact and Inquiry linked.`
      }).select('*').single();
      if(error)throw error;
      contact=data;
    }
    if(contact?.id&&r.contact_id!==contact.id){
      const {data,error}=await db.from('leads').update({contact_id:contact.id,updated_at:new Date().toISOString()}).eq('id',r.id).select('*').single();
      if(error)throw error;
      r=data;
    }
    return r;
  }

  async function saveSheet(){
    const db=database();
    if(!db)return;
    const status=$('broLeadSheetSaveStatus');
    const btn=$('saveInquiryBtn');
    btn.disabled=true;btn.textContent='Saving…';
    if(status){status.textContent='Saving inquiry…';status.className='bro-save-status';}
    try{
      const first=nullable('firstName'), last=nullable('lastName'), enteredName=nullable('homeownerName');
      const derivedName=[first,last].filter(Boolean).join(' ')||enteredName;
      const patch={
        lead_number:nullable('leadNumber'),
        inquiry_at:val('inquiryAt')?new Date(val('inquiryAt')).toISOString():null,
        inquiry_taken_by:nullable('takenBy'),taken_by:nullable('takenBy'),
        assigned_to:nullable('assignedTo'),
        homeowner_name:enteredName||derivedName,
        first_name:first,last_name:last,spouse_name:nullable('spouseName'),
        phone:nullable('phone'),phone_secondary:nullable('phoneSecondary'),email:nullable('email'),
        street_address:nullable('address'),city:nullable('city'),state:nullable('state'),zip:nullable('zip'),subdivision:nullable('subdivision'),directions:nullable('directions'),
        mailing_street_address:nullable('mailingStreet'),mailing_city:nullable('mailingCity'),mailing_state:nullable('mailingState'),mailing_zip:nullable('mailingZip'),
        insurance_related:boolValue('insuranceRelated'),insurance_company:nullable('insuranceCompany'),
        shingle_age:nullable('shingleAge'),desired_work_timing:nullable('desiredWorkTiming'),roof_layers:nullable('roofLayers'),
        current_leak:boolValue('currentLeak'),current_leak_location:nullable('currentLeakLocation'),prior_leak:boolValue('priorLeak'),prior_leak_location:nullable('priorLeakLocation'),
        home_type:nullable('homeType'),roof_pitch:nullable('roofPitch'),payment_plan:nullable('paymentPlan'),
        source:nullable('source'),lead_source_secondary:nullable('sourceSecondary'),referral_category:nullable('referralCategory'),referral_detail:nullable('referralDetail'),
        product_interest:nullable('productInterest'),product_description:nullable('productDescription'),work_category:nullable('workCategory'),notes:nullable('notes'),
        updated_at:new Date().toISOString()
      };
      if(!patch.homeowner_name)throw new Error('Name / Company is required.');
      const {data,error}=await db.from('leads').update(patch).eq('id',inquiryId).select('*').single();
      if(error)throw error;
      let saved=await ensureContact(data);
      if(saved.contact_id){
        const mailingStreet=saved.mailing_street_address||saved.street_address||null;
        const {error:contactError}=await db.from('contacts').update({
          name:saved.homeowner_name,phone:saved.phone||null,email:saved.email||null,
          street_address:mailingStreet,city:saved.mailing_city||saved.city||null,state:saved.mailing_state||saved.state||null,zip:saved.mailing_zip||saved.zip||null,
          updated_at:new Date().toISOString()
        }).eq('id',saved.contact_id);
        if(contactError)throw contactError;
      }
      if(status){status.textContent='Inquiry and Contact saved.';status.className='bro-save-status ok';}
      const title=$('title');if(title)title.textContent=saved.lead_number?`Inquiry #${saved.lead_number} — ${saved.homeowner_name}`:`Inquiry — ${saved.homeowner_name}`;
      setTimeout(()=>location.reload(),450);
    }catch(error){
      if(status){status.textContent=error?.message||String(error);status.className='bro-save-status err';}
    }finally{btn.disabled=false;btn.textContent='Save Inquiry';}
  }

  async function install(){
    addStyles();
    const db=database();
    if(!db)return;
    const section=$('saveInquiryBtn')?.closest('section.card2');
    if(!section||section.dataset.broLeadSheet==='1')return;
    const {data,error}=await db.from('leads').select('*').eq('id',inquiryId).single();
    if(error||!data)return;
    let record=data;
    try{record=await ensureContact(record);}catch(err){console.warn('Contact link self-repair:',err);}
    section.dataset.broLeadSheet='1';
    section.classList.add('bro-lead-sheet');
    section.innerHTML=leadSheetHtml(record);
    $('saveInquiryBtn')?.addEventListener('click',saveSheet);

    const back=$('backBtn');
    if(back&&record.contact_id){
      back.textContent='Back to Contact';
      back.onclick=()=>{location.href=`contacts.html?contact=${encodeURIComponent(record.contact_id)}&v=${encodeURIComponent(cfg.APP_VERSION||'')}`;};
    }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,250));
  else setTimeout(install,250);
})();
