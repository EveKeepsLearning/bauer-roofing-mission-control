'use strict';
(function(){
  const cfg=window.BAUER_CONFIG||{};
  const HOUR_OLD=52;
  const HOUR_NEW=40;
  const SCALE=HOUR_NEW/HOUR_OLD;
  const GOOGLE_EVENT_COLORS={
    '1':'#7986CB',
    '2':'#33B679',
    '3':'#8E24AA',
    '4':'#E67C73',
    '5':'#F6BF26',
    '6':'#F4511E',
    '7':'#039BE5',
    '8':'#616161',
    '9':'#3F51B5',
    '10':'#0B8043',
    '11':'#D50000'
  };
  const DEFAULT_GOOGLE_BLUE='#039BE5';
  let colorMap=new Map();

  function installStyles(){
    if(document.getElementById('broGoogleCalendarViewStyles'))return;
    const s=document.createElement('style');
    s.id='broGoogleCalendarViewStyles';
    s.textContent=`
      :root{--hour:${HOUR_NEW}px!important}
      .calendar-shell{height:calc(100vh - 74px)!important}
      .day-head{padding:5px 3px!important}
      .day-head b{font-size:18px!important;margin-top:0!important}
      .day-head.today b{width:30px!important;height:30px!important}
      .times .time{height:${HOUR_NEW}px!important;font-size:10px!important;transform:translateY(-5px)!important}
      .day-cols{height:${HOUR_NEW*14}px!important}
      .day-col{background:repeating-linear-gradient(to bottom,transparent 0,transparent ${HOUR_NEW-1}px,#e9edf2 ${HOUR_NEW-1}px,#e9edf2 ${HOUR_NEW}px)!important}
      .cal-event{padding:3px 5px!important;border-radius:5px!important;color:#fff!important;box-shadow:0 1px 2px rgba(0,0,0,.14)!important}
      .cal-event b{font-size:11px!important;line-height:1.15!important}
      .cal-event span{font-size:10px!important;line-height:1.12!important}
      .cal-event.matched{outline:none!important}
      .cal-event i{width:15px!important;height:15px!important;line-height:15px!important;font-size:11px!important;right:3px!important;top:3px!important}
      .toolbar{padding:5px 10px!important;gap:6px!important}
      .toolbar .btn{padding:5px 9px!important}
      .toolbar .period{font-size:16px!important}
    `;
    document.head.appendChild(s);
  }

  async function loadColors(){
    if(!window.supabase||!cfg.SUPABASE_URL||!cfg.SUPABASE_ANON_KEY)return;
    try{
      const db=window.__broGoogleViewDb||(window.__broGoogleViewDb=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY));
      const from=new Date();from.setDate(from.getDate()-45);
      const to=new Date();to.setDate(to.getDate()+120);
      const {data}=await db.from('calendar_events').select('summary,color_id,start_at').gte('start_at',from.toISOString()).lte('start_at',to.toISOString());
      const next=new Map();
      for(const e of (data||[])){
        const key=String(e.summary||'').trim();
        if(!key)continue;
        next.set(key,String(e.color_id||''));
      }
      colorMap=next;
      restyleEvents();
    }catch(err){console.warn('Google calendar color load failed',err);}
  }

  function restyleEvents(){
    document.querySelectorAll('.cal-event').forEach(el=>{
      if(!el.dataset.broCompactScaled){
        const top=parseFloat(el.style.top||'0');
        const height=parseFloat(el.style.height||'0');
        if(Number.isFinite(top))el.style.top=(top*SCALE)+'px';
        if(Number.isFinite(height))el.style.height=Math.max(34,height*SCALE)+'px';
        el.dataset.broCompactScaled='1';
      }
      const title=el.querySelector('b')?.textContent?.trim()||'';
      const colorId=colorMap.get(title)||'';
      el.style.background=GOOGLE_EVENT_COLORS[colorId]||DEFAULT_GOOGLE_BLUE;
    });
  }

  function improveSyncError(){
    if(!window.BROCalendarSync||window.BROCalendarSync.__broDiagnosticWrapped)return;
    const original=window.BROCalendarSync.processPending;
    if(typeof original!=='function')return;
    window.BROCalendarSync.processPending=async function(options){
      const result=await original(options);
      const msg=String(result?.error?.message||result?.error||'');
      if(/appointment_id is required/i.test(msg)){
        return {ok:false,error:new Error('Google Calendar reader is still using an older Apps Script deployment. In Apps Script, Deploy > Manage deployments > Edit > New version > Deploy.')};
      }
      return result;
    };
    window.BROCalendarSync.__broDiagnosticWrapped=true;
  }

  installStyles();
  improveSyncError();
  const observer=new MutationObserver(()=>restyleEvents());
  const start=()=>{
    const root=document.getElementById('dayCols')||document.body;
    observer.observe(root,{childList:true,subtree:true});
    restyleEvents();
    loadColors();
    setInterval(loadColors,60000);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
