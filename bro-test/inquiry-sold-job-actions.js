'use strict';
(function(){
  if(window.__broInquirySoldJobLoaded)return;window.__broInquirySoldJobLoaded=true;
  function soldValue(){const v=String(document.getElementById('appointmentResult')?.value||'').trim().toLowerCase();return v==='sold'||v==='demo sold'||v==='contract signed'||v.includes('sold');}
  async function openJob(){
    if(!soldValue()||!window.BROJobHandoff?.open||typeof inquiry==='undefined'||!inquiry)return;
    try{
      const existing=typeof linkedJob!=='undefined'?linkedJob:null;
      if(existing?.id){if(confirm(`A job${existing.job_number?` #${existing.job_number}`:''} already exists for this inquiry. Open it?`))location.href=`jobs.html?job=${encodeURIComponent(existing.id)}`;return;}
      document.getElementById('appointmentDialog')?.close();
      window.BROJobHandoff.open({...inquiry,lead_id:inquiry.id,customer_name:(typeof contactRecord!=='undefined'&&contactRecord?.name)||inquiry.homeowner_name,contact_id:inquiry.contact_id||((typeof contactRecord!=='undefined'&&contactRecord?.id)||null)});
    }catch(err){console.error('Could not open Create Job:',err);}
  }
  function bind(){
    ['saveAppointmentBtn','googleAppointmentBtn'].forEach(id=>{
      const b=document.getElementById(id);if(!b||b.dataset.soldJobBound)return;b.dataset.soldJobBound='1';b.addEventListener('click',()=>{if(soldValue())setTimeout(openJob,id==='googleAppointmentBtn'?1250:500);});
    });
    new MutationObserver(()=>['saveAppointmentBtn','googleAppointmentBtn'].forEach(id=>{const b=document.getElementById(id);if(b&&!b.dataset.soldJobBound){b.dataset.soldJobBound='1';b.addEventListener('click',()=>{if(soldValue())setTimeout(openJob,id==='googleAppointmentBtn'?1250:500);});}})).observe(document.body,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(bind,100));else setTimeout(bind,100);
})();
