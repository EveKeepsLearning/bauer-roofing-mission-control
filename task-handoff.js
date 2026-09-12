'use strict';
(function(){
  if(window.__bauerTaskHandoffLoaded)return;
  window.__bauerTaskHandoffLoaded=true;
  const STORE='bauer_pending_task_handoff_v1';
  const version=window.BAUER_CONFIG?.APP_VERSION||'';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function inferContext(el){
    const root=el.closest('[data-job-id],[data-lead-id],[data-contact-id],[data-task-id],[data-communication-id],.task,.card,.lead-detail,.contact-detail,.job-card')||el.parentElement;
    const text=(root?.innerText||'').replace(/\s+/g,' ').trim();
    const related=(text.match(/(?:Inquiry|Lead)\s*#\s*([A-Za-z0-9-]+)/i)||text.match(/Job\s*#\s*([A-Za-z0-9-]+)/i)||[])[1]||'';
    const title=(root?.querySelector('h1,h2,h3,b,strong')?.textContent||'').trim();
    const label=(el.textContent||'').trim().toLowerCase();
    let task='Follow up';
    if(label.includes('call'))task='Call';
    else if(label.includes('text'))task='Text';
    else if(label.includes('email'))task='Email';
    else if(title)task=`Follow up: ${title}`;
    if(['Call','Text','Email'].includes(task)&&title)task+=` ${title}`;
    return {task,related_number:related,description:text.slice(0,240)};
  }

  function openOnMain(data={}){
    if(typeof clearTaskForm!=='function'||!document.getElementById('taskDialog'))return false;
    clearTaskForm();
    const set=(id,value)=>{const el=document.getElementById(id);if(el&&value!=null)el.value=value;};
    set('taskName',data.task||'Follow up');
    set('taskRelatedNumber',data.related_number||'');
    set('taskDescription',data.description||'');
    setTaskSchedule(data.due_date||new Date().toLocaleDateString('en-CA',{timeZone:'America/New_York'}),data.due_time||'');
    if(data.category)set('taskCategory',data.category);
    document.getElementById('taskDialogTitle').textContent='New Task';
    document.getElementById('saveTaskBtn').textContent='Save';
    document.getElementById('taskDialog').showModal();
    setTimeout(()=>document.getElementById('taskName')?.focus(),0);
    return true;
  }

  function open(data={}){
    if(openOnMain(data))return;
    localStorage.setItem(STORE,JSON.stringify(data));
    location.href=`index.html?view=today&newTask=1${version?`&v=${encodeURIComponent(version)}`:''}`;
  }
  window.BROTaskHandoff={open};

  function addTaskButtonToActions(){
    const selectors=['[data-edit-phone]','[data-edit-job]','[data-lead-select]','[data-contact-select]','[data-edit-appointment]','a[href^="tel:"]','a[href^="mailto:"]'];
    document.querySelectorAll(selectors.join(',')).forEach(anchor=>{
      const actions=anchor.closest('.actions,.toolbar,.appointment-row-actions,.lead-detail-actions')||anchor.parentElement;
      if(!actions||actions.querySelector(':scope > [data-bro-add-task]'))return;
      const btn=document.createElement('button');
      btn.type='button';btn.className='btn small';btn.dataset.broAddTask='1';btn.textContent='+ Task';
      btn.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();open(inferContext(anchor));});
      actions.appendChild(btn);
    });
  }

  function consumePending(){
    const raw=localStorage.getItem(STORE);if(!raw)return;
    try{
      const data=JSON.parse(raw);if(openOnMain(data))localStorage.removeItem(STORE);
    }catch(_){localStorage.removeItem(STORE);}
  }

  function install(){
    const style=document.createElement('style');style.textContent='[data-bro-add-task]{white-space:nowrap}';document.head.appendChild(style);
    addTaskButtonToActions();consumePending();
    new MutationObserver(()=>addTaskButtonToActions()).observe(document.body,{childList:true,subtree:true});
    if(new URLSearchParams(location.search).get('newTask')==='1')setTimeout(consumePending,350);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
