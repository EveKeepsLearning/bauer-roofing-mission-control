'use strict';
(function(){
 const el=id=>document.getElementById(id);
 const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let snapshot=null,target=null,results=[],related=[],searchSequence=0,busy=false;
 const dialog=document.createElement('dialog');
 dialog.id='moveInquiryDialog';
 dialog.innerHTML=`<form method="dialog" class="card" style="width:min(760px,90vw);max-height:85vh;overflow:auto;margin:0">
 <h2>Move to Another Contact</h2><p id="moveInquiryFrom"></p>
 <p>Save any inquiry edits before moving. Appointments, notes, inquiry number, and property address stay with this inquiry. Its customer name, primary phone, and email will use the selected contact.</p>
 <label for="moveContactSearch">Find the correct contact by name, phone, email, or address</label>
 <div class="toolbar"><input id="moveContactSearch" type="search" style="flex:1"><button id="moveSearchBtn" type="button" class="btn">Search</button></div>
 <div id="moveContactResults"></div><div id="moveContactSelected"></div>
 <h3>Linked jobs</h3><p>Check the jobs that also belong to the new contact. Unchecked jobs keep their current customer and remain linked to this inquiry.</p>
 <div id="moveInquiryJobs"></div><p id="moveInquiryMessage" role="status"></p>
 <div class="toolbar"><button id="confirmMoveInquiry" type="button" class="btn primary" disabled>Move Inquiry</button><button id="closeMoveInquiry" class="btn" value="cancel">Cancel</button></div></form>`;
 document.body.appendChild(dialog);
 function message(text){el('moveInquiryMessage').textContent=text;}
 async function open(){
  if(typeof inquiry==='undefined'||!inquiry||!db)return;
  target=null;results=[];related=[];snapshot=null;searchSequence++;
  el('confirmMoveInquiry').disabled=true;el('moveContactSearch').value='';
  el('moveContactResults').innerHTML='';el('moveContactSelected').textContent='';
  el('moveInquiryJobs').textContent='Loading…';message('');
  el('moveInquiryFrom').textContent='Loading inquiry…';dialog.showModal();
  try{
   const [lr,jr]=await Promise.all([db.from('leads').select('*').eq('id',inquiry.id).single(),db.from('jobs').select('id,job_number,customer_name,stage,contract_date').eq('lead_id',inquiry.id).is('deleted_at',null).order('created_at',{ascending:false})]);
   if(lr.error||jr.error)throw lr.error||jr.error;
   snapshot=lr.data;related=jr.data||[];
   el('moveInquiryFrom').textContent='Inquiry '+(snapshot.lead_number||'(no number)')+' — currently '+(snapshot.homeowner_name||'Unnamed customer');
   el('moveInquiryJobs').innerHTML=related.length?related.map(j=>`<label style="display:flex;gap:10px;align-items:center;padding:10px;border-bottom:1px solid #e1e7ee"><input type="checkbox" data-move-job="${safe(j.id)}" style="width:auto"><span><b>${safe(j.job_number||'Job number not assigned')}</b> — ${safe(j.customer_name)}<br>${safe(j.contract_date||'No contract date')} • ${safe(j.stage)}</span></label>`).join(''):'No jobs linked by inquiry ID.';
   el('moveContactSearch').focus();
  }catch(e){message(e.message||String(e));}
 }
 async function search(){
  if(!snapshot||busy)return;
  const q=el('moveContactSearch').value.trim().replace(/[,%()]/g,' ').trim();
  if(q.length<2){message('Enter at least two characters.');return;}
  const seq=++searchSequence;target=null;el('confirmMoveInquiry').disabled=true;
  el('moveContactSelected').textContent='';message('Searching…');
  try{
   let query=db.from('contacts').select('id,name,phone,email,street_address,city,state,zip').or('name.ilike.%'+q+'%,phone.ilike.%'+q+'%,email.ilike.%'+q+'%,street_address.ilike.%'+q+'%').order('name').limit(30);
   if(snapshot.contact_id)query=query.neq('id',snapshot.contact_id);
   const r=await query;if(seq!==searchSequence)return;if(r.error)throw r.error;
   results=r.data||[];
   el('moveContactResults').innerHTML=results.map((c,i)=>`<button type="button" class="btn" data-move-contact="${i}" style="display:block;width:100%;text-align:left;margin:8px 0"><b>${safe(c.name)}</b><br>${safe([c.phone,c.email,c.street_address,c.city,c.state,c.zip].filter(Boolean).join(' • '))}</button>`).join('');
   message(results.length?'Choose the correct contact. Showing up to 30 matches.':'No contacts found. Try another name or address.');
  }catch(e){if(seq===searchSequence)message(e.message||String(e));}
 }
 async function move(){
  if(busy||!snapshot||!target)return;
  const ids=Array.from(dialog.querySelectorAll('[data-move-job]:checked')).map(x=>x.dataset.moveJob);
  if(!confirm('Move inquiry '+(snapshot.lead_number||'')+' from '+(snapshot.homeowner_name||'its current contact')+' to '+target.name+'?\n\n'+ids.length+' selected job(s) will also move.'))return;
  busy=true;el('confirmMoveInquiry').disabled=true;el('closeMoveInquiry').disabled=true;message('Moving…');
  try{
   const r=await db.rpc('bro_move_inquiry_contact',{p_inquiry_id:snapshot.id,p_contact_id:target.id,p_expected_updated_at:snapshot.updated_at,p_job_ids:ids});
   if(r.error)throw r.error;
   location.href='inquiry.html?id='+encodeURIComponent(snapshot.id)+'&contact='+encodeURIComponent(target.id)+'&moved=1';
  }catch(e){message('Nothing was moved: '+(e.message||String(e)));busy=false;el('confirmMoveInquiry').disabled=false;el('closeMoveInquiry').disabled=false;}
 }
 el('moveSearchBtn').onclick=search;
 el('moveContactSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();search();}});
 dialog.addEventListener('click',e=>{
  const b=e.target.closest('[data-move-contact]');if(!b||busy)return;
  target=results[Number(b.dataset.moveContact)];if(!target)return;
  el('moveContactSelected').textContent='Move to: '+target.name+' — '+[target.phone,target.street_address].filter(Boolean).join(' • ');
  el('confirmMoveInquiry').disabled=false;message('Review the linked jobs, then choose Move Inquiry.');
 });
 dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 el('confirmMoveInquiry').onclick=move;
 const button=document.createElement('button');button.type='button';button.className='btn';button.id='moveInquiryContactBtn';button.textContent='Move to Another Contact';button.onclick=open;
 el('backBtn').insertAdjacentElement('afterend',button);
 if(new URLSearchParams(location.search).get('moved')==='1')notice('Inquiry moved to the selected contact.','success');
})();
