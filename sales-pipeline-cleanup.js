'use strict';
(function(){
  const board=document.getElementById('salesBoard');
  if(!board)return;

  function monthCutoff(){
    const d=new Date();
    d.setHours(0,0,0,0);
    d.setMonth(d.getMonth()-1);
    return d;
  }

  function appointmentDate(card){
    const raw=card.dataset.appointmentAt;
    if(!raw)return null;
    const date=new Date(raw);
    return Number.isNaN(date.getTime())?null:date;
  }

  function hasSentEstimate(card){
    return /Estimate:\s*Sent/i.test(card.textContent||'');
  }

  function applyCleanup(){
    const cutoff=monthCutoff();
    ['.p-appointment','.p-estneed','.p-follow'].forEach(selector=>{
      const col=board.querySelector(selector);
      if(!col)return;
      col.querySelectorAll('.sales-card').forEach(card=>{
        const d=appointmentDate(card);
        if(d&&d<cutoff&&!hasSentEstimate(card))card.remove();
      });
    });
    board.querySelectorAll('.pipe-col').forEach(col=>{
      const small=col.querySelector('.pipe-head small');
      if(!small)return;
      const count=col.querySelectorAll('.sales-card').length;
      const label=`${count} item${count===1?'':'s'}`;if(small.textContent!==label)small.textContent=label;
      const empty=col.querySelector('.empty');
      if(!count&&!empty){
        const e=document.createElement('div');
        e.className='empty';
        e.textContent='No items';
        col.appendChild(e);
      }
    });
  }

  let queued=false;
  const schedule=()=>{
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;applyCleanup();});
  };
  new MutationObserver(schedule).observe(board,{childList:true,subtree:true});
  schedule();
})();
