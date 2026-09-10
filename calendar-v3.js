'use strict';
(function(){
  const cfg=window.BAUER_CONFIG||{};
  const VERSION='20260910-13';
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=v=>String(v||'').trim().toLowerCase();
  const digits=v=>String(v||'').replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'');
  const db=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
  let weekStart=startOfWeek(new Date());
  let events=[];
  let activeEvent=null;
  let inquiryCache=new Map();
  let contactCache=new Map();

  function startOfWeek(d){const x=new Date(d);x.setHours(0,0,0,0);x.setDate(x.getDate()-x.getDay());return x;}
  function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x;}
  function fmtDay(d){return d.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});}
  function fmtTime(v){if(!v)return'';const d=new Date(v);return d.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});}
  function fmtRange(a,b){return `${fmtTime(a)}${b?' – '+fmtTime(b):''}`;}
  function formatPhone(v){const d=digits(v);return d.length===10?`(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`:String(v||'');}
  function contactNameFromEvent(e){return [e.contact_first_name,e.contact_last_name].filter(Boolean).join(' ').trim();}
  function propertyFromEvent(e){return String(e.property_text||'').trim();}
  function eventClass(e){const code=String(e.appointment_code||'').toUpperCase();if(code==='F'||/repair/i.test(e.appointment_type||''))return'repair';return'reroof';}
  function status(text,type=''){const el=$('status');if(el){el.textContent=text||'';el.className=`status ${type}`.trim();}}

  async function loadWeek(){
    status('Loading calendar…');
    const start=weekStart.toISOString(),end=addDays(weekStart,7).toISOString();
    const {data,error}=await db.from('calendar_events').select('*').gte('start_at',start).lt('start_at',end).order('start_at');
    if(error){status(error.message,'error');return;}
    events=data||[];
    await preloadMatched();
    render();
    status('');
  }

  async function preloadMatched(){
    inquiryCache=new Map();contactCache=new Map();
    const ids=[...new Set(events.map(e=>e.matched_lead_id).filter(Boolean))];
    if(!ids.length)return;
    const {data:leads}=await db.from('leads').select('*').in('id',ids);
    (leads||[]).forEach(l=>inquiryCache.set(l.id,l));
    const cids=[...new Set((leads||[]).map(l=>l.contact_id).filter(Boolean))];
    if(cids.length){const {data:contacts}=await db.from('contacts').select('*').in('id',cids);(contacts||[]).forEach(c=>contactCache.set(c.id,c));}
  }

  function render(){
    $('periodTitle').textContent=`${weekStart.toLocaleDateString(undefined,{month:'long',year:'numeric'})}`;
    const heads=$('dayHeads');heads.innerHTML='';
    const cols=$('dayCols');cols.innerHTML='';
    for(let i=0;i<7;i++){
      const d=addDays(weekStart,i);
      const h=document.createElement('div');h.className='day-head'+(sameDay(d,new Date())?' today':'');h.innerHTML=`<div>${esc(d.toLocaleDateString(undefined,{weekday:'short'}))}</div><b>${d.getDate()}</b>`;heads.appendChild(h);
      const c=document.createElement('div');c.className='day-col';c.dataset.day=i;cols.appendChild(c);
    }
    events.forEach(renderEvent);
  }

  function sameDay(a,b){return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();}
  function renderEvent(e){
    const d=new Date(e.start_at);const day=d.getDay();const col=$('dayCols').children[day];if(!col)return;
    const startMin=(d.getHours()*60+d.getMinutes())-7*60;const end=e.end_at?new Date(e.end_at):new Date(d.getTime()+90*60000);const dur=Math.max(45,(end-d)/60000);
    const top=Math.max(0,startMin)*(52/60),height=Math.max(42,dur*(52/60));
    const inquiry=e.matched_lead_id?inquiryCache.get(e.matched_lead_id):null;
    const contact=inquiry?.contact_id?contactCache.get(inquiry.contact_id):null;
    const name=contact?.name||inquiry?.homeowner_name||contactNameFromEvent(e)||'';
    const el=document.createElement('button');
    el.type='button';el.className=`cal-event ${eventClass(e)}${e.matched_lead_id?' matched':''}`;el.style.top=`${top}px`;el.style.height=`${height}px`;
    el.innerHTML=`<b>${esc(e.summary||'Appointment')}</b><span>${esc(fmtRange(e.start_at,e.end_at))}</span>${name?`<span>${esc(name)}</span>`:''}${e.matched_lead_id?'<i title="Matched">✓</i>':''}`;
    el.onclick=()=>openEvent(e);col.appendChild(el);
  }

  async function openEvent(e){
    activeEvent=e;
    $('eventTitle').textContent=e.summary||'Appointment';
    $('eventWhen').textContent=`${fmtDay(new Date(e.start_at))} • ${fmtRange(e.start_at,e.end_at)}`;
    $('eventContact').innerHTML=detailRows([
      ['Customer',contactNameFromEvent(e)||'—'],['Primary phone',formatPhone(e.phone_primary)||'—'],['Secondary phone',formatPhone(e.phone_secondary)||'—'],['Email',e.email||'—'],['Property',propertyFromEvent(e)||'—'],['Source',e.source_label||e.source_code||'—'],['Appointment type',e.appointment_type||e.appointment_code||'—']
    ]);
    $('matchArea').innerHTML='<div class="muted">Checking Contact and Inquiry…</div>';
    $('searchInput').value='';$('searchResults').innerHTML='';
    $('eventDialog').showModal();
    await renderCurrentMatch(e);
  }
  function detailRows(rows){return rows.map(([a,b])=>`<div class="detail-label">${esc(a)}</div><div>${esc(b)}</div>`).join('');}

  async function renderCurrentMatch(e){
    if(e.matched_lead_id){
      const inquiry=inquiryCache.get(e.matched_lead_id)||await getInquiry(e.matched_lead_id);
      if(inquiry){const contact=inquiry.contact_id?await getContact(inquiry.contact_id):null;renderMatched(inquiry,contact);return;}
    }
    const suggestions=await exactSuggestions(e);
    if(suggestions.length===1){
      $('matchArea').innerHTML=`<div class="match-card exact"><b>Exact Contact / Inquiry match</b>${resultHtml(suggestions[0],true)}</div>`;
    }else if(suggestions.length>1){
      $('matchArea').innerHTML=`<div class="match-card"><b>Possible Contact / Inquiry matches</b>${suggestions.map(x=>resultHtml(x,true)).join('')}</div>`;
    }else{
      $('matchArea').innerHTML='<div class="match-card"><b>No exact Contact / Inquiry match found</b><div class="muted">Search Contacts below, or create a new Contact + Inquiry from this Google appointment.</div><button class="btn" id="createFromEventBtn" type="button">Create Contact + Inquiry</button></div>';
      $('createFromEventBtn').onclick=createFromEvent;
    }
    wireMatchButtons();
  }

  function renderMatched(inquiry,contact){
    const name=contact?.name||inquiry.homeowner_name||'Customer';
    $('matchArea').innerHTML=`<div class="matched-box"><div><span class="eyebrow">Matched Contact</span><b>${esc(name)}</b><div>${esc(contact?.phone||inquiry.phone||'')} ${contact?.email||inquiry.email?`• ${esc(contact?.email||inquiry.email||'')}`:''}</div></div><div><span class="eyebrow">Inquiry</span><b>#${esc(inquiry.lead_number||'—')}</b><div>${esc([inquiry.street_address,inquiry.city,inquiry.state,inquiry.zip].filter(Boolean).join(', '))}</div></div><a class="btn primary" href="inquiry.html?id=${encodeURIComponent(inquiry.id)}${inquiry.contact_id?`&contact=${encodeURIComponent(inquiry.contact_id)}`:''}">Open Inquiry</a></div>`;
  }

  async function getInquiry(id){if(inquiryCache.has(id))return inquiryCache.get(id);const {data}=await db.from('leads').select('*').eq('id',id).maybeSingle();if(data)inquiryCache.set(id,data);return data;}
  async function getContact(id){if(contactCache.has(id))return contactCache.get(id);const {data}=await db.from('contacts').select('*').eq('id',id).maybeSingle();if(data)contactCache.set(id,data);return data;}

  async function exactSuggestions(e){
    const out=new Map();
    const ep=digits(e.phone_primary),ee=norm(e.email),ename=norm(contactNameFromEvent(e));
    const contactQueries=[];
    if(ee)contactQueries.push(db.from('contacts').select('*').ilike('email',ee).limit(20));
    if(ep)contactQueries.push(db.from('contacts').select('*').ilike('phone',`%${ep.slice(-4)}%`).limit(30));
    if(ename)contactQueries.push(db.from('contacts').select('*').ilike('name',ename).limit(20));
    const results=await Promise.all(contactQueries);
    const contacts=new Map();results.forEach(r=>(r.data||[]).forEach(c=>contacts.set(c.id,c)));
    for(const c of contacts.values()){
      const exactEmail=ee&&norm(c.email)===ee;const exactPhone=ep&&digits(c.phone)===ep;const exactName=ename&&norm(c.name)===ename;
      if(!(exactEmail||exactPhone||exactName))continue;
      const {data:inqs}=await db.from('leads').select('*').eq('contact_id',c.id).is('deleted_at',null).order('inquiry_at',{ascending:false}).limit(20);
      for(const i of (inqs||[]))if(inquiryFitsEvent(i,e)||exactEmail||exactPhone)out.set(i.id,{contact:c,inquiry:i});
    }
    if(!out.size){
      const qs=[];
      if(ee)qs.push(db.from('leads').select('*').ilike('email',ee).is('deleted_at',null).limit(20));
      if(ep)qs.push(db.from('leads').select('*').ilike('phone',`%${ep.slice(-4)}%`).is('deleted_at',null).limit(30));
      if(ename)qs.push(db.from('leads').select('*').ilike('homeowner_name',ename).is('deleted_at',null).limit(20));
      const rr=await Promise.all(qs);for(const r of rr)for(const i of (r.data||[])){const ph=ep&&digits(i.phone)===ep,em=ee&&norm(i.email)===ee,nm=ename&&norm(i.homeowner_name)===ename;if(ph||em||nm){const c=i.contact_id?await getContact(i.contact_id):null;out.set(i.id,{contact:c,inquiry:i});}}
    }
    return [...out.values()].filter(x=>inquiryFitsEvent(x.inquiry,e)||matchesStrongContact(x,e));
  }
  function matchesStrongContact(x,e){const ep=digits(e.phone_primary),ee=norm(e.email);return (ep&&digits(x.contact?.phone||x.inquiry.phone)===ep)||(ee&&norm(x.contact?.email||x.inquiry.email)===ee);}
  function inquiryFitsEvent(i,e){const p=norm(propertyFromEvent(e));if(!p)return true;const st=norm(i.street_address);const zip=String(i.zip||'');return (!!st&&p.includes(st))||(zip&&p.includes(zip));}

  function resultHtml(x,showButton){const c=x.contact,i=x.inquiry;return `<div class="search-result"><div><b>${esc(c?.name||i.homeowner_name||'Customer')}</b><div>Inquiry #${esc(i.lead_number||'—')} • ${esc([i.street_address,i.city,i.state,i.zip].filter(Boolean).join(', '))}</div><div>${esc(c?.phone||i.phone||'')} ${c?.email||i.email?`• ${esc(c?.email||i.email||'')}`:''}</div></div>${showButton?`<button class="btn primary small" data-match-inquiry="${esc(i.id)}">Match</button>`:''}</div>`;}
  function wireMatchButtons(){document.querySelectorAll('[data-match-inquiry]').forEach(b=>b.onclick=async()=>{b.disabled=true;await matchToInquiry(b.dataset.matchInquiry);b.disabled=false;});}

  async function searchContacts(){
    const q=$('searchInput').value.trim();if(!q)return;
    $('searchResults').innerHTML='<div class="muted">Searching Contacts and Inquiries…</div>';
    const safe=q.replace(/[,%()]/g,' ');const tail=digits(q).slice(-4);const contactParts=[`name.ilike.%${safe}%`,`email.ilike.%${safe}%`,`street_address.ilike.%${safe}%`];if(tail)contactParts.push(`phone.ilike.%${tail}%`);
    const inquiryParts=[`homeowner_name.ilike.%${safe}%`,`lead_number.ilike.%${safe}%`,`email.ilike.%${safe}%`,`street_address.ilike.%${safe}%`,`spouse_name.ilike.%${safe}%`];if(tail)inquiryParts.push(`phone.ilike.%${tail}%`,`phone_secondary.ilike.%${tail}%`);
    const [cr,ir]=await Promise.all([
      db.from('contacts').select('*').or(contactParts.join(',')).limit(40),
      db.from('leads').select('*').is('deleted_at',null).or(inquiryParts.join(',')).order('inquiry_at',{ascending:false}).limit(60)
    ]);
    const rows=new Map();
    for(const c of (cr.data||[])){
      const {data:inqs}=await db.from('leads').select('*').eq('contact_id',c.id).is('deleted_at',null).order('inquiry_at',{ascending:false}).limit(20);
      for(const i of (inqs||[]))rows.set(i.id,{contact:c,inquiry:i});
    }
    for(const i of (ir.data||[])){const c=i.contact_id?await getContact(i.contact_id):null;rows.set(i.id,{contact:c,inquiry:i});}
    $('searchResults').innerHTML=rows.size?[...rows.values()].map(x=>resultHtml(x,true)).join(''):'<div class="muted">No Contacts or Inquiries found.</div>';
    wireMatchButtons();
  }

  async function ensureContactForInquiry(i){
    if(i.contact_id)return await getContact(i.contact_id);
    const ep=digits(i.phone),ee=norm(i.email),nm=norm(i.homeowner_name);let contact=null;
    if(ee){const {data}=await db.from('contacts').select('*').ilike('email',ee).limit(10);contact=(data||[]).find(c=>norm(c.email)===ee)||null;}
    if(!contact&&ep){const {data}=await db.from('contacts').select('*').ilike('phone',`%${ep.slice(-4)}%`).limit(20);contact=(data||[]).find(c=>digits(c.phone)===ep)||null;}
    if(!contact&&nm){const {data}=await db.from('contacts').select('*').ilike('name',i.homeowner_name).limit(20);contact=(data||[]).find(c=>norm(c.name)===nm&&(!i.street_address||!c.street_address||norm(c.street_address)===norm(i.street_address)))||null;}
    if(!contact){const {data,error}=await db.from('contacts').insert({name:i.homeowner_name||contactNameFromEvent(activeEvent)||'Customer',phone:i.phone||activeEvent.phone_primary||null,email:i.email||activeEvent.email||null}).select('*').single();if(error)throw error;contact=data;}
    const {data,error}=await db.from('leads').update({contact_id:contact.id,updated_at:new Date().toISOString()}).eq('id',i.id).select('*').single();if(error)throw error;inquiryCache.set(i.id,data);contactCache.set(contact.id,contact);return contact;
  }

  async function matchToInquiry(inquiryId){
    try{
      const i=await getInquiry(inquiryId);if(!i)throw new Error('Inquiry not found.');const c=await ensureContactForInquiry(i);
      const contactPatch={};if(!c.phone&&activeEvent.phone_primary)contactPatch.phone=activeEvent.phone_primary;if(!c.email&&activeEvent.email)contactPatch.email=activeEvent.email;if(Object.keys(contactPatch).length){contactPatch.updated_at=new Date().toISOString();const {data}=await db.from('contacts').update(contactPatch).eq('id',c.id).select('*').single();if(data)contactCache.set(c.id,data);}
      const {error}=await db.from('calendar_events').update({matched_lead_id:i.id,matched_lead_number:i.lead_number||null,match_confidence:100,match_reason:'Matched through BRO Contact / Inquiry workflow',updated_at:new Date().toISOString()}).eq('id',activeEvent.id);if(error)throw error;
      await ensureAppointment(i,activeEvent);
      activeEvent.matched_lead_id=i.id;activeEvent.matched_lead_number=i.lead_number||null;inquiryCache.set(i.id,{...i,contact_id:c.id});
      renderMatched({...i,contact_id:c.id},contactCache.get(c.id)||c);await loadWeek();
    }catch(err){$('matchArea').innerHTML=`<div class="error-box">${esc(err.message||String(err))}</div>`;}
  }

  async function ensureAppointment(i,e){
    const gid=String(e.google_event_id||'');
    let existing=null;
    if(gid){const {data}=await db.from('appointments').select('*').eq('google_calendar_event_id',gid).limit(1);existing=(data||[])[0]||null;}
    if(!existing){const t=new Date(e.start_at);const lo=new Date(t.getTime()-2*60000).toISOString(),hi=new Date(t.getTime()+2*60000).toISOString();const {data}=await db.from('appointments').select('*').eq('lead_id',i.id).gte('appointment_at',lo).lte('appointment_at',hi).limit(1);existing=(data||[])[0]||null;}
    const row={lead_id:i.id,appointment_at:e.start_at,appointment_status:'Scheduled',appointment_type:e.appointment_type||'Appointment',assigned_to:i.assigned_to||i.salesperson||'Roy',google_calendar_status:'Synced',google_calendar_event_id:gid||null,notes:e.description||null,updated_at:new Date().toISOString()};
    if(existing){const {error}=await db.from('appointments').update(row).eq('id',existing.id);if(error)throw error;}else{const {error}=await db.from('appointments').insert(row);if(error)throw error;}
  }

  async function createFromEvent(){
    try{
      const first=String(activeEvent.contact_first_name||'').trim(),last=String(activeEvent.contact_last_name||'').trim(),name=[first,last].filter(Boolean).join(' ')||'Customer';
      const {data:c,error:ce}=await db.from('contacts').insert({name,phone:activeEvent.phone_primary||null,email:activeEvent.email||null}).select('*').single();if(ce)throw ce;
      const p=parseProperty(propertyFromEvent(activeEvent));
      const {data:i,error:ie}=await db.from('leads').insert({contact_id:c.id,homeowner_name:name,first_name:first||null,last_name:last||null,phone:activeEvent.phone_primary||null,phone_secondary:activeEvent.phone_secondary||null,email:activeEvent.email||null,street_address:p.street,zip:p.zip,source:activeEvent.source_label||activeEvent.source_code||null,work_category:activeEvent.appointment_type||null,assigned_to:'Roy',salesperson:'Roy',status:'Appointment',lead_status:'Appointment',inquiry_at:new Date().toISOString()}).select('*').single();if(ie)throw ie;
      inquiryCache.set(i.id,i);contactCache.set(c.id,c);await matchToInquiry(i.id);
    }catch(err){$('matchArea').innerHTML=`<div class="error-box">${esc(err.message||String(err))}</div>`;}
  }
  function parseProperty(v){const s=String(v||'').trim();const m=s.match(/^(.*?)(?:,\s*(\d{5}))?$/);return{street:(m?.[1]||s).trim()||null,zip:m?.[2]||null};}

  async function syncNow(){const b=$('syncBtn');b.disabled=true;b.textContent='Syncing…';status('Reading Google Calendar…');try{if(!window.BROCalendarSync)throw new Error('Calendar sync service is not ready.');const r=await window.BROCalendarSync.processPending({promptForSecret:true});if(!r.ok)throw r.error||new Error('Sync failed.');await loadWeek();status(`Synced • ${r.pulled||0} read • ${r.pushed||0} sent`,'ok');}catch(err){status(err.message||String(err),'error');}finally{b.disabled=false;b.textContent='Sync';}}

  $('prevBtn').onclick=()=>{weekStart=addDays(weekStart,-7);loadWeek();};$('nextBtn').onclick=()=>{weekStart=addDays(weekStart,7);loadWeek();};$('todayBtn').onclick=()=>{weekStart=startOfWeek(new Date());loadWeek();};$('syncBtn').onclick=syncNow;$('searchBtn').onclick=searchContacts;$('searchInput').onkeydown=e=>{if(e.key==='Enter')searchContacts();};$('closeDialog').onclick=()=>$('eventDialog').close();
  window.loadWeek=loadWeek;
  document.addEventListener('DOMContentLoaded',()=>setTimeout(loadWeek,50));
})();