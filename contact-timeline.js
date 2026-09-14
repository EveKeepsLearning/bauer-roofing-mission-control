'use strict';
(() => {
 let request=0;
 async function render(contactId,leads,jobs){
  const U=window.BROUX,seq=++request,account=U.account(),root=document.getElementById('contactDetail');if(!root)return;
  root.querySelector('.bro-customer-history')?.remove();
  const section=document.createElement('section');section.className='history-section bro-customer-history';section.innerHTML='<h3>Customer History</h3><p>Inquiries, appointments, proposals, jobs, and recorded communications, newest first.</p><div class="bro-history-list" aria-live="polite">Loading history…</div>';root.append(section);
  const events=[],leadMap=new Map(leads.map(x=>[x.id,x])),jobMap=new Map(jobs.map(x=>[x.id,x]));
  const inquiry=l=>'inquiry.html?id='+encodeURIComponent(l.id)+'&contact='+encodeURIComponent(contactId),job=j=>'jobs.html?job='+encodeURIComponent(j.id);
  const add=(date,title,detail,href)=>events.push({date,title,detail,href});
  for(const l of leads){add(l.inquiry_at||l.lead_date||l.created_at,'Inquiry #'+(l.lead_number||'—'),l.product_description||l.product_interest||l.work_category,inquiry(l));if(l.estimate_sent_at)add(l.estimate_sent_at,'Proposal sent · Inquiry #'+(l.lead_number||'—'),l.estimate_status||'',inquiry(l));}
  for(const j of jobs){add(j.contract_date||j.sale_date||j.created_at,'Job '+(j.job_number||'—'),[j.job_type||j.primary_category,j.stage].filter(Boolean).join(' · '),job(j));if(j.completion_date)add(j.completion_date,'Work completed · Job '+(j.job_number||'—'),'',job(j));if(j.contract_canceled_at)add(j.contract_canceled_at,'Contract canceled · Job '+(j.job_number||'—'),j.contract_cancellation_reason,job(j));}
  try{
   await U.ready;const db=U.client(),leadIds=[...leadMap.keys()],jobIds=[...jobMap.keys()];
   const chunks=a=>Array.from({length:Math.ceil(a.length/75)},(_,i)=>a.slice(i*75,i*75+75));
   for(const ids of chunks(leadIds)){const[a,e]=await Promise.all([U.pages(()=>db.from('appointments').select('id,lead_id,appointment_at,appointment_type,appointment_status,appointment_result,notes').in('lead_id',ids).is('deleted_at',null).order('id')),U.pages(()=>db.from('roy_estimate_updates').select('id,lead_id,outcome,note,submitted_at').in('lead_id',ids).order('id'))]);for(const x of a){const l=leadMap.get(x.lead_id);add(x.appointment_at,'Appointment · '+(x.appointment_type||'Visit'),[x.appointment_result||x.appointment_status,x.notes].filter(Boolean).join(' · '),inquiry(l)+'&appointment='+encodeURIComponent(x.id));}for(const x of e){const l=leadMap.get(x.lead_id);add(x.submitted_at,'Proposal update · Inquiry #'+(l.lead_number||'—'),[x.outcome,x.note].filter(Boolean).join(' · '),inquiry(l));}}
   const communications=new Map();for(const make of [()=>db.from('job_communications').select('*').eq('contact_id',contactId).order('id'),...chunks(jobIds).map(ids=>()=>db.from('job_communications').select('*').in('job_id',ids).order('id'))])for(const x of await U.pages(make))communications.set(x.id,x);
   for(const x of communications.values()){const j=jobMap.get(x.job_id);add(x.occurred_at||x.created_at,'Communication · '+(x.communication_type||'Update'),[x.purpose,x.result,x.notes].filter(Boolean).join(' · '),j?job(j):'contacts.html?contact='+encodeURIComponent(contactId));}
  }catch(e){console.warn('Customer history could not fully load',e);}
  if(seq!==request||account!==U.account()||!section.isConnected)return;
  events.sort((a,b)=>(Date.parse(b.date)||0)-(Date.parse(a.date)||0));let shown=40;
  function draw(){const list=section.querySelector('.bro-history-list');list.replaceChildren();for(const x of events.slice(0,shown)){const a=document.createElement('a');a.className='bro-history-event';a.href=x.href;const time=document.createElement('time');time.textContent=x.date?U.date(x.date,true):'Date not recorded';const title=document.createElement('strong');title.textContent=x.title;const detail=document.createElement('span');detail.textContent=x.detail||'';a.append(time,title,detail);list.append(a);}if(!events.length)list.append('No history recorded yet.');if(events.length>shown){const b=document.createElement('button');b.type='button';b.className='btn';b.textContent='Show older history';b.onclick=()=>{shown+=40;draw();};list.append(b);}}
  draw();
 }
 window.BROContactTimeline={render};
})();
