'use strict';
(function(){
  if(window.__broJobsContactSchedulingLoaded)return;
  window.__broJobsContactSchedulingLoaded=true;

  const $=id=>document.getElementById(id);
  const digits=value=>String(value||'').replace(/\D/g,'');
  const iso=value=>String(value||'').slice(0,10);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const stageRank=value=>{
    const s=String(value||'').trim().toLowerCase();
    if(s==='contract canceled')return 99;
    if(s==='final payment / closeout'||s==='closeout')return 8;
    if(s==='work complete')return 7;
    if(s==='in production'||s==='production')return 6;
    if(s==='material delivered')return 5;
    if(s==='scheduled')return 4;
    if(s==='ready to schedule')return 3;
    if(s==='material ordered')return 2;
    if(s==='deposit'||s==='contract / deposit'||s==='contract/deposit')return 1;
    return 0;
  };

  let saveWired=false,calendarWired=false,lastContactRequest=0;

  function client(){return window.BROUX?.client?.()||null;}
  function currentJob(){
    const id=$('editJobId')?.value;
    if(!id)return null;
    try{return typeof jobs!=='undefined'?jobs.find(j=>String(j.id)===String(id))||null:null;}catch{return null;}
  }
  function jobContactAddress(c){return [c?.street_address,c?.city,c?.state,c?.zip].filter(Boolean).join(', ');}

  function ensureContactPanel(){
    const dialog=$('jobDialog');
    if(!dialog||$('jobContactSummary'))return;
    const panel=document.createElement('section');
    panel.id='jobContactSummary';
    panel.className='job-contact-summary';
    panel.innerHTML='<div class="job-contact-head"><div><h3>Customer Contact Information</h3><div class="job-meta">Pulled from the linked Contact so the latest phone, email, and address stay together.</div></div></div><div id="jobContactBody" class="job-contact-body">Loading contact information…</div><div id="jobContactActions" class="job-contact-actions"></div>';
    const anchor=$('canceledInfo')||dialog.querySelector('h2');
    anchor.insertAdjacentElement('afterend',panel);
    const style=document.createElement('style');
    style.id='jobContactSummaryStyles';
    style.textContent='.job-contact-summary{margin:12px 0 18px;padding:14px;border:1px solid #d8e1eb;border-radius:10px;background:#f8fbff}.job-contact-head h3{margin:0 0 3px}.job-contact-body{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px 18px;margin-top:12px}.job-contact-item span{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#687588}.job-contact-item b,.job-contact-item a{overflow-wrap:anywhere}.job-contact-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}@media(max-width:700px){.job-contact-body{grid-template-columns:1fr}}';
    document.head.appendChild(style);
  }

  async function resolveContact(job){
    const db=client();
    if(!db||!job)return null;
    let contactId=job.customer_id||null;
    if(!contactId&&job.lead_id){
      const lead=await db.from('leads').select('contact_id').eq('id',job.lead_id).maybeSingle();
      if(!lead.error)contactId=lead.data?.contact_id||null;
    }
    if(!contactId)return null;
    const result=await db.from('contacts').select('id,name,phone,phone_secondary,phone_secondary_label,email,street_address,city,state,zip,preferred_contact_method').eq('id',contactId).maybeSingle();
    if(result.error)throw result.error;
    return result.data||null;
  }

  async function renderContactPanel(){
    ensureContactPanel();
    const body=$('jobContactBody'),actions=$('jobContactActions');
    if(!body||!actions)return;
    const request=++lastContactRequest;
    let job=currentJob();
    const db=client();
    const id=$('editJobId')?.value;
    if(!job&&db&&id){
      const result=await db.from('jobs').select('*').eq('id',id).maybeSingle();
      if(result.error){if(request===lastContactRequest)body.textContent='Could not load job contact information.';return;}
      job=result.data;
    }
    if(request!==lastContactRequest||!job)return;
    $('editExpectedStart').value=iso(job.target_start_date);
    body.textContent='Loading contact information…';actions.replaceChildren();
    try{
      const contact=await resolveContact(job);
      if(request!==lastContactRequest)return;
      if(!contact){
        body.innerHTML='<div class="job-contact-item"><span>Customer</span><b>'+esc(job.customer_name||'—')+'</b></div><div class="job-contact-item"><span>Property address</span><b>'+esc(job.property_address||'—')+'</b></div><div class="job-contact-item" style="grid-column:1/-1"><span>Contact record</span><b>No linked Contact was found for this job.</b></div>';
        if(job.lead_id)actions.innerHTML='<a class="btn small" href="inquiry.html?id='+encodeURIComponent(job.lead_id)+'">Open Inquiry</a>';
        return;
      }
      const contactAddress=jobContactAddress(contact);
      const secondaryLabel=contact.phone_secondary_label?` (${contact.phone_secondary_label})`:'';
      body.innerHTML=`<div class="job-contact-item"><span>Customer</span><b>${esc(contact.name||job.customer_name||'—')}</b></div><div class="job-contact-item"><span>Preferred contact</span><b>${esc(contact.preferred_contact_method||'—')}</b></div><div class="job-contact-item"><span>Primary phone</span>${contact.phone?`<a href="tel:${esc(digits(contact.phone))}">${esc(contact.phone)}</a>`:'<b>—</b>'}</div><div class="job-contact-item"><span>Secondary phone${esc(secondaryLabel)}</span>${contact.phone_secondary?`<a href="tel:${esc(digits(contact.phone_secondary))}">${esc(contact.phone_secondary)}</a>`:'<b>—</b>'}</div><div class="job-contact-item"><span>Email</span>${contact.email?`<a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a>`:'<b>—</b>'}</div><div class="job-contact-item"><span>Contact address</span><b>${esc(contactAddress||'—')}</b></div><div class="job-contact-item" style="grid-column:1/-1"><span>Job property address</span><b>${esc(job.property_address||'—')}</b></div>`;
      const links=[];
      if(contact.phone){links.push(`<a class="btn small" href="tel:${esc(digits(contact.phone))}">Call</a>`,`<a class="btn small" href="sms:${esc(digits(contact.phone))}">Text</a>`);}
      if(contact.phone_secondary){links.push(`<a class="btn small" href="tel:${esc(digits(contact.phone_secondary))}">Call Secondary</a>`);}
      if(contact.email)links.push(`<a class="btn small" href="mailto:${esc(contact.email)}">Email</a>`);
      links.push(`<a class="btn small" href="contacts.html?contact=${encodeURIComponent(contact.id)}">Open Contact</a>`);
      if(job.lead_id)links.push(`<a class="btn small" href="inquiry.html?id=${encodeURIComponent(job.lead_id)}">Open Inquiry</a>`);
      actions.innerHTML=links.join('');
    }catch(error){
      if(request===lastContactRequest)body.textContent='Could not load contact information: '+(error?.message||String(error));
    }
  }

  function wireDialog(){
    ensureContactPanel();
    const dialog=$('jobDialog');
    if(!dialog||dialog.dataset.broContactObserver)return;
    dialog.dataset.broContactObserver='1';
    new MutationObserver(()=>{if(dialog.open)renderContactPanel();}).observe(dialog,{attributes:true,attributeFilter:['open']});
    if(dialog.open)renderContactPanel();
  }

  function updateLocalJob(id,patch){
    try{
      if(typeof jobs==='undefined')return;
      const job=jobs.find(j=>String(j.id)===String(id));
      if(job)Object.assign(job,patch);
      if(typeof renderAll==='function')renderAll();
    }catch(_){ }
  }

  function wireSave(){
    if(saveWired)return true;
    const button=$('saveJobBtn'),expected=$('editExpectedStart'),stage=$('editStage');
    const db=client();
    if(!button||!expected||!stage||!db||typeof button.onclick!=='function')return false;
    const original=button.onclick;
    button.onclick=async function(event){
      const id=$('editJobId')?.value;
      if(!id)return original.call(this,event);
      const expectedDate=expected.value||null;
      const priorStage=stage.value;
      const promote=Boolean(expectedDate)&&stageRank(priorStage)<stageRank('Scheduled');
      if(promote)stage.value='Scheduled';
      button.disabled=true;
      try{
        await original.call(this,event);
        const enforcedPatch={target_start_date:expectedDate,updated_at:new Date().toISOString()};
        if(promote)enforcedPatch.stage='Scheduled';
        const saved=await db.from('jobs').update(enforcedPatch).eq('id',id).select('id,stage,target_start_date').single();
        if(saved.error)throw saved.error;
        updateLocalJob(id,saved.data||enforcedPatch);
        if(expectedDate){
          const text=promote?'Expected start saved. Job moved to Scheduled and added to Job Calendar.':'Expected start saved and added to Job Calendar.';
          if(typeof notice==='function')notice(text,'success');
          else window.BROUX?.toast?.(text);
        }
      }catch(error){
        if(promote)stage.value=priorStage;
        const text='Could not save Expected Start: '+(error?.message||String(error));
        if(typeof notice==='function')notice(text,'error');else alert(text);
      }finally{button.disabled=false;}
    };
    saveWired=true;
    return true;
  }

  function wireCalendar(){
    if(calendarWired)return true;
    try{
      if(typeof renderCalendar!=='function'||typeof filtered!=='function'||typeof addDays!=='function'||typeof sameDay!=='function'||typeof weekStart==='undefined')return false;
      const original=renderCalendar;
      renderCalendar=function(){
        original();
        const grid=$('calendarGrid');
        if(!grid||grid.querySelector('[data-bro-expected-start]'))return;
        const days=Array.from({length:7},(_,i)=>addDays(weekStart,i));
        const cells=[];
        const label=document.createElement('div');label.className='cal-cell cal-head';label.dataset.broExpectedStart='1';label.textContent='Expected Start';cells.push(label);
        for(const day of days){
          const cell=document.createElement('div');cell.className='cal-cell';
          const events=filtered().filter(job=>sameDay(job.target_start_date,day));
          cell.innerHTML=events.map(job=>`<div class="cal-event" data-job-id="${esc(job.id)}"><b>${esc(job.job_number||'')}</b><br>${esc(job.customer_name||'')}</div>`).join('');
          cells.push(cell);
        }
        const before=grid.children[8]||null;
        for(const cell of cells)grid.insertBefore(cell,before);
      };
      calendarWired=true;
      renderCalendar();
      return true;
    }catch{return false;}
  }

  function init(){
    wireDialog();
    wireSave();
    wireCalendar();
    if(saveWired&&calendarWired)return;
    setTimeout(init,200);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
