'use strict';
(function(){
  const REPAIR='#4054b2';
  const REROOF='#1296d4';

  function kind(j){
    const raw=String((typeof jobType==='function'?jobType(j):(j?.job_type||j?.primary_category||''))||'').toLowerCase();
    if(raw.includes('repair')) return 'repair';
    if(raw.includes('reroof')||raw.includes('re-roof')||raw.includes('re roof')) return 'reroof';
    return '';
  }

  function installStyles(){
    if(document.getElementById('broJobTypeColors')) return;
    const style=document.createElement('style');
    style.id='broJobTypeColors';
    style.textContent=`
      .job-card.bro-repair{border:3px solid ${REPAIR}!important;padding:8px!important}
      .job-card.bro-reroof{border:3px solid ${REROOF}!important;padding:8px!important}
      .jobs-table tr.bro-repair td:first-child{border-left:6px solid ${REPAIR}!important}
      .jobs-table tr.bro-reroof td:first-child{border-left:6px solid ${REROOF}!important}
      .jobs-table tr.bro-repair{background:linear-gradient(90deg,rgba(64,84,178,.08),transparent 24%)}
      .jobs-table tr.bro-reroof{background:linear-gradient(90deg,rgba(18,150,212,.08),transparent 24%)}
      .jobs-table tr.bro-repair:hover{background:linear-gradient(90deg,rgba(64,84,178,.14),#f8fbff 28%)}
      .jobs-table tr.bro-reroof:hover{background:linear-gradient(90deg,rgba(18,150,212,.14),#f8fbff 28%)}
    `;
    document.head.appendChild(style);
  }

  function decorateTable(){
    if(typeof jobs==='undefined') return;
    document.querySelectorAll('.jobs-table tr[data-job-id]').forEach(row=>{
      const j=jobs.find(x=>String(x.id)===String(row.dataset.jobId));
      row.classList.remove('bro-repair','bro-reroof');
      const k=kind(j);
      if(k) row.classList.add('bro-'+k);
    });
  }

  installStyles();

  if(typeof card==='function'){
    const baseCard=card;
    card=function(j){
      const html=baseCard(j);
      const k=kind(j);
      return k?html.replace('class="job-card"',`class="job-card bro-${k}"`):html;
    };
  }

  if(typeof renderTable==='function'){
    const baseRenderTable=renderTable;
    renderTable=function(){const r=baseRenderTable();decorateTable();return r;};
  }

  if(typeof renderAll==='function'){
    const baseRenderAll=renderAll;
    renderAll=function(){const r=baseRenderAll();decorateTable();return r;};
  }

  if(typeof renderAll==='function') renderAll();
})();
