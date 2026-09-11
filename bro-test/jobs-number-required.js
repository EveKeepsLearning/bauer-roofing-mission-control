'use strict';
(function(){
  function hasJobNumberCard(el){
    const b=el.querySelector('b');
    return !!(b && b.textContent.trim() && b.textContent.trim().toLowerCase() !== 'job');
  }

  function cleanTimeline(){
    document.querySelectorAll('#timelineBoard .stage-col').forEach(col=>{
      col.querySelectorAll('.job-card').forEach(card=>{
        if(!hasJobNumberCard(card)) card.remove();
      });
      const count=col.querySelectorAll('.job-card').length;
      const small=col.querySelector('.stage-head small');
      if(small) small.textContent=`${count} job${count===1?'':'s'}`;
      const existingEmpty=[...col.querySelectorAll('.job-meta')].find(x=>x.textContent.trim()==='No jobs');
      if(count===0 && !existingEmpty){
        const e=document.createElement('div');e.className='job-meta';e.textContent='No jobs';col.appendChild(e);
      }
    });
  }

  function cleanTable(){
    const body=document.getElementById('jobsTableBody');
    if(!body)return;
    body.querySelectorAll('tr[data-job-id]').forEach(row=>{
      const n=row.querySelector('td:first-child')?.textContent.trim();
      if(!n) row.remove();
    });
  }

  function cleanAttention(){
    const list=document.getElementById('attentionList');
    if(!list)return;
    list.querySelectorAll('.attention-row[data-job-id]').forEach(row=>{
      const n=row.querySelector('div:first-child b')?.textContent.trim();
      if(!n) row.remove();
    });
  }

  function cleanCalendar(){
    document.querySelectorAll('#calendarGrid .cal-event').forEach(ev=>{
      const n=ev.querySelector('b')?.textContent.trim();
      if(!n) ev.remove();
    });
  }

  function clean(){cleanTimeline();cleanTable();cleanAttention();cleanCalendar();}
  let queued=false;
  const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;clean();});};
  ['timelineBoard','jobsTableBody','attentionList','calendarGrid'].forEach(id=>{
    const el=document.getElementById(id);if(el)new MutationObserver(schedule).observe(el,{childList:true,subtree:true});
  });
  schedule();
})();
