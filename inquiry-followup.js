'use strict';
(function(){
  if(window.__broInquiryFollowupLoaded)return;window.__broInquiryFollowupLoaded=true;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  async function install(){
    for(let i=0;i<80;i++){if(typeof openAppointment==='function'&&typeof appointments!=='undefined'&&document.getElementById('appointmentType'))break;await sleep(100);}
    if(typeof openAppointment!=='function')return;
    const original=openAppointment;
    openAppointment=function(a=null){
      original(a);
      if(!a){
        const prior=(appointments||[]).filter(x=>!x.deleted_at);
        if(prior.length){
          const type=document.getElementById('appointmentType');
          if(type)type.value='Follow-up';
          const title=document.getElementById('appointmentTitle');
          if(title)title.textContent='Add Follow-up Appointment';
        }
      }
    };
  }
  install();
})();
