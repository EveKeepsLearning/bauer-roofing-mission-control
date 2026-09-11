'use strict';
(function(){
  if(window.__broTaskJobRoutingLoaded)return;
  window.__broTaskJobRoutingLoaded=true;
  const norm=v=>String(v||'').trim().toLowerCase();
  function text(el){return String(el?.textContent||'').replace(/\s+/g,' ').trim();}
  function findJob(button){
    if(typeof state==='undefined')return null;
    const jobs=state.jobs||[];
    const direct=button.dataset.jobId||button.dataset.editJob||button.dataset.openJob||button.getAttribute('data-edit-job')||button.getAttribute('data-job-id')||'';
    if(direct){const j=jobs.find(x=>String(x.id)===String(direct));if(j)return j;}
    let root=button.closest('[data-task-id],[data-id],.task-card,.task-item,.task,.today-task-card,.today-task-row');
    if(!root)root=button.parentElement?.parentElement||button.parentElement;
    const taskId=root?.dataset?.taskId||root?.dataset?.id||'';
    const task=taskId?(state.tasks||[]).find(t=>String(t.id)===String(taskId)):null;
    if(task){
      const id=task.job_id||task.related_job_id||'';
      if(id){const j=jobs.find(x=>String(x.id)===String(id));if(j)return j;}
      const num=task.job_number||task.related_number||'';
      if(num){const j=jobs.find(x=>norm(x.job_number)===norm(num));if(j)return j;}
    }
    const body=text(root);
    const numberMatch=body.match(/\b(?:Job\s*#?\s*)?([0-9]{2}[A-Za-z][0-9A-Za-z]+)\b/i);
    if(numberMatch){const j=jobs.find(x=>norm(x.job_number)===norm(numberMatch[1]));if(j)return j;}
    const byName=jobs.filter(j=>{const name=norm(j.customer_name);return name&&norm(body).includes(name);});
    if(byName.length===1)return byName[0];
    return null;
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('button,a');
    if(!button||norm(text(button))!=='open job'||button.closest('#jobDialog'))return;
    const job=findJob(button);if(!job)return;
    event.preventDefault();event.stopImmediatePropagation();
    const version=window.BAUER_CONFIG?.APP_VERSION||'';
    location.href=`jobs.html?job=${encodeURIComponent(job.id)}${version?`&v=${encodeURIComponent(version)}`:''}`;
  },true);
})();
