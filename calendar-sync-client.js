'use strict';
(function(){
  const cfg=window.BAUER_CONFIG||{};
  const ENDPOINT=String(cfg.CALENDAR_SYNC_WEB_APP_URL||'').trim();
  const SECRET_KEY='bauerCalendarSyncSecret';
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
      const patch={
        google_calendar_status:isCanceled(a)?'Canceled':'Synced',
        google_calendar_event_id:result.google_event_id||a.google_calendar_event_id||null,
        updated_at:new Date().toISOString()
      };
      const {error}=await database.from('appointments').update(patch).eq('id',a.id);
      if(error)throw error;
      return {ok:true,result,appointment:a,lead};
    }catch(error){
      try{await database.from('appointments').update({google_calendar_status:'Sync Error',updated_at:new Date().toISOString()}).eq('id',a.id);}catch(_){}
      return {ok:false,error,appointment:a,lead};
    }
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
      const {data,error}=await database.from('appointments')
        .select('id,lead_id,appointment_at,appointment_status,appointment_type,assigned_to,notes,deleted_at,google_calendar_status,google_calendar_event_id,updated_at')
        .in('google_calendar_status',['Needs Sync','Sync Error'])
        .order('updated_at',{ascending:true})
        .limit(25);
      if(error)throw error;
      const rows=data||[];
      const results=[];
      for(const a of rows)results.push(await syncAppointment(database,a));
      const failed=results.filter(r=>!r.ok);
      return {ok:failed.length===0,total:results.length,failed:failed.length,results};
    }catch(error){return {ok:false,error};}
    finally{running=false;}
  }
  function installCalendarButton(){
    const button=document.getElementById('syncCalendarBtn');
    if(!button)return;
    button.onclick=async()=>{
      const old=button.textContent;
      button.disabled=true;button.textContent='Syncing…';
      const status=document.getElementById('syncStatus');
      if(status)status.textContent='Sending BRO changes to Google Calendar…';
      const result=await processPending({promptForSecret:true});
      if(status){
        if(result.ok)status.textContent=result.total?`${result.total} appointment${result.total===1?'':'s'} synced`:'Google Calendar is up to date';
        else status.textContent=`Sync problem: ${result.error?.message||result.failed+' failed'}`;
      }
      button.disabled=false;button.textContent=old||'Sync Google Calendar';
    };
    const change=document.getElementById('changeSyncUrlBtn');
    if(change){change.textContent='Calendar Sync Settings';change.onclick=()=>{if(confirm('Reset the private Google Calendar sync secret on this browser?')){clearSecret();configureSecret();}};}
  }
  function startAuto(){
    setTimeout(()=>processPending(),3000);
    setInterval(()=>processPending(),15000);
  }
  window.BROCalendarSync={processPending,configureSecret,clearSecret,syncAppointment:(a)=>syncAppointment(getDb(),a)};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{setTimeout(installCalendarButton,0);startAuto();});
  else{setTimeout(installCalendarButton,0);startAuto();}
})();
