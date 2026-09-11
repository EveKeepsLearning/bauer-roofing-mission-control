'use strict';
(function(){
  const KEY='bauerCalendarSyncSecret';
  const $=id=>document.getElementById(id);
  let prompted=false;
  function status(msg,type=''){const el=$('status');if(!el)return;el.textContent=msg||'';el.className=`status ${type}`.trim();}
  function needsReconnect(err){const s=String(err?.message||err||'').toLowerCase();return /secret|unauthor|forbidden|permission|access denied|invalid token/.test(s);}
  async function run(promptForSecret){
    if(!window.BROCalendarSync)return {ok:false,error:new Error('Calendar sync service is not ready.')};
    let result=await window.BROCalendarSync.processPending({promptForSecret:!!promptForSecret});
    if(!result.ok&&needsReconnect(result.error)&&!prompted){
      prompted=true;
      window.BROCalendarSync.clearSecret?.();
      status('Google Calendar connection needs to be reconnected.','error');
      result=await window.BROCalendarSync.processPending({promptForSecret:true});
    }
    if(result.ok){
      status(`Synced • ${result.pulled||0} read • ${result.pushed||0} sent`,'ok');
      if((result.pulled||0)>0&&typeof window.loadWeek==='function')await window.loadWeek();
    } else if(result.needsSecret){
      status('Google Calendar needs its private sync key. Click Sync to reconnect.','error');
    } else if(result.error){
      status(result.error.message||String(result.error),'error');
    }
    return result;
  }
  function install(){
    const sync=$('syncBtn');
    if(sync&&!sync.dataset.broRecovery){
      sync.dataset.broRecovery='1';
      sync.addEventListener('click',()=>setTimeout(()=>run(true),50));
    }
    setTimeout(()=>run(!localStorage.getItem(KEY)),900);
    setInterval(()=>run(false),60000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
