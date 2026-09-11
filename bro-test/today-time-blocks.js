'use strict';
(function(){
  if(window.__bauerTodayTimeBlocksLoaded)return;
  window.__bauerTodayTimeBlocksLoaded=true;

  const BLOCKS=[
    {key:'early-morning',label:'Early Morning',time:'08:15:00',start:0,end:9.75},
    {key:'late-morning',label:'Late Morning',time:'11:00:00',start:9.75,end:12.5},
    {key:'early-afternoon',label:'Early Afternoon',time:'13:30:00',start:12.5,end:15.5},
    {key:'late-afternoon',label:'Late Afternoon',time:'16:30:00',start:15.5,end:24}
  ];
  const BLOCK_TIMES=new Set(BLOCKS.map(b=>b.time.slice(0,5)));
  let arranging=false;
  let draggedTaskId='';

  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const todayISO=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/New_York'});
  const minutes=t=>{const m=String(t||'').match(/^(\d{1,2}):(\d{2})/);return m?(Number(m[1])+Number(m[2])/60):null;};
  const blockForTime=t=>{const n=minutes(t);if(n==null)return BLOCKS[0];return BLOCKS.find(b=>n>=b.start&&n<b.end)||BLOCKS[0];};
  function currentHourET(){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());const h=Number(parts.find(p=>p.type==='hour')?.value||0),m=Number(parts.find(p=>p.type==='minute')?.value||0);return h+m/60;}

  function installStyles(){
    if(document.getElementById('broTimeBlockStyles'))return;
    const style=document.createElement('style');
    style.id='broTimeBlockStyles';
    style.textContent=`
      #currentTask{display:none!important}
      .bro-time-block{margin:10px 0 14px;border:1px solid #d9e2ec;border-radius:12px;background:#f8fafc;overflow:hidden}
      .bro-time-block-head{display:flex;align-items:center;justify-content:space-between;padding:9px 12px;background:#eef3f8;border-bottom:1px solid #d9e2ec;font-size:12px;font-weight:800;color:#415168;letter-spacing:.035em}
      .bro-time-block-head .bro-block-hint{font-size:10px;font-weight:600;color:#7d8998;letter-spacing:0}
      .bro-time-block-body{min-height:46px;padding:8px}
      .bro-time-block-body.bro-drag-over{background:#eaf3ff;box-shadow:inset 0 0 0 2px #3b82f6}
      .bro-time-block-body>.task,.bro-exact-time-section>.task{cursor:default!important;position:relative;margin:0 0 8px!important;padding:11px 12px!important;border:1px solid #d6dee8!important;border-radius:10px!important;background:#fff!important;box-shadow:0 2px 7px rgba(31,48,72,.07)!important}
      .bro-time-block-body>.task:last-child,.bro-exact-time-section>.task:last-child{margin-bottom:0!important}
      .bro-time-block-body>.task:hover,.bro-exact-time-section>.task:hover{border-color:#bcc9d8!important;box-shadow:0 4px 11px rgba(31,48,72,.10)!important}
      .bro-time-block-body>.task button,.bro-time-block-body>.task a,.bro-time-block-body>.task input,.bro-time-block-body>.task label,.bro-exact-time-section>.task button,.bro-exact-time-section>.task a,.bro-exact-time-section>.task input,.bro-exact-time-section>.task label{cursor:pointer!important}
      .bro-time-block-body>.task.bro-dragging,.bro-exact-time-section>.task.bro-dragging{opacity:.45}
      .bro-task-drag-handle{float:right;display:inline-flex;align-items:center;justify-content:center;min-width:34px;height:28px;margin:0 0 6px 10px;padding:0 8px;border:1px solid #cdd7e3;border-radius:7px;background:#f4f7fa;color:#56677b;font-size:12px;font-weight:700;line-height:1;cursor:grab;user-select:none}
      .bro-task-drag-handle:hover{background:#eaf0f6;border-color:#b8c5d4}
      .bro-task-drag-handle:active{cursor:grabbing}
      .bro-time-block-empty{padding:10px;color:#98a2b1;font-size:12px;font-style:italic}
      .bro-exact-time-section{margin:10px 0 14px;border:1px solid #d9e2ec;border-radius:12px;background:#f8fafc;padding:8px}
      .bro-exact-time-heading{font-size:11px;font-weight:800;color:#5e6d80;padding:2px 4px 8px;text-transform:uppercase;letter-spacing:.06em}
      .bro-exact-time-note{font-size:10px;color:#8b96a5;margin-left:6px;text-transform:none;letter-spacing:0;font-weight:600}
      .bro-in-progress-task{box-shadow:inset 4px 0 0 #246fe5,0 2px 7px rgba(31,48,72,.07)!important}
      .task-subtasks{margin-top:8px;padding-top:7px;border-top:1px solid #edf1f5}
      .task-subtask{display:flex;align-items:center;gap:7px;padding:3px 0}
    `;
    document.head.appendChild(style);
  }

  function taskForNode(node){
    const id=node?.dataset?.taskId;
    return id?(state.tasks||[]).find(t=>t.id===id):null;
  }

  function isTodayTask(task){
    if(!task||task.deleted_at)return false;
    if(['Completed','Cancelled','Skipped','Blocked','Waiting'].includes(String(task.status||'')))return false;
    return !task.due_date||task.due_date<=todayISO();
  }

  function originalTaskNodes(list){
    return [...list.children].filter(node=>node.classList.contains('task')&&node.dataset?.taskId);
  }

  function harvestInProgressNode(list){
    const current=document.getElementById('currentTask');
    if(!current)return null;
    const node=current.querySelector('.task[data-task-id]');
    if(!node)return null;
    const task=taskForNode(node);
    if(!isTodayTask(task))return null;
    node.classList.add('bro-in-progress-task');
    list.appendChild(node);
    current.innerHTML='';
    return node;
  }

  function makeBlock(block){
    const wrap=document.createElement('section');
    wrap.className='bro-time-block';
    wrap.dataset.timeBlock=block.key;
    wrap.innerHTML=`<div class="bro-time-block-head"><span>${block.label}</span><span class="bro-block-hint">drag with Move</span></div><div class="bro-time-block-body" data-block-drop="${block.key}"></div>`;
    return wrap;
  }

  function wireDraggable(node){
    if(!node?.dataset?.taskId)return;
    node.draggable=false;
    node.removeAttribute('draggable');
    if(node.querySelector(':scope > .bro-task-drag-handle'))return;
    const handle=document.createElement('button');
    handle.type='button';
    handle.className='bro-task-drag-handle';
    handle.textContent='Move';
    handle.title='Drag task to another time block';
    handle.setAttribute('aria-label','Drag task to another time block');
    handle.draggable=true;
    handle.addEventListener('click',event=>event.preventDefault());
    handle.addEventListener('dragstart',event=>{
      event.stopPropagation();
      draggedTaskId=node.dataset.taskId;
      node.classList.add('bro-dragging');
      event.dataTransfer.effectAllowed='move';
      event.dataTransfer.setData('text/plain',draggedTaskId);
    });
    handle.addEventListener('dragend',()=>{
      node.classList.remove('bro-dragging');
      draggedTaskId='';
      document.querySelectorAll('.bro-drag-over').forEach(el=>el.classList.remove('bro-drag-over'));
    });
    node.insertBefore(handle,node.firstChild);
  }

  function arrange(){
    if(arranging)return;
    const list=document.getElementById('todayTaskList');
    if(!list||typeof state==='undefined')return;
    arranging=true;
    try{
      harvestInProgressNode(list);
      const existing=[...list.querySelectorAll('.bro-time-block,.bro-exact-time-section')];
      const savedNodes=[];
      existing.forEach(group=>group.querySelectorAll(':scope .task[data-task-id]').forEach(n=>savedNodes.push(n)));
      existing.forEach(group=>group.remove());

      const direct=originalTaskNodes(list);
      const nodes=[...new Set([...savedNodes,...direct])].filter(node=>isTodayTask(taskForNode(node)));
      if(!nodes.length)return;

      const futureHeading=list.querySelector('.bro-task-date-heading.future');
      const insertBefore=futureHeading||null;
      const blockEls=new Map();
      BLOCKS.forEach(block=>{
        const el=makeBlock(block);blockEls.set(block.key,el);list.insertBefore(el,insertBefore);
      });
      const exact=document.createElement('section');
      exact.className='bro-exact-time-section';
      exact.innerHTML='<div class="bro-exact-time-heading">Exact-time commitments <span class="bro-exact-time-note">kept exact unless moved into a block</span></div>';
      list.insertBefore(exact,insertBefore);

      nodes.forEach(node=>{
        const task=taskForNode(node);if(!task)return;
        node.classList.toggle('bro-in-progress-task',String(task.status||'')==='In Progress');
        wireDraggable(node);
        const hhmm=String(task.due_time||'').slice(0,5);
        if(task.due_time&&!BLOCK_TIMES.has(hhmm)){
          exact.appendChild(node);
        }else{
          const block=blockForTime(task.due_time);
          blockEls.get(block.key).querySelector('.bro-time-block-body').appendChild(node);
        }
      });

      const nowHour=currentHourET();
      blockEls.forEach((el,key)=>{
        const body=el.querySelector('.bro-time-block-body');
        const block=BLOCKS.find(b=>b.key===key);
        const hasTasks=!!body.querySelector('.task');
        if(!hasTasks&&block&&nowHour>=block.end){
          el.style.display='none';
        }else if(!hasTasks){
          body.innerHTML='<div class="bro-time-block-empty">No tasks in this block</div>';
        }
      });
      if(!exact.querySelector('.task'))exact.style.display='none';
    }finally{arranging=false;}
  }

  async function moveTask(taskId,blockKey){
    const block=BLOCKS.find(b=>b.key===blockKey);const task=(state.tasks||[]).find(t=>t.id===taskId);
    if(!block||!task)return;
    const patch={due_date:task.due_date&&task.due_date<todayISO()?todayISO():(task.due_date||todayISO()),due_time:block.time};
    const result=await db.from('tasks').update(patch).eq('id',taskId);
    if(result.error)throw result.error;
    task.due_date=patch.due_date;task.due_time=patch.due_time;
    if(typeof msg==='function')msg(`${task.task||'Task'} moved to ${block.label}.`,'success');
    if(typeof loadAll==='function')await loadAll();
    setTimeout(arrange,50);
  }

  function installDropEvents(){
    document.addEventListener('dragover',event=>{
      const zone=event.target.closest('[data-block-drop]');if(!zone)return;
      event.preventDefault();event.dataTransfer.dropEffect='move';zone.classList.add('bro-drag-over');
    });
    document.addEventListener('dragleave',event=>{const zone=event.target.closest('[data-block-drop]');if(zone&&!zone.contains(event.relatedTarget))zone.classList.remove('bro-drag-over');});
    document.addEventListener('drop',async event=>{
      const zone=event.target.closest('[data-block-drop]');if(!zone)return;
      event.preventDefault();zone.classList.remove('bro-drag-over');
      const id=event.dataTransfer.getData('text/plain')||draggedTaskId;if(!id)return;
      try{await moveTask(id,zone.dataset.blockDrop);}catch(error){console.error(error);if(typeof msg==='function')msg('Could not move task: '+(error.message||String(error)),'error');}
    });
  }

  async function install(){
    for(let i=0;i<80;i++){if(typeof state!=='undefined'&&typeof db!=='undefined'&&document.getElementById('todayTaskList'))break;await sleep(100);}
    if(typeof state==='undefined'||typeof db==='undefined')return;
    installStyles();installDropEvents();
    const list=document.getElementById('todayTaskList');
    const current=document.getElementById('currentTask');
    if(list)new MutationObserver(()=>setTimeout(arrange,0)).observe(list,{childList:true});
    if(current)new MutationObserver(()=>setTimeout(arrange,0)).observe(current,{childList:true,subtree:true});
    setInterval(()=>setTimeout(arrange,0),60000);
    setTimeout(arrange,150);
  }

  install();
})();
