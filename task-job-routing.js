'use strict';
(function(){
  if(window.__broTaskJobRoutingLoaded)return;
  window.__broTaskJobRoutingLoaded=true;
  function text(el){return String(el?.textContent||'').trim();}
  function taskFor(button){const root=button.closest('[data-task-id],[data-id],.task-card,.task-item,.task');const id=root?.dataset?.taskId||root?.dataset?.id||'';if(id&&typeof state!=='undefined')return (state.tasks||[]).find(t=>String(t.id)===String(id))||null;return null;}
  function jobFor(button){if(typeof state==='undefined')return null;const jobs=state.jobs||[];const directId=button.dataset.jobId||button.closest('[data-job-id]')?.dataset.jobId||'';if(directId){const j=jobs.find(x=>String(x.id)===String(directId));if(j)return j;}const task=taskFor(button);if(task){const id=task.job_id||task.related_job_id||'';if(id){const j=jobs.find(x=>String(x.id)===String(id));if(j)return j;}const num=task.job_number||task.related_number||'';if(num){const j=jobs.find(x=>String(x.job_number||'')===String(num));if(j)return j;}}
    const root=button.closest('[data-task-id],[data-id],.task-card,.task-item,.task')||button.parentElement;const body=text(root);const m=body.match(/\b(?:Job\s*#?\s*)?([0-9]{2}[A-Za-z][0-9A-Za-z]+)\b/i);if(m){const j=jobs.find(x=>String(x.job_number||'').toLowerCase()===String(m[1]).toLowerCase());if(j)return j;}return null;}
  document.addEventListener('click',event=>{const button=event.target.closest('button,a');if(!button||text(button).toLowerCase()!=='open job')return;if(button.closest('#jobDialog'))return;const job=jobFor(button);if(!job)return;event.preventDefault();event.stopImmediatePropagation();const version=window.BAUER_CONFIG?.APP_VERSION||'';location.href=`jobs.html?job=${encodeURIComponent(job.id)}${version?`&v=${encodeURIComponent(version)}`:''}`;},true);
})();
