'use strict';
(function(){
  if(window.__broGuidedNextStepLoaded)return;
  window.__broGuidedNextStepLoaded=true;
  const $=id=>document.getElementById(id);

  function installStyles(){if($('broGuidedNextStepStyles'))return;const s=document.createElement('style');s.id='broGuidedNextStepStyles';s.textContent=`
    .bro-guide{background:#fff;border:1px solid #d8e2ee;border-left:5px solid #2f78c9;border-radius:12px;padding:14px 16px;margin:14px 0;box-shadow:0 2px 8px rgba(31,48,72,.05)}
    .bro-guide-title{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#5c6f84;margin-bottom:8px}.bro-guide-steps{display:flex;gap:7px;flex-wrap:wrap;align-items:center}.bro-guide-step{padding:5px 9px;border-radius:999px;background:#eef2f6;color:#58697e;font-size:12px;font-weight:700}.bro-guide-step.done{background:#e5f6ea;color:#21613a}.bro-guide-step.current{background:#e7f1ff;color:#145fc2;outline:2px solid #b9d5f5}.bro-guide-next{margin-top:11px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}.bro-guide-next b{color:#26384d}.bro-guide-next .btn{font-weight:750}.bro-guide-help{font-size:12px;color:#687588}
  `;document.head.appendChild(s)}
  function makeGuide(id,steps,current,nextLabel,nextAction,help=''){
    let box=$(id);if(!box){box=document.createElement('section');box.id=id;box.className='bro-guide'}
    const signature=JSON.stringify({steps,current,nextLabel,help});
    if(box.dataset.signature!==signature){
      box.dataset.signature=signature;
      box.innerHTML=`<div class="bro-guide-title">Where you are in the Bauer workflow</div><div class="bro-guide-steps">${steps.map((x,i)=>`<span class="bro-guide-step ${i<current?'done':i===current?'current':''}">${x}</span>`).join('')}</div><div class="bro-guide-next"><b>Next step:</b><button type="button" class="btn primary" data-bro-guide-action>${nextLabel}</button>${help?`<span class="bro-guide-help">${help}</span>`:''}</div>`;
    }
    const actionButton=box.querySelector('[data-bro-guide-action]');if(actionButton)actionButton.onclick=nextAction;return box;
  }
  function visible(el){return !!el&&getComputedStyle(el).display!=='none'}
  function inquiryGuide(){
    if(!location.pathname.endsWith('/inquiry.html')&&!location.pathname.endsWith('inquiry.html'))return;
    const summary=$('customerSummary');if(!summary)return;
    const hasAppt=!!document.querySelector('#appointmentList .appt');
    const rec=typeof inquiry!=='undefined'?inquiry:null;
    const stage=String(rec?.sales_stage||rec?.lead_status||'').toLowerCase();
    const estimateSent=/estimate sent|follow up|sold/.test(stage)||String(rec?.estimate_status||'').toLowerCase()==='sent';
    const jobButton=$('jobBtn');const hasJob=visible(jobButton)||((typeof linkedJob!=='undefined')&&linkedJob?.id);
    let current=0,label='Schedule Appointment',action=()=>$('addAppointmentBtn')?.click(),help='The appointment stays tied to this Inquiry.';
    if(hasJob){current=3;label='Open Job';action=()=>jobButton?.click();help='Continue deposit, materials if needed, and scheduling from the Job.';}
    else if(estimateSent){current=2;label='Contract Signed — Create Job';action=()=>{if(window.BROJobHandoff?.open&&rec)window.BROJobHandoff.open({...rec,lead_id:rec.id,customer_name:rec.homeowner_name,contact_id:rec.contact_id});else location.href='sales.html';};help='Use this when the customer has signed the contract.';}
    else if(hasAppt){current=1;label='Go to Sales Pipeline / Estimate';action=()=>location.href='sales.html';help='Record the appointment result, estimate, and follow-up there.';}
    const guide=makeGuide('broInquiryGuide',['Inquiry','Appointment','Estimate','Contract / Job','Deposit','Schedule'],current,label,action,help);
    if(!guide.isConnected)summary.insertAdjacentElement('beforebegin',guide);
  }
  function focusField(id){const el=$(id);if(!el)return;el.scrollIntoView({behavior:'smooth',block:'center'});el.focus();el.style.outline='3px solid #9fc8f5';setTimeout(()=>el.style.outline='',1800)}
  function jobGuide(){
    if(!location.pathname.endsWith('/jobs.html')&&!location.pathname.endsWith('jobs.html'))return;
    const dialog=$('jobDialog');if(!dialog?.open)return;
    const title=$('jobDialogTitle');if(!title)return;
    const stage=String($('editStage')?.value||'Awarded');
    const isRepair=/repair/i.test(String($('editJobType')?.value||''));
    const steps=isRepair?['Job','Deposit','Schedule','Production','Complete']:['Job','Deposit','Materials','Schedule','Production','Complete'];
    let current=0,label='Record Deposit',action=()=>$('addPaymentBtn')?.click(),help='Record money actually received from the customer.';
    if(/deposit/i.test(stage)){
      if(isRepair){current=1;label='Schedule Repair';action=()=>focusField('editExpectedStart');help='Enter the Expected Start date. BRO will move the repair to Scheduled. Order materials only when this repair actually needs them.';}
      else{current=1;label='Record Material Order';action=()=>focusField('editMaterialOrdered');help='Enter the material order date, then save the Job.';}
    }
    else if(/material ordered|ready to schedule/i.test(stage)){
      current=isRepair?2:(/ready to schedule/i.test(stage)?3:2);label=isRepair?'Schedule Repair':'Schedule Work';action=()=>focusField('editExpectedStart');help='Enter the Expected Start date. BRO will move the job to Scheduled.';
    }
    else if(/scheduled/i.test(stage)){
      current=isRepair?2:3;
      if(isRepair){label='Confirm Start / Begin Repair';action=()=>focusField('editStart');help='Use Confirmed Start when the repair actually begins. No material-delivery step is required unless this repair needs one.';}
      else{label='Confirm Material Delivery';action=()=>focusField('editMaterialDelivery');help='Keep the crew and delivery dates together on this Job.';}
    }
    else if(/material delivered|in production/i.test(stage)){current=isRepair?3:4;label=/in production/i.test(stage)?'Record Completion':'Start Production';action=()=>{if(/in production/i.test(stage))focusField('editCompleted');else{$('editStage').value='In Production';$('editStage').dispatchEvent(new Event('change',{bubbles:true}));focusField('editStage')}};help='BRO will keep the production timeline with the Job.';}
    else if(/work complete|final payment|closeout/i.test(stage)){current=isRepair?4:5;label='Review Final Payment / Closeout';action=()=>focusField('editStage');help='Finish the job record when payment and closeout are complete.';}
    const guide=makeGuide('broJobGuide',steps,current,label,action,help);
    if(!guide.isConnected)title.insertAdjacentElement('afterend',guide);
  }
  function refresh(){installStyles();inquiryGuide();jobGuide()}
  let queued=false;function queueRefresh(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;refresh()})}
  function start(){refresh();setTimeout(refresh,500);new MutationObserver(queueRefresh).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open','style']});document.addEventListener('change',e=>{if(['editStage','editJobType'].includes(e.target?.id))queueRefresh()});window.addEventListener('bro:payments-changed',queueRefresh);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
