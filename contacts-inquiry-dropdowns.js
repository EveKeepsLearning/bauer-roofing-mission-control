'use strict';
(() => {
  const dialog=document.querySelector('#inquiryDialog .form-grid');if(!dialog)return;
  function replace(id,options,defaultValue=''){
    const old=document.getElementById(id);if(!old||old.tagName==='SELECT')return old;
    const s=document.createElement('select');s.id=id;
    options.forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=v||'Choose…';s.appendChild(o);});
    if(defaultValue)s.value=defaultValue;old.replaceWith(s);return s;
  }
  replace('inquirySource',['','Angi Ads','HomeAdvisor (Angi Leads)','Repeat Business','Direct Mail','Internet','Referral','Website Form','Previous Lead','Mail','Other'],'Repeat Business');
  replace('inquiryAssigned',['Roy','Eve','Jonathan','Other'],'Roy');
  const assigned=document.getElementById('inquiryAssigned')?.closest('div');
  if(assigned&&!document.getElementById('inquiryTakenBy')){
    const box=document.createElement('div');box.innerHTML='<label>Inquiry taken by</label><select id="inquiryTakenBy"><option value="Eve">Eve</option><option value="Roy">Roy</option><option value="Jonathan">Jonathan</option><option value="Other">Other</option></select>';
    assigned.parentNode.insertBefore(box,assigned);
  }
  const source=document.getElementById('inquirySource')?.closest('div');
  if(source&&!document.getElementById('inquirySourceSecondary')){
    const box=document.createElement('div');box.innerHTML='<label>Lead source secondary</label><select id="inquirySourceSecondary"><option value="">None</option><option>Angi Ads</option><option>Angi Leads</option><option>Google Calendar</option><option>Website</option><option>Referral</option><option>Direct Mail</option><option>Other</option></select>';
    source.insertAdjacentElement('afterend',box);
  }
})();
