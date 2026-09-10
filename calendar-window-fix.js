'use strict';
(function(){
  const LOOKBACK_DAYS=14;
  const FUTURE_DAYS=365;
  const pad=n=>String(n).padStart(2,'0');
  const dateValue=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  function rollingWindow(){
    const today=new Date();
    today.setHours(12,0,0,0);
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
  document.addEventListener('click',event=>{
    const btn=event.target.closest('#bulkImportBtn');
    if(btn)setTimeout(applyWindow,0);
  },true);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',applyWindow);
  else applyWindow();
})();
