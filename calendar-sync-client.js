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
  function configureSecret(){
    const value=prompt('Enter the private BRO_SYNC_SECRET you saved in Google Apps Script. It stays only in this browser and is never saved to GitHub.');
    if(!value)return false;
    localStorage.setItem(SECRET_KEY,String(value).trim());
    return true;
  }
  function clearSecret(){localStorage.removeItem(SECRET_KEY);}
  function isCanceled(a){const s=String(a?.appointment_status||'').trim().toLowerCase();return !!a?.deleted_at||['cancelled','canceled'].includes(s);}
  function address(l){return [l?.street_address,l?.city,l?.state,l?.zip].filter(Boolean).join(', ');}
  function rollingWindow(){
    const start=new Date();start.setHours(0,0,0,0);start.setDate(start.getDate()-LOOKBACK_DAYS);
    const end=new Date();end.setHours(23,59,59,999);end.setDate(end.getDate()+FUTURE_DAYS);
    return {start:start.toISOString(),end:end.toISOString()};
  }
  function payloadFor(a,l){
    return {
      secret:getSecret(),
      action:isCanceled(a)?'cancel':'upsert',
      appointment_id:a.id,
      google_event_id:a.google_calendar_event_id||null,
      start_time:a.appointment_at||null,
      lead_number:l?.lead_number||null,
      customer_name:l?.homeowner_name||null,
      phone:l?.phone||null,
      email:l?.email||null,
      street_address:l?.street_address||null,
      city:l?.city||null,
      state:l?.state||null,
      zip:l?.zip||null,
      location:address(l),
      work_category:l?.work_category||l?.product_interest||null,
      source:l?.source||null,
      assigned_to:a.assigned_to||l?.assigned_to||l?.salesperson||'Roy',
      notes:a.notes||null
    };
  }
  async function post(payload){
    if(!ENDPOINT)throw new Error('Google Calendar sync endpoint is not configured.');
    const response=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload),redirect:'follow'});
    const text=await response.text();
    let data=null;
    try{data=JSON.parse(text);}catch(_){throw new Error('Google Calendar returned an unreadable response.');}
    if(!data?.ok)throw new Error(data?.error||'Google Calendar sync failed.');
    return data;
  }
  async function loadLead(database,leadId){
    if(!leadId)return null;
    const {data,error}=await database.from('leads').select('id,lead_number,homeowner_name,street_address,city,state,zip,phone,email,source,work_category,product_interest,assigned_to,salesperson').eq('id',leadId).single();
    if(error)throw error;
    return data;
  }
  async function syncAppointment(database,a){
    const lead=await loadLead(database,a.lead_id);
    try{
      const result=await post(payloadFor(a,lead));
      const patch={google_calendar_status:isCanceled(a)?'Canceled':'Synced',google_calendar_event_id:result.google_event_id||a.google_calendar_event_id||null,updated_at:new Date().toISOString()};
      const {error}=await database.from('appointments').update(patch).eq('id',a.id);
      if(error)throw error;
      return {ok:true,result,appointment:a,lead};
    }catch(error){
      try{await database.from('appointments').update({google_calendar_status:'Sync Error',updated_at:new Date().toISOString()}).eq('id',a.id);}catch(_){}
      return {ok:false,error,appointment:a,lead};
    }
  }
  async function pushPending(database){
    const {data,error}=await database.from('appointments')
      .select('id,lead_id,appointment_at,appointment_status,appointment_type,assigned_to,notes,deleted_at,google_calendar_status,google_calendar_event_id,updated_at')
      .in('google_calendar_status',['Needs Sync','Sync Error']).order('updated_at',{ascending:true}).limit(25);
    if(error)throw error;
    const rows=data||[],results=[];
    for(const a of rows)results.push(await syncAppointment(database,a));
    return {total:results.length,failed:results.filter(r=>!r.ok).length,results};
  }
  async function pullGoogle(database){
    const windowRange=rollingWindow();
    let payload;
    try{
      payload=await post({secret:getSecret(),action:'list',start_time:windowRange.start,end_time:windowRange.end,calendar_id:GOOGLE_CALENDAR_ID});
    }catch(error){
      if(String(error?.message||error).includes('Unknown action: list')){
        throw new Error('Google Calendar reader is not enabled yet. Update the Apps Script with the list action, then redeploy it.');
      }
      throw error;
    }
    const events=Array.isArray(payload.events)?payload.events:Array.isArray(payload.result?.events)?payload.result.events:[];
    if(!events.length)return {total:0};
    const now=new Date().toISOString();
    const rows=events.filter(e=>e&&e.google_event_id&&e.start_at).map(e=>({
      google_event_id:String(e.google_event_id),
      google_calendar_id:String(e.google_calendar_id||GOOGLE_CALENDAR_ID),
      calendar_name:String(e.calendar_name||'Bauer Roofing'),
      summary:e.summary||null,
      description:e.description||null,
      location_raw:e.location_raw||e.location||null,
      start_at:e.start_at,
      end_at:e.end_at||null,
      color_id:e.color_id||null,
      raw_payload:e.raw_payload||e,
      synced_at:now,
      updated_at:now
    }));
    const {error}=await database.from('calendar_events').upsert(rows,{onConflict:'google_calendar_id,google_event_id'});
    if(error)throw error;
    return {total:rows.length};
  }
  async function processPending(options={}){
    if(running)return {ok:true,skipped:true};
    const database=getDb();
    if(!database)return {ok:false,error:new Error('BRO database connection is not ready.')};
    if(!getSecret()){
      if(options.promptForSecret&&!configureSecret())return {ok:false,error:new Error('Google Calendar sync secret was not entered.')};
      if(!getSecret())return {ok:false,needsSecret:true};
    }
    running=true;
    try{
      const pulled=await pullGoogle(database);
      const pushed=await pushPending(database);
      const ok=pushed.failed===0;
      return {ok,pulled:pulled.total,pushed:pushed.total,failed:pushed.failed};
    }catch(error){return {ok:false,error};}
    finally{running=false;}
  }
  async function refreshVisibleCalendar(){
    try{if(typeof window.loadWeek==='function')await window.loadWeek();else if(typeof loadWeek==='function')await loadWeek();}catch(error){console.warn('Calendar refresh failed:',error);}
  }
  function installCalendarButton(){
    const button=document.getElementById('syncCalendarBtn');
    if(!button)return;
    button.onclick=async()=>{
      const old=button.textContent;
      button.disabled=true;button.textContent='Syncing…';
      const status=document.getElementById('syncStatus');
      if(status)status.textContent='Reading Google Calendar…';
      const result=await processPending({promptForSecret:true});
      if(result.ok){
        await refreshVisibleCalendar();
        if(status)status.textContent=(result.pulled||result.pushed)?`Google refreshed • ${result.pulled||0} read • ${result.pushed||0} sent`:'Google Calendar is up to date';
      }else if(status){status.textContent=`Sync problem: ${result.error?.message||result.failed+' failed'}`;}
      button.disabled=false;button.textContent=old||'Sync';
    };
  }
  function startAuto(){
    setTimeout(async()=>{const r=await processPending();if(r.ok&&(r.pulled||r.pushed))await refreshVisibleCalendar();},3000);
    setInterval(async()=>{const r=await processPending();if(r.ok&&(r.pulled||r.pushed))await refreshVisibleCalendar();},60000);
  }
  window.BROCalendarSync={processPending,configureSecret,clearSecret,syncAppointment:(a)=>syncAppointment(getDb(),a),pullGoogle:()=>pullGoogle(getDb())};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{setTimeout(installCalendarButton,0);startAuto();});
  else{setTimeout(installCalendarButton,0);startAuto();}
})();
