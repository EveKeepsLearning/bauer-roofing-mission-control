'use strict';
(function(){
  const cfg=window.BAUER_CONFIG||{};
  const ENDPOINT=String(cfg.CALENDAR_SYNC_WEB_APP_URL||'').trim();
  const SECRET_KEY='bauerCalendarSyncSecret';
  const GOOGLE_CALENDAR_ID='roybauer88@gmail.com';
  const LOOKBACK_DAYS=14;
  const FUTURE_DAYS=365;
  let running=false;

  function getDb(){
    if(window.db&&typeof window.db.from==='function')return window.db;
    if(typeof db!=='undefined'&&db&&typeof db.from==='function')return db;
    if(!window.supabase||!cfg.SUPABASE_URL||!cfg.SUPABASE_ANON_KEY)return null;
    if(!window.__broCalendarDb)window.__broCalendarDb=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
    return window.__broCalendarDb;
  }
  function getSecret(){return String(localStorage.getItem(SECRET_KEY)||'').trim();}
  function configureSecret(){const value=prompt('Enter the private BRO_SYNC_SECRET you saved in Google Apps Script. It stays only in this browser and is never saved to GitHub.');if(!value)return false;localStorage.setItem(SECRET_KEY,String(value).trim());return true;}
  function clearSecret(){localStorage.removeItem(SECRET_KEY);}
  function isCanceled(a){const s=String(a?.appointment_status||'').trim().toLowerCase();return !!a?.deleted_at||['cancelled','canceled'].includes(s);}
  function rollingWindow(){const start=new Date();start.setHours(0,0,0,0);start.setDate(start.getDate()-LOOKBACK_DAYS);const end=new Date();end.setHours(23,59,59,999);end.setDate(end.getDate()+FUTURE_DAYS);return{start:start.toISOString(),end:end.toISOString()};}
  function clean(v){return String(v||'').trim();}
  function splitName(l){let first=clean(l?.first_name),last=clean(l?.last_name);if(first||last)return{first,last};const name=clean(l?.homeowner_name);if(!name)return{first:'',last:''};const parts=name.split(/\s+/).filter(Boolean);if(parts.length===1)return{first:parts[0],last:''};return{first:parts.slice(0,-1).join(' '),last:parts[parts.length-1]};}
  function contactLocation(l,includeLeadNumber){const {first,last}=splitName(l);const name=last&&first?`${last}, ${first}`:last||first||clean(l?.homeowner_name);const parts=[name,clean(l?.phone),clean(l?.phone_secondary),clean(l?.email)].filter(Boolean);if(includeLeadNumber&&clean(l?.lead_number))parts.push(`#${clean(l.lead_number)}`);return parts.join('  ');}
  function sourceCode(l){
    const raw=clean(l?.source);if(!raw)return 'UNK';
    if(/^[A-Za-z]{2,5}$/.test(raw))return raw;
    const key=raw.toLowerCase();
    const map={'angi ads':'AA','website form':'WF','internet':'INT','repeat business':'RB','direct mail':'DM','referral':'Ref','homeadvisor (angi leads)':'HA','angi leads':'HA'};
    return map[key]||raw.split(/\s+/).filter(Boolean).map(x=>x[0]).join('').slice(0,4).toUpperCase()||'UNK';
  }
  function inquiryTypeCode(a,l){
    const raw=clean(a?.appointment_type)||clean(l?.work_category)||clean(l?.product_interest);if(!raw)return 'M';
    if(/^[A-Za-z]{1,4}$/.test(raw))return raw;
    const key=raw.toLowerCase();
    if(key.includes('siding'))return 'Sid';
    if(key.includes('measure'))return 'M';
    if(key.includes('presentation'))return 'M';
    if(key.includes('repair'))return 'F';
    return raw.split(/\s+/).filter(Boolean).map(x=>x[0]).join('').slice(0,4).toUpperCase()||'M';
  }
  function googleTitle(a,l){
    const street=clean(l?.street_address),zip=clean(l?.zip),property=[street,zip].filter(Boolean).join(', ');
    return `${sourceCode(l)}-${inquiryTypeCode(a,l)}-${property}`;
  }
  function payloadFor(a,l,action='upsert'){
    const isNewGoogleEvent=!clean(a?.google_calendar_event_id);
    return{secret:getSecret(),action,appointment_id:a?.id||null,google_event_id:a?.google_calendar_event_id||null,start_time:a?.appointment_at||null,title:isNewGoogleEvent?googleTitle(a,l):null,lead_number:l?.lead_number||null,customer_name:l?.homeowner_name||null,first_name:l?.first_name||null,last_name:l?.last_name||null,phone:l?.phone||null,phone_secondary:l?.phone_secondary||null,email:l?.email||null,street_address:l?.street_address||null,city:l?.city||null,state:l?.state||null,zip:l?.zip||null,location:contactLocation(l,isNewGoogleEvent),work_category:l?.work_category||l?.product_interest||null,source:l?.source||null,assigned_to:a?.assigned_to||l?.assigned_to||l?.salesperson||'Roy',notes:a?.notes||null};
  }
  async function post(payload){if(!ENDPOINT)throw new Error('Google Calendar sync endpoint is not configured.');const response=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload),redirect:'follow'});const text=await response.text();let data;try{data=JSON.parse(text);}catch(_){throw new Error('Google Calendar returned an unreadable response.');}if(!data?.ok){const msg=String(data?.error||'Google Calendar sync failed.');if(msg.includes('appointment_id is required'))throw new Error('The deployed Apps Script is still using the older handler. In Apps Script choose Deploy → Manage deployments → Edit → New version → Deploy.');throw new Error(msg);}return data;}
  async function loadLead(database,leadId){if(!leadId)return null;const{data,error}=await database.from('leads').select('id,lead_number,homeowner_name,first_name,last_name,spouse_name,street_address,city,state,zip,phone,phone_secondary,email,source,work_category,product_interest,assigned_to,salesperson').eq('id',leadId).single();if(error)throw error;return data;}
  async function syncAppointment(database,a){
    if(!a?.id)return{ok:false,error:new Error('Save the appointment in BRO before adding it to Google Calendar.')};
    if(!getSecret()&&!configureSecret())return{ok:false,error:new Error('Google Calendar sync secret was not entered.')};
    const lead=await loadLead(database,a.lead_id);
    try{
      const action=isCanceled(a)?'cancel':'upsert';
      const result=await post(payloadFor(a,lead,action));
      if(action==='upsert'&&!clean(result?.google_event_id))throw new Error('Google did not confirm creation of this calendar event. The appointment was saved in BRO but was NOT marked as added to Google.');
      const patch={google_calendar_status:isCanceled(a)?'Canceled':'Synced',google_calendar_event_id:result.google_event_id||a.google_calendar_event_id||null,updated_at:new Date().toISOString()};
      const{data:updated,error}=await database.from('appointments').update(patch).eq('id',a.id).select('*').single();
      if(error)throw error;
      if(action==='upsert'&&!clean(updated?.google_calendar_event_id))throw new Error('Google returned an event but BRO could not save the Google event ID.');
      return{ok:true,result,appointment:updated||a,lead};
    }catch(error){
      try{await database.from('appointments').update({google_calendar_status:'Sync Error',updated_at:new Date().toISOString()}).eq('id',a.id);}catch(_){}
      return{ok:false,error,appointment:a,lead};
    }
  }
  async function deleteAppointment(database,a){if(!a?.id)return{ok:false,error:new Error('Appointment ID is missing.')};if(!a.google_calendar_event_id)return{ok:true,result:{action:'not_on_google'}};if(!getSecret()&&!configureSecret())return{ok:false,error:new Error('Google Calendar sync secret was not entered.')};const lead=await loadLead(database,a.lead_id);try{const result=await post(payloadFor(a,lead,'cancel'));return{ok:true,result,appointment:a,lead};}catch(error){return{ok:false,error,appointment:a,lead};}}
  async function pullGoogle(database){if(!getSecret())return{total:0};const range=rollingWindow();const payload=await post({secret:getSecret(),action:'list',start_time:range.start,end_time:range.end,calendar_id:GOOGLE_CALENDAR_ID});const events=Array.isArray(payload.events)?payload.events:Array.isArray(payload.result?.events)?payload.result.events:[];if(!events.length)return{total:0};const now=new Date().toISOString();const rows=events.filter(e=>e&&e.google_event_id&&e.start_at).map(e=>({google_event_id:String(e.google_event_id),google_calendar_id:String(e.google_calendar_id||GOOGLE_CALENDAR_ID),calendar_name:String(e.calendar_name||'Bauer Roofing'),summary:e.summary||null,description:e.description||null,location_raw:e.location_raw||e.location||null,start_at:e.start_at,end_at:e.end_at||null,color_id:e.color_id||null,raw_payload:e.raw_payload||e,synced_at:now,updated_at:now}));const{error}=await database.from('calendar_events').upsert(rows,{onConflict:'google_calendar_id,google_event_id'});if(error)throw error;return{total:rows.length};}
  async function processPending(options={}){if(running)return{ok:true,skipped:true};const database=getDb();if(!database)return{ok:false,error:new Error('BRO database connection is not ready.')};if(!getSecret()){if(options.promptForSecret&&!configureSecret())return{ok:false,error:new Error('Google Calendar sync secret was not entered.')};if(!getSecret())return{ok:false,needsSecret:true};}running=true;try{const pulled=await pullGoogle(database);return{ok:true,pulled:pulled.total,pushed:0,failed:0};}catch(error){return{ok:false,error};}finally{running=false;}}
  async function refreshVisibleCalendar(){try{if(typeof window.loadWeek==='function')await window.loadWeek();}catch(error){console.warn('Calendar refresh failed:',error);}}
  function startAuto(){setTimeout(async()=>{const r=await processPending();if(r.ok&&r.pulled)await refreshVisibleCalendar();},3000);setInterval(async()=>{const r=await processPending();if(r.ok&&r.pulled)await refreshVisibleCalendar();},60000);}
  window.BROCalendarSync={processPending,configureSecret,clearSecret,syncAppointment:a=>syncAppointment(getDb(),a),deleteAppointment:a=>deleteAppointment(getDb(),a),pullGoogle:()=>pullGoogle(getDb())};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startAuto);else startAuto();
})();
