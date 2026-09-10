'use strict';
(function(){
  const cfg=window.BAUER_CONFIG||{};
  const $=id=>document.getElementById(id);
  const STAGES=[
    ['Appointment','p-appointment'],
    ['Estimate Needed','p-estneed'],
    ['Estimate Sent','p-estsent'],
    ['Follow Up','p-follow'],
    ['Sold','p-sold'],
    ['Rejected','p-rejected']
  ];
  const ORDER=Object.fromEntries(STAGES.map((x,i)=>[x[0],i]));
  let db=null,leads=[],appts=[],jobs=[],dragId=null;

  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function notice(text,type=''){
    const n=$('salesNotice'); if(!n)return;
    n.textContent=text||'';
    n.className=`notice ${type}`.trim();
    if(!text)n.classList.add('hidden');
  }
  function fmtDate(v){
    if(!v)return'';
    const d=new Date(v);
    return Number.isNaN(d.getTime())?'':d.toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  }
  function latestAppt(id){return appts.find(a=>a.lead_id===id)||null;}
  function activeJob(id){return jobs.find(j=>j.lead_id===id&&!j.deleted_at&&!j.contract_canceled_at)||null;}
  function stageOf(l){
    if(activeJob(l.id))return'Sold';
    const saved=String(l.sales_stage||'').trim();
    if(['Estimate Needed','Estimate Sent','Follow Up','Sold','Rejected'].includes(saved))return saved;
    const a=latestAppt(l.id);
    if(!a)return null;
    const t=new Date(a.appointment_at||0).getTime();
    return Number.isFinite(t)&&t<Date.now()?'Estimate Needed':'Appointment';
  }
  function visibleRows(){
    const q=String($('salesSearch')?.value||'').trim().toLowerCase();
    const showClosed=!!$('showClosed')?.checked;
    return leads.filter(l=>{
      const stage=stageOf(l);
      if(!stage)return false;
      if(!showClosed&&['Sold','Rejected'].includes(stage))return false;
      if(q&&!([l.lead_number,l.homeowner_name,l.street_address,l.city,l.phone,l.email,l.product_interest,l.work_category,l.source].join(' ').toLowerCase().includes(q)))return false;
      return true;
    });
  }
  function card(l){
    const a=latestAppt(l.id),j=activeJob(l.id);
    const addr=[l.street_address,l.city,l.state,l.zip].filter(Boolean).join(', ');
    return `<div class="sales-card" draggable="true" data-lead-id="${esc(l.id)}">
      <b>${l.lead_number?`#${esc(l.lead_number)} `:''}${esc(l.homeowner_name||'Unnamed')}</b>
      <div class="meta">${esc(l.product_interest||l.work_category||'')}${l.source?` • ${esc(l.source)}`:''}</div>
      ${addr?`<div class="meta">${esc(addr)}</div>`:''}
      ${a?.appointment_at?`<div class="important">Appointment: ${esc(fmtDate(a.appointment_at))}</div>`:''}
      ${a?.appointment_result?`<div class="meta">Result: ${esc(a.appointment_result)}</div>`:''}
      ${l.estimate_status?`<div class="meta">Estimate: ${esc(l.estimate_status)}</div>`:''}
      ${l.next_follow_up_at?`<div class="important">Follow up: ${esc(fmtDate(l.next_follow_up_at))}</div>`:''}
      ${j?`<div class="important">Job ${esc(j.job_number||'created')}</div>`:''}
      <div class="card-actions">
        ${l.phone?`<a href="tel:${esc(l.phone)}">Call</a><a href="sms:${esc(l.phone)}">Text</a>`:''}
        ${l.email?`<a href="mailto:${esc(l.email)}">Email</a>`:''}
        <button type="button" data-open-lead="${esc(l.id)}">Open</button>
      </div>
    </div>`;
  }
  function syncTopScroll(){
    const top=$('salesTopScroll'),inner=$('salesTopScrollInner'),board=$('salesBoard');
    if(!top||!inner||!board)return;
    inner.style.width=Math.max(board.scrollWidth,board.clientWidth+1)+'px';
  }
  function render(){
    const board=$('salesBoard'); if(!board)return;
    const rows=visibleRows();
    board.innerHTML=STAGES.map(([stage,cls])=>{
      const group=rows.filter(l=>stageOf(l)===stage);
      return `<section class="pipe-col ${cls}" data-stage="${esc(stage)}"><div class="pipe-head">${esc(stage)}<small>${group.length} item${group.length===1?'':'s'}</small></div>${group.map(card).join('')||'<div class="empty">No items</div>'}</section>`;
    }).join('');
    wireDrag();
    requestAnimationFrame(syncTopScroll);
  }
  async function moveStage(id,newStage){
    const l=leads.find(x=>x.id===id); if(!l)return;
    const old=stageOf(l); if(old===newStage)return;
    if((ORDER[newStage]??0)<(ORDER[old]??0)&&!confirm(`Move ${l.homeowner_name||'this inquiry'} backward from ${old} to ${newStage}?`)){render();return;}
    const patch={sales_stage:newStage,updated_at:new Date().toISOString()};
    if(newStage==='Appointment')patch.lead_status='Appointment Scheduled';
    if(newStage==='Estimate Needed'){patch.lead_status='Estimate Needed';patch.estimate_status='Needed';}
    if(newStage==='Estimate Sent'){patch.lead_status='Estimate Sent';patch.estimate_status='Sent';if(!l.estimate_sent_at)patch.estimate_sent_at=new Date().toISOString();}
    if(newStage==='Follow Up')patch.lead_status='Follow Up';
    if(newStage==='Sold')patch.lead_status='Sold';
    if(newStage==='Rejected')patch.lead_status='Rejected';
    const {error}=await db.from('leads').update(patch).eq('id',id);
    if(error){notice(`Could not move card: ${error.message}`,'error');return;}
    Object.assign(l,patch); render(); notice(`${l.homeowner_name||'Inquiry'} moved to ${newStage}.`,'success');
  }
  function wireDrag(){
    document.querySelectorAll('.sales-card').forEach(c=>{
      c.addEventListener('dragstart',e=>{dragId=c.dataset.leadId;c.classList.add('dragging');e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',dragId);});
      c.addEventListener('dragend',()=>{dragId=null;c.classList.remove('dragging');document.querySelectorAll('.pipe-col').forEach(x=>x.classList.remove('drop-target'));});
    });
    document.querySelectorAll('.pipe-col').forEach(col=>{
      col.addEventListener('dragover',e=>{e.preventDefault();col.classList.add('drop-target');});
      col.addEventListener('dragleave',()=>col.classList.remove('drop-target'));
      col.addEventListener('drop',e=>{e.preventDefault();col.classList.remove('drop-target');const id=dragId||e.dataTransfer.getData('text/plain');if(id)moveStage(id,col.dataset.stage);});
    });
  }
  async function loadData(){
    notice('Loading sales pipeline…');
    try{
      const cutoff=new Date(Date.now()-365*24*60*60*1000).toISOString();
      const ar=await db.from('appointments').select('id,lead_id,appointment_at,appointment_status,appointment_result,appointment_result_note,deleted_at').is('deleted_at',null).gte('appointment_at',cutoff).order('appointment_at',{ascending:false}).limit(2500);
      if(ar.error)throw ar.error;
      const latest=new Map();
      for(const a of ar.data||[]){
        const s=String(a.appointment_status||'').toLowerCase();
        if(!a.lead_id||['cancelled','canceled','rescheduled'].includes(s))continue;
        if(!latest.has(a.lead_id))latest.set(a.lead_id,a);
      }
      appts=[...latest.values()];
      const ids=[...latest.keys()];
      if(!ids.length){leads=[];jobs=[];render();notice('No appointments found for the past year.');return;}
      const lr=await db.from('leads').select('id,lead_number,homeowner_name,street_address,city,state,zip,phone,email,source,product_interest,work_category,sales_stage,lead_status,estimate_status,estimate_sent_at,next_follow_up_at,deleted_at,archived_at').in('id',ids).is('deleted_at',null);
      if(lr.error)throw lr.error;
      const jr=await db.from('jobs').select('id,lead_id,job_number,stage,deleted_at,contract_canceled_at').in('lead_id',ids).is('deleted_at',null);
      if(jr.error)throw jr.error;
      leads=(lr.data||[]).filter(l=>!l.archived_at);
      jobs=jr.data||[];
      render(); notice('');
    }catch(err){
      console.error('Sales Pipeline load failed',err);
      render();
      notice(`Sales Pipeline could not load: ${err?.message||String(err)}`,'error');
    }
  }
  async function start(){
    render();
    try{
      if(!window.supabase)throw new Error('Supabase library did not load.');
      if(!cfg.SUPABASE_URL||!cfg.SUPABASE_ANON_KEY)throw new Error('Database configuration is missing.');
      db=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
      const auth=await db.auth.getSession();
      if(auth.error)throw auth.error;
      if(!auth.data.session){location.href='index.html';return;}
      await loadData();
    }catch(err){console.error(err);render();notice(`Sales Pipeline could not start: ${err?.message||String(err)}`,'error');}
  }
  function bind(){
    $('salesSearch')?.addEventListener('input',render);
    $('showClosed')?.addEventListener('change',render);
    $('refreshSales')?.addEventListener('click',loadData);
    document.addEventListener('click',e=>{const b=e.target.closest('[data-open-lead]');if(b)location.href=`inquiry.html?id=${encodeURIComponent(b.dataset.openLead)}`;});
    const top=$('salesTopScroll'),board=$('salesBoard');
    if(top&&board){let syncing=false;top.addEventListener('scroll',()=>{if(syncing)return;syncing=true;board.scrollLeft=top.scrollLeft;syncing=false;});board.addEventListener('scroll',()=>{if(syncing)return;syncing=true;top.scrollLeft=board.scrollLeft;syncing=false;});}
    window.addEventListener('resize',syncTopScroll);
    start();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();
