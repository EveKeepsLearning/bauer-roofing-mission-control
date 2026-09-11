'use strict';
(function(){
  if(window.__bauerTodayEnhancementsLoaded)return;
  window.__bauerTodayEnhancementsLoaded=true;

  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function installStyles(){
    if(document.getElementById('bauerTodayEnhancementStyles'))return;
    const style=document.createElement('style');
    style.id='bauerTodayEnhancementStyles';
    style.textContent=`
      body.bro-today-compact #appView>header{padding:6px 18px}
      body.bro-today-compact #appView>header .head-row{min-height:0}
      body.bro-today-compact #appView>header .brand h1{font-size:18px}
      body.bro-today-compact #appView>header .brand .sub{font-size:11px;margin-top:1px}
      body.bro-today-compact #appView>header .toolbar{gap:3px}
      body.bro-today-compact #appView>header .toolbar .btn{padding:5px 8px;margin-top:0}
      body.bro-today-compact #appView>header .nav{margin-top:3px}
      body.bro-today-compact #appView>header .nav button,
      body.bro-today-compact #appView>header .nav a{padding:6px 9px}
      body.bro-today-compact .wrap{margin-top:6px}
      body.bro-today-compact .today-hero{padding:3px 4px 7px;gap:10px}
      body.bro-today-compact .today-hero h2{font-size:23px;margin:1px 0 1px}
      body.bro-today-compact .today-date{font-size:12px}
      body.bro-today-compact .today-status-strip{padding:7px 11px;margin-bottom:8px;gap:10px}
      body.bro-today-compact .day-summary{font-size:13px}
      body.bro-today-compact .today-kpi{padding:4px 8px}
      body.bro-today-compact .today-layout{gap:12px}
      body.bro-today-compact .today-work-card{padding:0 15px 3px;margin-bottom:10px}
      body.bro-today-compact .today-section-heading{padding:10px 0 8px}
      body.bro-today-compact .today-section-heading h2{font-size:20px}
      body.bro-today-compact .today-sidebar .card{margin-bottom:10px}
      #weekJobsCard{display:none!important}
      #currentTask{margin:0}
      .bro-current-inline{position:relative;background:#f5f9ff;border-bottom:1px solid #e0e8f3}
      .bro-current-inline .bro-current-label{font-size:10px;font-weight:800;letter-spacing:.11em;color:#1f63ba;padding:9px 10px 0 14px}
      .bro-current-inline>.task{margin:0;padding:8px 10px 11px 14px;border-left:4px solid #246fe5;background:transparent}
      .bro-current-inline>.task:hover{background:#f0f6ff}
      .bro-current-inline .task-title b{font-size:16px}
      .bro-current-inline .task-due{margin-top:2px}
      .bro-current-inline .actions{margin-top:3px}
      .today-communication-origin{font-size:11px;color:#6b7280;margin-top:4px}
      .today-communication-origin strong{color:#445064}
      .task-more-menu .danger-link,.danger-link{color:#9e2922!important}
      .bro-task-date-heading{display:flex;align-items:center;gap:10px;padding:11px 10px 7px;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#4d5d72;background:#fff}
      .bro-task-date-heading::after{content:"";height:1px;background:#dfe5ec;flex:1}
      .bro-task-date-heading.today{color:#1c5fae}
      .bro-task-date-heading.future{margin-top:10px;background:#f7f8fa;color:#697586;border-top:2px solid #d9e0e8}
      .bro-future-task{background:#fafbfc!important;opacity:.92}
      #taskDeleteScopeDialog{border:0;border-radius:14px;padding:0;width:min(520px,92vw);box-shadow:0 20px 60px rgba(0,0,0,.25)}
      #taskDeleteScopeDialog::backdrop{background:rgba(15,23,42,.38)}
      #taskDeleteScopeDialog .scope-card{padding:20px}
      #taskDeleteScopeDialog h3{margin:0 0 8px;font-size:20px}
      #taskDeleteScopeDialog p{margin:6px 0;color:#566274;line-height:1.45}
      #taskDeleteScopeDialog .scope-task-name{font-weight:700;color:#26364b;background:#f4f6f9;border-radius:8px;padding:9px 10px;margin:12px 0}
      #taskDeleteScopeDialog .scope-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}
      #taskDeleteScopeDialog .scope-actions .btn{margin-top:0}
      @media(max-width:680px){body.bro-today-compact .today-hero{padding-top:2px}.bro-current-inline>.task{padding-right:4px}}
    `;
    document.head.appendChild(style);
  }

  function todayIsVisible(){
    const view=document.getElementById('view-today');
    return !!view&&!view.classList.contains('hidden');
  }

  function syncTodayClass(){document.body.classList.toggle('bro-today-compact',todayIsVisible());}
  function isoToday(){return new Date().toLocaleDateString('en-CA',{timeZone:'America/New_York'});}

  function moveCurrentTaskIntoList(){
    const current=document.getElementById('currentTask');
    const list=document.getElementById('todayTaskList');
    const card=list?.closest('.today-work-card');
    if(!current||!list||!card)return;
    if(current.parentElement!==card)card.insertBefore(current,list);
  }

  function organizeTaskDates(){
    const list=document.getElementById('todayTaskList');
    const current=document.getElementById('currentTask');
    const card=list?.closest('.today-work-card');
    if(!list||!current||!card)return;

    card.querySelectorAll('.bro-task-date-heading').forEach(el=>el.remove());
    list.querySelectorAll('.bro-future-task').forEach(el=>el.classList.remove('bro-future-task'));

    const today=isoToday();
    let firstFuture=null;
    [...list.children].forEach(node=>{
      if(node.classList.contains('bro-task-date-heading'))return;
      const taskId=node.dataset?.taskId;
      const commId=node.dataset?.communicationId;
      let due='';
      if(taskId)due=(state.tasks||[]).find(t=>t.id===taskId)?.due_date||'';
      else if(commId)due=(state.communications||[]).find(c=>c.id===commId)?.due_date||'';
      if(due&&due>today){
        node.classList.add('bro-future-task');
        if(!firstFuture)firstFuture=node;
      }
    });

    const todayHeading=document.createElement('div');
    todayHeading.className='bro-task-date-heading today';
    todayHeading.textContent='Today & Overdue';
    card.insertBefore(todayHeading,current);

    if(firstFuture){
      const futureHeading=document.createElement('div');
      futureHeading.className='bro-task-date-heading future';
      futureHeading.textContent='Tomorrow & Later';
      list.insertBefore(futureHeading,firstFuture);
    }
  }

  function ensureScopeDialog(){
    if(document.getElementById('taskDeleteScopeDialog'))return;
    const dialog=document.createElement('dialog');
    dialog.id='taskDeleteScopeDialog';
    dialog.innerHTML=`<div class="scope-card"><h3>Delete repeating task?</h3><p>Choose whether to remove only this occurrence or stop the repeating task.</p><div class="scope-task-name" id="taskDeleteScopeName"></div><div class="scope-actions"><button class="btn danger" type="button" data-task-delete-scope="one">This occurrence only</button><button class="btn danger" type="button" data-task-delete-scope="all">All occurrences</button><button class="btn" type="button" data-task-delete-scope="cancel">Cancel</button></div></div>`;
    document.body.appendChild(dialog);
  }

  let pendingTaskDelete=null;

  function isRepeatingTask(task){
    return !!(task&&(task.recurring_rule_id||task.recurrence_series_id||(task.repeat_pattern&&task.repeat_pattern!=='None')));
  }

  function openDeleteScope(task){
    ensureScopeDialog();
    pendingTaskDelete=task;
    const name=document.getElementById('taskDeleteScopeName');
    if(name)name.textContent=task.task||'Repeating task';
    document.getElementById('taskDeleteScopeDialog').showModal();
  }

  async function deleteOccurrence(task){
    const {error}=await db.rpc('bauer_record_action',{
      p_table:'tasks',p_id:task.id,p_action:'delete',p_description:`Deleted one occurrence of ${task.task||'repeating task'}.`
    });
    if(error)throw error;
  }

  async function deleteSeries(task){
    if(task.recurring_rule_id){
      const stop=await db.from('recurring_rules').update({active:false,updated_at:new Date().toISOString()}).eq('id',task.recurring_rule_id);
      if(stop.error)throw stop.error;
      const rows=await db.from('tasks').select('id,status').eq('recurring_rule_id',task.recurring_rule_id).is('deleted_at',null);
      if(rows.error)throw rows.error;
      for(const row of rows.data||[]){
        if(['Completed','Cancelled','Skipped'].includes(String(row.status||'')))continue;
        const result=await db.rpc('bauer_record_action',{p_table:'tasks',p_id:row.id,p_action:'delete',p_description:`Deleted remaining occurrences of ${task.task||'repeating task'}.`});
        if(result.error)throw result.error;
      }
      return;
    }
    if(task.recurrence_series_id){
      const rows=await db.from('tasks').select('id,status').eq('recurrence_series_id',task.recurrence_series_id).is('deleted_at',null);
      if(rows.error)throw rows.error;
      for(const row of rows.data||[]){
        if(['Completed','Cancelled','Skipped'].includes(String(row.status||'')))continue;
        const result=await db.rpc('bauer_record_action',{p_table:'tasks',p_id:row.id,p_action:'delete',p_description:`Deleted remaining occurrences of ${task.task||'repeating task'}.`});
        if(result.error)throw result.error;
      }
      return;
    }
    await deleteOccurrence(task);
  }

  async function refreshAfterChange(message,type='success'){
    try{if(typeof loadAll==='function')await loadAll();else if(typeof renderDashboard==='function')renderDashboard();}catch(error){console.warn('Today refresh failed',error);}
    moveCurrentTaskIntoList();organizeTaskDates();syncTodayClass();
    if(typeof msg==='function'&&message)msg(message,type);
  }

  async function deleteCommunication(id){
    const communication=(state.communications||[]).find(item=>item.id===id);
    if(!communication)return;
    const job=(state.jobs||[]).find(item=>item.id===communication.job_id);
    const label=communication.purpose||communication.type||'communication reminder';
    const jobText=job?.customer_name?` for ${job.customer_name}`:'';
    if(!confirm(`Delete “${label}”${jobText}?\n\nThis removes only this reminder. It does not delete the job.`))return;
    const result=await db.from('communications').delete().eq('id',id);
    if(result.error)throw result.error;
    state.communications=(state.communications||[]).filter(item=>item.id!==id);
    await refreshAfterChange('Communication reminder deleted.');
  }

  async function completeCommunication(id){
    const result=await db.from('communications').update({status:'Completed',completed_at:new Date().toISOString(),completed_by:user?.email||'Eve',updated_at:new Date().toISOString()}).eq('id',id);
    if(result.error)throw result.error;
    await refreshAfterChange('Communication reminder completed.');
  }

  function overrideRenderers(){
    const originalCommunication=communicationDueCard;
    communicationDueCard=function(entry){
      if(entry?.kind!=='communication')return originalCommunication(entry);
      const c=entry.item;
      const dueText=formatDueDateTime(c.due_date,c.due_time);
      const job=(state.jobs||[]).find(j=>j.id===c.job_id);
      const sourceNote=c.purpose==='Installation-day customer check-in'
        ? 'Auto-created when this job entered In Production.'
        : '';
      const jobLine=job?`${job.customer_name||'Job customer'}${job.job_number?` • Job #${job.job_number}`:''}`:'';
      return `<div class="task task-category-communication" data-communication-id="${safe(c.id)}"><div class="task-title"><b>${safe(c.purpose||c.type||'Customer communication')}</b></div>${dueText?`<div class="task-due">${safe(dueText)}</div>`:''}${jobLine?`<div class="today-communication-origin"><strong>${safe(jobLine)}</strong></div>`:''}${sourceNote?`<div class="today-communication-origin">${safe(sourceNote)}</div>`:''}<div class="actions">${job?`<button class="btn small" type="button" data-edit-job="${safe(job.id)}">Open Job</button>`:''}<button class="btn small" type="button" data-complete-communication="${safe(c.id)}">Complete</button><button class="btn small danger-link" type="button" data-delete-communication="${safe(c.id)}">Delete</button></div></div>`;
    };

    renderNextUp=function(task){
      const target=document.getElementById('currentTask');
      if(!target)return;
      if(!task){target.innerHTML='';return;}
      target.innerHTML=`<div class="bro-current-inline"><div class="bro-current-label">CURRENT TASK</div>${taskCard(task)}</div>`;
    };

    const originalDashboard=renderDashboard;
    renderDashboard=function(){
      originalDashboard();
      moveCurrentTaskIntoList();
      organizeTaskDates();
      syncTodayClass();
    };
  }

  function installEvents(){
    document.addEventListener('click',async event=>{
      try{
        const communicationDelete=event.target.closest('[data-delete-communication]');
        if(communicationDelete){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();await deleteCommunication(communicationDelete.dataset.deleteCommunication);return;}
        const communicationComplete=event.target.closest('[data-complete-communication]');
        if(communicationComplete){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();await completeCommunication(communicationComplete.dataset.completeCommunication);return;}

        const taskDelete=event.target.closest('[data-record-action="delete"][data-record-table="tasks"]');
        if(taskDelete){
          const task=(state.tasks||[]).find(item=>item.id===taskDelete.dataset.recordId);
          if(task&&isRepeatingTask(task)){
            event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();openDeleteScope(task);return;
          }
        }

        const scope=event.target.closest('[data-task-delete-scope]');
        if(scope){
          event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
          const choice=scope.dataset.taskDeleteScope;
          const dialog=document.getElementById('taskDeleteScopeDialog');
          if(choice==='cancel'){pendingTaskDelete=null;dialog?.close();return;}
          const task=pendingTaskDelete;if(!task){dialog?.close();return;}
          scope.disabled=true;
          try{
            if(choice==='all')await deleteSeries(task);else await deleteOccurrence(task);
            pendingTaskDelete=null;dialog?.close();
            await refreshAfterChange(choice==='all'?'Repeating task and remaining occurrences deleted.':'This task occurrence was deleted.');
          }finally{scope.disabled=false;}
          return;
        }
      }catch(error){
        console.error(error);
        if(typeof msg==='function')msg(error.message||String(error),'error');
      }
    },true);
  }

  async function install(){
    for(let i=0;i<80;i++){
      if(typeof communicationDueCard==='function'&&typeof taskCard==='function'&&typeof renderNextUp==='function'&&typeof renderDashboard==='function'&&typeof state!=='undefined'&&typeof db!=='undefined')break;
      await sleep(100);
    }
    if(typeof communicationDueCard!=='function'||typeof taskCard!=='function'||typeof renderDashboard!=='function')return;
    installStyles();ensureScopeDialog();overrideRenderers();installEvents();moveCurrentTaskIntoList();syncTodayClass();
    const nav=document.getElementById('nav');
    if(nav)new MutationObserver(()=>{syncTodayClass();moveCurrentTaskIntoList();}).observe(nav,{subtree:true,attributes:true,attributeFilter:['class']});
    const today=document.getElementById('view-today');
    if(today)new MutationObserver(()=>{syncTodayClass();moveCurrentTaskIntoList();}).observe(today,{attributes:true,attributeFilter:['class']});
    try{renderDashboard();}catch(error){console.warn('Today enhancement initial render deferred',error);}
  }

  install();
})();
