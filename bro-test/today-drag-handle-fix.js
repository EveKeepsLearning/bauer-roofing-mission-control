'use strict';
(function(){
  if(window.__broTodayDragHandleFixLoaded)return;
  window.__broTodayDragHandleFixLoaded=true;

  function ensureStyles(){
    if(document.getElementById('broTodayDragHandleStyles'))return;
    const s=document.createElement('style');
    s.id='broTodayDragHandleStyles';
    s.textContent=`
      #todayTaskList .task[data-task-id]{cursor:default!important;position:relative}
      #todayTaskList .task[data-task-id] button,
      #todayTaskList .task[data-task-id] input,
      #todayTaskList .task[data-task-id] label,
      #todayTaskList .task[data-task-id] a{cursor:pointer!important}
      .bro-task-drag-handle{float:right;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;margin:-1px 0 4px 8px;border:1px solid #d6dee8;border-radius:7px;background:#f5f7fa;color:#697789;font-size:15px;line-height:1;cursor:grab;user-select:none}
      .bro-task-drag-handle:active{cursor:grabbing}
    `;
    document.head.appendChild(s);
  }

  function prepareCard(card){
    if(!card?.dataset?.taskId)return;
    card.draggable=false;
    card.removeAttribute('draggable');
    if(card.querySelector(':scope > .bro-task-drag-handle'))return;
    const handle=document.createElement('span');
    handle.className='bro-task-drag-handle';
    handle.textContent='⠿';
    handle.title='Drag task to another time block';
    handle.setAttribute('aria-label','Drag task to another time block');
    handle.draggable=true;
    handle.addEventListener('dragstart',event=>{
      event.stopPropagation();
      event.dataTransfer.effectAllowed='move';
      event.dataTransfer.setData('text/plain',card.dataset.taskId);
      card.classList.add('bro-dragging');
    });
    handle.addEventListener('dragend',()=>{
      card.classList.remove('bro-dragging');
      document.querySelectorAll('.bro-drag-over').forEach(el=>el.classList.remove('bro-drag-over'));
    });
    card.insertBefore(handle,card.firstChild);
  }

  function scan(){
    const list=document.getElementById('todayTaskList');
    if(!list)return;
    list.querySelectorAll('.task[data-task-id]').forEach(prepareCard);
  }

  function install(){
    ensureStyles();
    scan();
    const list=document.getElementById('todayTaskList');
    if(!list)return setTimeout(install,100);
    new MutationObserver(()=>scan()).observe(list,{childList:true,subtree:true,attributes:true,attributeFilter:['draggable']});
    document.addEventListener('pointerdown',event=>{
      const interactive=event.target.closest('#todayTaskList .task[data-task-id] button,#todayTaskList .task[data-task-id] input,#todayTaskList .task[data-task-id] label,#todayTaskList .task[data-task-id] a');
      if(interactive){const card=interactive.closest('.task[data-task-id]');if(card){card.draggable=false;card.removeAttribute('draggable');}}
    },true);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
