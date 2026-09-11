'use strict';
(function(){
  function parseDate(v){
    if(!v)return null;
    const d=new Date(v);
    return Number.isNaN(d.getTime())?null:d;
  }
  function isPreLead(l){
    if(!l||String(l.lead_number||'').trim()||String(l.bauer_lead_number||'').trim())return false;
    const src=String(l.import_source||'');
    const ref=String(l.source_reference||l.external_row_key||'');
    const fromMarketSharp=/marketsharp/i.test(src)||/^MarketSharp:/i.test(ref)||l.marketsharp_lead_id;
    if(!fromMarketSharp)return false;
    if(/Legacy Full Merge/i.test(src))return true;
    const d=parseDate(l.lead_date||l.inquiry_at||l.received_at||l.inquiry_date_text||l.created_at);
    return !d||d<new Date('2018-01-01T00:00:00');
  }
  function applyInquiryPage(){
    try{
      if(typeof inquiry==='undefined'||!isPreLead(inquiry))return;
      const input=document.getElementById('leadNumber');
      if(input&&!input.value)input.placeholder='Pre-Lead#';
      const name=(typeof contactRecord!=='undefined'&&contactRecord?.name)||inquiry.homeowner_name||'Unnamed customer';
      const title=document.getElementById('title');
      const subtitle=document.getElementById('subtitle');
      if(title&&!inquiry.lead_number)title.textContent=`Inquiry Pre-Lead# — ${name}`;
      if(subtitle&&!inquiry.lead_number)subtitle.textContent='Legacy inquiry — a Bauer lead number was not expected';
      const kicker=document.querySelector('#customerSummary .customer-kicker');
      if(kicker&&!inquiry.lead_number)kicker.textContent='PRE-LEAD#';
    }catch(e){console.warn('Pre-Lead# display helper:',e);}
  }
  if(typeof fill==='function'){
    const originalFill=fill;
    fill=function(){
      const result=originalFill.apply(this,arguments);
      setTimeout(applyInquiryPage,0);
      return result;
    };
  }
  if(typeof inquiryBody==='function'){
    const originalInquiryBody=inquiryBody;
    inquiryBody=function(l,right='→'){
      const html=originalInquiryBody(l,right);
      if(!isPreLead(l))return html;
      return html.replace('<b>Inquiry #</b>','<b>Inquiry #Pre-Lead#</b>');
    };
  }
  let tries=0;
  const timer=setInterval(()=>{
    applyInquiryPage();
    if(++tries>=20)clearInterval(timer);
  },250);
})();
