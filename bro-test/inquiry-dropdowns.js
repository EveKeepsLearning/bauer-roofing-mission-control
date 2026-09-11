'use strict';
(() => {
  const choices={
    takenBy:['','Eve','Roy','Jonathan','Other'],
    assignedTo:['Roy','Eve','Jonathan','Other'],
    source:['','Angi Ads','HomeAdvisor (Angi Leads)','Repeat Business','Direct Mail','Internet','Referral','Website Form','Previous Lead','Mail','Other'],
    sourceSecondary:['','Angi Ads','Angi Leads','Google Calendar','Website','Referral','Direct Mail','Other'],
    productInterest:['','Roofing (Asphalt)','Metal Roofing','Repairs','Windows','Siding','Gutters','Miscellaneous','Warranty','Ventilation','Roofing','Repair','Replacement','Other'],
    workCategory:['','Roofing','Repair','Windows','Siding','Gutters','Replacement','Other']
  };
  function replaceWithSelect(id,options,defaultValue=''){
    const old=document.getElementById(id);if(!old||old.tagName==='SELECT')return;
    const s=document.createElement('select');s.id=id;s.className=old.className||'';
    options.forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=v||'Choose…';s.appendChild(o);});
    if(defaultValue)s.value=defaultValue;
    old.replaceWith(s);
  }
  replaceWithSelect('takenBy',choices.takenBy,'Eve');
  replaceWithSelect('assignedTo',choices.assignedTo,'Roy');
  replaceWithSelect('source',choices.source,'');
  replaceWithSelect('sourceSecondary',choices.sourceSecondary,'');
  replaceWithSelect('productInterest',choices.productInterest,'');
  replaceWithSelect('workCategory',choices.workCategory,'Roofing');
})();
