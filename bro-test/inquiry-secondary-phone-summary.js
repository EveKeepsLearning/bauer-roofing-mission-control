'use strict';
(function(){
  if(window.__broInquirySecondaryPhoneSummaryLoaded)return;
  window.__broInquirySecondaryPhoneSummaryLoaded=true;

  function install(){
    if(typeof renderCustomerSummary!=='function')return;
    if(renderCustomerSummary.__broSecondaryPhoneSummary)return;
    const original=renderCustomerSummary;
    const wrapped=function(){
      const result=original();
      try{
        const box=document.getElementById('customerSummary');
        const grid=box?.querySelector('.customer-contact-grid');
        if(!grid||grid.querySelector('[data-bro-secondary-summary]'))return result;
        const number=contactRecord?.phone_secondary||inquiry?.phone_secondary||'';
        if(!number)return result;
        const label=String(contactRecord?.phone_secondary_label||inquiry?.phone_secondary_label||'Secondary').trim()||'Secondary';
        const digits=String(number).replace(/\D/g,'');
        const item=document.createElement('div');
        item.dataset.broSecondarySummary='1';
        item.innerHTML=`<span>${label} phone</span><a href="tel:${digits}">${number}</a>`;
        const emailItem=[...grid.children].find(el=>el.querySelector('span')?.textContent?.trim()==='Email');
        if(emailItem)grid.insertBefore(item,emailItem);else grid.appendChild(item);
      }catch(e){console.warn('Could not show secondary phone in inquiry summary:',e);}
      return result;
    };
    wrapped.__broSecondaryPhoneSummary=true;
    renderCustomerSummary=wrapped;
    renderCustomerSummary();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,500),{once:true});
  else setTimeout(install,500);
})();
