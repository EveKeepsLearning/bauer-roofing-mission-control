'use strict';
(function(){
  if(window.__broTodayTaskActionsFixLoaded)return;
  window.__broTodayTaskActionsFixLoaded=true;

  function taskFromButton(button){
    const card=button.closest('.task[data-task-id]');
    if(!card)return null;
    const id=card.dataset.taskId;
    return (window.state?.tasks||state?.tasks||[]).find(t=>t.id===id)||{id};
  }

  async function updateTask(task,action){
    if(typeof db==='undefined'||!db)throw new Error('Database is not ready.');
    const now=new Date().toISOString();
    let patch={};
    if(action==='resume')patch={status:'In Progress',paused_at:null,started_at:task.started_at||now,updated_at:now};
    if(action==='complete')patch={status:'Completed',completed_at:now,paused_at:null,updated_at:now};
    const {error}=await db.from('tasks').update(patch).eq('id',task.id);
    if(error)throw error;
    if(typeof loadAll==='function')await loadAll();
    if(typeof msg==='function')msg(action==='complete'?'Task completed.':'Task resumed.','success');
  }

  document.addEventListener('click',async event=>{
    const button=event.target.closest('button');
    if(!button)return;
    const label=String(button.textContent||'').trim().toLowerCase();
    if(label!=='resume'&&label!=='complete')return;
    const task=taskFromButton(button);
    if(!task)return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if(button.dataset.broBusy==='1')return;
    button.dataset.broBusy='1';button.disabled=true;
    try{await updateTask(task,label==='complete'?'complete':'resume');}
    catch(error){console.error(error);if(typeof msg==='function')msg(`Could not ${label} task: ${error.message||error}`,'error');}
    finally{button.disabled=false;delete button.dataset.broBusy;}
  },true);
})();
