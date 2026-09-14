'use strict';
(async function(){
 const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),fmt=v=>Number(v||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}),date=v=>{if(!v)return'';const d=new Date(String(v).slice(0,10)+'T12:00:00');return d.toLocaleDateString('en-US',{month:'numeric',day:'numeric',year:'numeric'});};
 function fail(message){$('error').textContent=message;$('error').hidden=false;}
 function loadMath(version){if(window.BRORfpMath)return Promise.resolve(window.BRORfpMath);return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=`rfp-calculations.js?v=${encodeURIComponent(version||'rfp-cumulative1')}`;s.onload=()=>window.BRORfpMath?resolve(window.BRORfpMath):reject(new Error('RFP calculation engine did not load.'));s.onerror=()=>reject(new Error('Could not load RFP calculation engine.'));document.head.append(s);});}
 function splitAddress(value){const raw=String(value||'').trim();const m=raw.match(/^(.*?),\s*([^,]+),\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);if(m)return{street:m[1],cityLine:`${m[2]}, ${m[3].toUpperCase()} ${m[4]}`};return{street:raw,cityLine:''};}
 function dots(){return'<span class="dots">. . . . . . . . . . . . . . . .</span>';}
 try{
  const params=new URLSearchParams(location.search),id=params.get('id'),autoPrint=params.get('print')==='1';if(!id)throw new Error('No payment request was selected.');
  const cfg=window.BAUER_CONFIG||{},db=supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY),auth=await db.auth.getSession();if(!auth.data.session){location.href='index.html';return;}
  const math=await loadMath(cfg.APP_VERSION);
  const hr=await db.from('subcontractor_payment_requests').select('*').eq('id',id).single();if(hr.error)throw hr.error;const r=hr.data;$('backBtn').href='jobs.html?job='+encodeURIComponent(r.job_id);
  const rr=await db.from('subcontractor_payment_requests').select('*').eq('job_id',r.job_id).eq('subcontractor_id',r.subcontractor_id).order('requisition_number');if(rr.error)throw rr.error;
  const requestIds=(rr.data||[]).map(x=>x.id);let allItems=[];if(requestIds.length){const ir=await db.from('subcontractor_payment_request_items').select('*').in('payment_request_id',requestIds).order('sort_order');if(ir.error)throw ir.error;allItems=ir.data||[];}
  const calc=math.forRequest(id,rr.data||[],allItems);if(!calc)throw new Error('Could not calculate this requisition.');
  const rows=calc.rows,subCity=[r.subcontractor_city_snapshot,r.subcontractor_state_snapshot,r.subcontractor_zip_snapshot].filter(Boolean).join(', '),contact=r.subcontractor_contact_snapshot||'',project=r.job_number_snapshot||r.customer_name_snapshot||'',jobAddress=splitAddress(r.property_address_snapshot),blankRows=Math.max(0,4-rows.length);
  const contractRows=rows.map((x,index)=>`<div class="breakdown-row"><span class="row-label">${index===0?'Original Contract Amount':index===1?'Approved Change Orders':''}</span><span class="row-desc">${esc(x.description)}</span><span class="row-amount">$${fmt(x.contract_amount)}</span></div>`).join('')+Array.from({length:blankRows},(_,i)=>`<div class="breakdown-row"><span class="row-label">${rows.length+i===0?'Original Contract Amount':rows.length+i===1?'Approved Change Orders':''}</span><span class="row-desc">&nbsp;</span><span class="row-amount">&nbsp;</span></div>`).join('');
  const performedRows=rows.map((x,index)=>`<div class="performed-row"><span class="performed-label">${index===0?'Value of work performed to date<br>(per breakdown attached).':''}</span><span>${index===0?dots():''}</span><span class="row-amount">$${fmt(x.work_performed_to_date)}</span></div>`).join('')+Array.from({length:Math.max(0,2-rows.length)},()=>'<div class="performed-row"><span></span><span></span><span class="row-amount">&nbsp;</span></div>').join('');
  $('sheet').innerHTML=`
    <div class="subcontractor-block"><div class="sub-name">${esc(r.subcontractor_name_snapshot)}</div><div>${esc(r.subcontractor_street_snapshot||'')}</div><div>${esc(subCity)}</div></div>
    <div class="form-title">REQUEST FOR PAYMENT</div>
    <div class="top-grid">
      <div class="req-block"><b>Requisition No. ( ${esc(r.requisition_number)} )</b></div>
      <div class="project-block"><div><span class="under-label">DATE -</span><b>${esc(date(r.payment_date))}</b></div><div><span class="under-label">Project -</span><b>${esc(project)}</b></div><div class="project-address"><b>${esc(jobAddress.street)}</b><small>(Address)</small></div><div class="project-city"><b>${esc(jobAddress.cityLine)}</b><small>(City,State, Zip Code)</small></div></div>
      <div class="to-block"><div><span>To:</span><b>Bauer Roofing</b></div><div class="to-address">1430 Congaree Dr</div><div class="to-address">West Columbia, SC&nbsp;&nbsp;29172</div></div>
    </div>
    <div class="mr-bauer"><b>Mr. Bauer:</b><div class="period-line"><span>This request for payment is for work performed on the above<br>project through the period ending:</span><b class="period-date">${esc(date(r.work_date))}</b></div></div>
    <div class="main-grid">
      <div class="calculations">
        <div class="contract-lines">${contractRows}</div>
        <div class="total-row strong"><span>TOTAL REVISED CONTRACT</span>${dots()}<b>$${fmt(calc.contractTotal)}</b></div>
        <div class="performed-lines">${performedRows}</div>
        <div class="total-row strong"><span>WORK PERFORMED to DATE</span>${dots()}<b>$${fmt(calc.totalWorkPerformed)}</b></div>
        <div class="total-row"><span>Less ${fmt(calc.retainagePercent).replace(/\.00$/,'')}% Retainage</span>${dots()}<span>$${fmt(calc.retainage)}</span></div>
        <div class="total-row"><span>Amount Earned to Date</span>${dots()}<span>$${fmt(calc.earnedToDate)}</span></div>
        <div class="total-row"><span>Less Previous Payments</span>${dots()}<span>$${fmt(calc.previousPayments)}</span></div>
        <div class="total-row strong"><span>AMOUNT of THIS REQUISITION</span>${dots()}<b>$${fmt(calc.thisRequisition)}</b></div>
      </div>
      <aside class="no-write"><div>DO NOT WRITE IN THIS SPACE</div>${Array.from({length:15},()=>'<div class="write-line"></div>').join('')}</aside>
    </div>
    <div class="release-title">RELEASE</div>
    <p class="release-copy">The Subontractor certifies that all materials, labor, and services furnished by him through the above period have been fully paid for (except as listed below) and the premises of the above named job cannot be made subject to any valid lien or claim by anyone who furnished material, labor, or services to the Subontractor for use in said job: and the Subcontractor hereby releases Bauer Roofing, from any further liability in connection with all materials, labor, and services furnished by the Subcontractor through the period.</p>
    <div class="release-payment"><b>This Release is given in order to induce payment of&nbsp; -_</b><b class="release-amount">$${fmt(calc.thisRequisition)}</b><b>_- and on receipt of said payment<br>by the Contractor this Release becomes in full force.</b></div>
    <div class="exceptions"><b>EXCEPTIONS ARE AS FOLLOWS:</b><div class="exception-lines"><div></div><div></div><div></div></div></div>
    <div class="signature-block"><div class="signature-company"><b>${esc(r.subcontractor_name_snapshot)}</b><small>Contractor</small></div><div class="sig-row"><span>By:</span><span class="sig-line"></span></div>${contact?`<div class="contact-name">${esc(contact)}</div>`:''}<div class="sig-row"><span>Title:</span><span class="sig-line"></span></div><div class="sig-row"><span>Date:</span><span class="sig-line"></span></div></div>`;
  $('sheet').hidden=false;document.title=`RFP ${r.requisition_number} - ${r.subcontractor_name_snapshot}`;$('printBtn').onclick=()=>window.print();
  if(autoPrint)setTimeout(()=>window.print(),250);
 }catch(e){fail('Request for Payment could not be opened: '+(e.message||String(e)));}
})();
