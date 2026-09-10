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
    const lines=[...card.querySelectorAll('.important')].map(el=>el.textContent||'');
    const line=lines.find(t=>t.trim().startsWith('Appointment:'));
    if(!line)return null;
    const raw=line.replace(/^\s*Appointment:\s*/,'').trim();
    const m=raw.match(/^([A-Z][a-z]{2})\s+(\d{1,2}),\s+(\d{1,2}):(\d{2})\s+(AM|PM)$/i);
    if(!m)return null;
    const months={Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
    const key=m[1][0].toUpperCase()+m[1].slice(1,3).toLowerCase();
    if(months[key]===undefined)return null;
    let hour=Number(m[3]);
    if(m[5].toUpperCase()==='PM'&&hour!==12)hour+=12;
    if(m[5].toUpperCase()==='AM'&&hour===12)hour=0;
    const now=new Date();
    let d=new Date(now.getFullYear(),months[key],Number(m[2]),hour,Number(m[4]));
    if(d.getTime()>now.getTime()+45*86400000)d.setFullYear(d.getFullYear()-1);
    return d;
  }

  function applyCleanup(){
    const cutoff=monthCutoff();
    ['.p-appointment','.p-estneed'].forEach(selector=>{
      const col=board.querySelector(selector);
      if(!col)return;
      col.querySelectorAll('.sales-card').forEach(card=>{
        const d=appointmentDate(card);
        if(d&&d<cutoff)card.remove();
      });
    });
    board.querySelectorAll('.pipe-col').forEach(col=>{
      const small=col.querySelector('.pipe-head small');
      if(!small)return;
      const count=col.querySelectorAll('.sales-card').length;
      small.textContent=`${count} item${count===1?'':'s'}`;
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
