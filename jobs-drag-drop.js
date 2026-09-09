'use strict';
(function(){
  const STAGE_DEFS=[
    {key:'awarded',value:'Awarded',label:'Awarded'},
    {key:'contract',value:'Deposit',label:'Deposit'},
    {key:'material',value:'Material Ordered',label:'Material Ordered'},
    {key:'ready',value:'Ready to Schedule',label:'Ready to Schedule'},
    {key:'scheduled',value:'Scheduled',label:'Scheduled'},
    {key:'delivered',value:'Material Delivered',label:'Material Delivered'},
    {key:'production',value:'In Production',label:'In Production'},
    {key:'complete',value:'Work Complete',label:'Work Complete'},
    {key:'closeout',value:'Final Payment / Closeout',label:'Final Payment / Closeout'}
  ];
  let draggingId=null;
  let suppressClickUntil=0;
  let activeDrop=null;

  function addStyles(){
    if(document.getElementById('broDragDropStyles')) return;
    const s=document.createElement('style');
    s.id='broDragDropStyles';
    s.textContent=`
      #timelineBoard .job-card[draggable="true"]{cursor:grab;user-select:none}
      #timelineBoard .job-card[draggable="true"]:active{cursor:grabbing}
      #timelineBoard .job-card.bro-dragging{opacity:.42;transform:scale(.98)}
      #timelineBoard .stage-col.bro-drop-target{outline:3px dashed rgba(31,111,213,.55);outline-offset:-4px;background-image:linear-gradient(rgba(255,255,255,.24),rgba(255,255,255,.24))}
      #timelineBoard .stage-col.bro-drop-target .stage-head::after{content:' Drop here';font-weight:600;font-size:11px;color:#1f6fd5}
    `;
    document.head.appendChild(s);
  }

  function clearDropTarget(){
    document.querySelectorAll('#timelineBoard .stage-col.bro-drop-target').forEach(x=>x.classList.remove('bro-drop-target'));
    activeDrop=null;
  }

  function stageDefForJob(j){
    const key=typeof stageKey==='function'?stageKey(j):String(j?.stage||'').toLowerCase();
    return STAGE_DEFS.find(x=>x.key===key)||STAGE_DEFS[0];
  }

  async function moveJob(jobId,target){
    if(!jobId||!target||typeof jobs==='undefined') return;
    const job=jobs.find(j=>String(j.id)===String(jobId));
    if(!job) return;
    const source=stageDefForJob(job);
    if(source.key===target.key) return;

    if(job.completion_date&&target.key!=='complete'){
      if(typeof notice==='function') notice('This job has a confirmed completion date. Clear that date in the job before moving it out of Work Complete.','error');
      return;
    }

    const sourceIndex=STAGE_DEFS.findIndex(x=>x.key===source.key);
    const targetIndex=STAGE_DEFS.findIndex(x=>x.key===target.key);
    if(targetIndex<sourceIndex){
      const ok=confirm(`Move ${job.job_number||job.customer_name||'this job'} backward from ${source.label} to ${target.label}?`);
      if(!ok) return;
    }

    const oldStage=job.stage;
    job.stage=target.value;
    if(typeof renderAll==='function') renderAll();

    const {error}=await db.from('jobs').update({stage:target.value,updated_at:new Date().toISOString()}).eq('id',job.id);
    if(error){
      job.stage=oldStage;
      if(typeof renderAll==='function') renderAll();
      if(typeof notice==='function') notice(`Could not move job: ${error.message}`,'error');
      return;
    }

    if(typeof notice==='function') notice(`${job.job_number||job.customer_name||'Job'} moved to ${target.label}.`,'success');
  }

  function decorate(){
    addStyles();
    const board=document.getElementById('timelineBoard');
    if(!board) return;
    const cols=[...board.querySelectorAll('.stage-col')];
    cols.forEach((col,i)=>{
      const def=STAGE_DEFS[i];
      if(!def) return;
      col.dataset.stageKey=def.key;
      col.dataset.stageValue=def.value;
      if(col.dataset.dragBound==='1') return;
      col.dataset.dragBound='1';
      col.addEventListener('dragenter',e=>{
        if(!draggingId) return;
        e.preventDefault();
        clearDropTarget();
        col.classList.add('bro-drop-target');
        activeDrop=def;
      });
      col.addEventListener('dragover',e=>{
        if(!draggingId) return;
        e.preventDefault();
        if(e.dataTransfer) e.dataTransfer.dropEffect='move';
      });
      col.addEventListener('drop',async e=>{
        e.preventDefault();
        const id=draggingId||e.dataTransfer?.getData('text/plain');
        clearDropTarget();
        suppressClickUntil=Date.now()+500;
        await moveJob(id,def);
      });
    });

    board.querySelectorAll('.job-card[data-job-id]').forEach(card=>{
      card.draggable=true;
      card.title='Drag to another production stage';
      if(card.dataset.dragBound==='1') return;
      card.dataset.dragBound='1';
      card.addEventListener('dragstart',e=>{
        draggingId=card.dataset.jobId;
        card.classList.add('bro-dragging');
        if(e.dataTransfer){
          e.dataTransfer.effectAllowed='move';
          e.dataTransfer.setData('text/plain',draggingId||'');
        }
      });
      card.addEventListener('dragend',()=>{
        draggingId=null;
        card.classList.remove('bro-dragging');
        clearDropTarget();
        suppressClickUntil=Date.now()+350;
      });
    });
  }

  document.addEventListener('click',e=>{
    if(Date.now()<suppressClickUntil&&e.target.closest('#timelineBoard .job-card')){
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  },true);

  const board=document.getElementById('timelineBoard');
  if(board){
    new MutationObserver(()=>requestAnimationFrame(decorate)).observe(board,{childList:true,subtree:true});
  }
  decorate();
  setTimeout(decorate,250);
  setTimeout(decorate,800);
})();
