'use strict';
(function(){
  const LOOKBACK_DAYS=14;
  const FUTURE_DAYS=365;
  const pad=n=>String(n).padStart(2,'0');
  const dateValue=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  function rollingWindow(){
    const today=new Date();today.setHours(12,0,0,0);
    const start=new Date(today);start.setDate(start.getDate()-LOOKBACK_DAYS);
    const end=new Date(today);end.setDate(end.getDate()+FUTURE_DAYS);
    return {start,end};
  }
  function applyWindow(){
    const {start,end}=rollingWindow();
    const startInput=document.getElementById('bulkStartDate');
    const endInput=document.getElementById('bulkEndDate');
    if(startInput){startInput.value=dateValue(start);startInput.min=dateValue(start);}
    if(endInput){endInput.value=dateValue(end);endInput.min=dateValue(start);}
    const dialog=startInput?.closest('dialog');
    const sub=dialog?.querySelector('.dialog-sub');
    if(sub)sub.textContent=`BRO only reviews Google Calendar appointments from ${dateValue(start)} forward. Older appointments are ignored.`;
    window.BRO_GOOGLE_CALENDAR_LOOKBACK_DAYS=LOOKBACK_DAYS;
    window.BRO_GOOGLE_CALENDAR_SYNC_START=start.toISOString();
  }
  function compactToolbar(){
    if(!document.getElementById('broCalendarCompactStyles')){
      const style=document.createElement('style');
      style.id='broCalendarCompactStyles';
      style.textContent=`
        .topbar{padding:7px 14px!important;gap:8px!important;min-height:0!important}
        .topbar .brand{font-size:16px!important;font-weight:700!important}
        .topbar .btn{padding:6px 10px!important;font-size:12px!important;border-radius:16px!important}
        .topbar .period-title{font-size:18px!important;min-width:150px!important}
        .topbar .sync-status{font-size:11px!important;min-width:0!important;max-width:220px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
        .legend{padding:5px 14px!important;font-size:11px!important;gap:12px!important}
        .calendar-shell{height:calc(100vh - 82px)!important}
      `;
      document.head.appendChild(style);
    }
    const hideLabels=new Set([
      'Bauer Roofing Operations',
      'Import Past Appointments',
      'Past Items Needing Review',
      'Backfill Missing Appointments',
      'Create Roy Daily Check-Off',
      'Calendar Sync Settings',
      'Refresh View'
    ]);
    document.querySelectorAll('.topbar a,.topbar button').forEach(el=>{
      const text=String(el.textContent||'').trim();
      if(hideLabels.has(text))el.style.display='none';
    });
    const sync=document.getElementById('syncCalendarBtn');
    if(sync)sync.textContent='Sync';
  }
  document.addEventListener('click',event=>{
    const btn=event.target.closest('#bulkImportBtn');
    if(btn)setTimeout(applyWindow,0);
  },true);
  const init=()=>{applyWindow();compactToolbar();};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
