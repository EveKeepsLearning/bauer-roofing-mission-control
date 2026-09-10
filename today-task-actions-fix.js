'use strict';
(function(){
  if(window.__broTodayTaskActionsFixLoaded)return;
  window.__broTodayTaskActionsFixLoaded=true;

  function getCard(button){return button.closest('.task[data-task-id]');}

  document.addEventListener('click',async event=>{
    const button=event.target.closest('button[data-action]');
    const card=getCard(button);
    if(!button||!card)return;
    const action=String(button.dataset.action||'').trim();
    if(!['start','resume','pause','block','complete','skip'].includes(action))return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if(button.dataset.broBusy==='1')return;
    button.dataset.broBusy='1';
    button.disabled=true;

    try{
      if(typeof taskAction!=='function')throw new Error('BRO task controls are not ready.');
      await taskAction(card.dataset.taskId,action);
    }catch(error){
      console.error('Today task action failed',error);
      if(typeof msg==='function')msg(`Could not ${action} task: ${error.message||error}`,'error');
    }finally{
      button.disabled=false;
      delete button.dataset.broBusy;
    }
  },true);
})();
