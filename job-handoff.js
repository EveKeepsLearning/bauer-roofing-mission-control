'use strict';
(function(){
  if(window.__broJobHandoffLoaded)return;window.__broJobHandoffLoaded=true;
  const cfg=window.BAUER_CONFIG||{};
  let client=null,ctx=null;
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/New_York'});
  function db(){if(!client)client=window.supabase?.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);return client;}
  function money(v){const text=String(v??'').trim();if(!text)return null;const n=Number(text.replace(/[$,]/g,''));if(!Number.isFinite(n)||n<0)throw new Error('Enter a valid, non-negative contract or deposit amount.');return n;}
  function inferType(c){const raw=String(c?.job_type||c?.product_interest||c?.work_category||'').toLowerCase();if(raw.includes('metal'))return'Metal';if(raw.includes('repair'))return'Repair';if(raw.includes('window'))return'Windows';if(raw.includes('siding'))return'Siding';if(raw.includes('gutter'))return'Gutters';if(raw.includes('asphalt')||raw.includes('roof'))return'Reroof - Asphalt';return c?.job_type||c?.product_interest||c?.work_category||'';}
  function ensureDialog(){
    if($('broCreateJobDialog'))return;
    const d=document.createElement('dialog');d.id='broCreateJobDialog';d.innerHTML=`<form method="dialog" class="card" style="min-width:min(820px,94vw);max-height:88vh;overflow:auto;padding-bottom:0"><h2 style="margin-top:0">Create Job</h2><div id="broCreateJobNotice" class="notice hidden"></div><div class="grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div class="wide" style="grid-column:1/-1"><label>Customer</label><input id="broJobCustomer" readonly></div><div><label>Inquiry #</label><input id="broJobInquiry" readonly></div><div><label>Job number</label><input id="broJobNumber" placeholder="Enter Bauer job #"></div><div><label>Job type</label><select id="broJobType"><option value="">Choose type…</option><option>Reroof - Asphalt</option><option>Metal</option><option>Repair</option><option>Windows</option><option>Siding</option><option>Gutters</option><option>Miscellaneous</option></select></div><div><label>Contract date</label><input id="broJobContractDate" type="date"></div><div><label>Contract amount</label><input id="broJobAmount" inputmode="decimal"></div><div><label>Deposit amount</label><input id="broJobDeposit" inputmode="decimal"></div><div><label>Deposit method</label><select id="broJobDepositMethod"><option value="">Not entered</option><option>Square</option><option>Check</option><option>Other</option></select></div><div><label>Insurance involved?</label><select id="broJobInsurance"><option value="false">No</option><option value="true">Yes</option></select></div><div><label>Salesperson</label><input id="broJobSalesperson"></div><div class="wide" style="grid-column:1/-1"><label>Property address</label><input id="broJobAddress"></div><div class="wide" style="grid-column:1/-1"><label for="broJobScope">Work description / production notes</label><textarea id="broJobScope" rows="3"></textarea><div class="sub">Carried from the inquiry. Review what production needs to know.</div></div></div><div class="toolbar bro-global-sticky-actions" style="margin-top:16px"><button class="btn primary" id="broSaveJobBtn" type="button">Create Job</button><button class="btn" value="cancel">Cancel</button></div></form>`;document.body.appendChild(d);$('broSaveJobBtn').onclick=save;
  }
  function notice(text,type=''){const n=$('broCreateJobNotice');if(!n)return;n.textContent=text||'';n.className=`notice ${type}`.trim();if(!text)n.classList.add('hidden');else n.classList.remove('hidden');}
  async function open(c={}){
    ensureDialog();ctx=c||{};notice('');
    const dbc=db();if(!dbc)return alert('BRO database is not ready.');
    const leadId=ctx.lead_id||ctx.id||'';
    if(leadId){const {data}=await dbc.from('jobs').select('id,job_number,deleted_at,contract_canceled_at').eq('lead_id',leadId).is('deleted_at',null).limit(1);const existing=(data||[])[0];if(existing&&!existing.contract_canceled_at){if(confirm(`A job${existing.job_number?` #${existing.job_number}`:''} already exists for this inquiry. Open it instead?`))location.href=`jobs.html?job=${encodeURIComponent(existing.id)}`;return;}}
    $('broJobCustomer').value=ctx.customer_name||ctx.homeowner_name||ctx.name||'';
    $('broJobInquiry').value=ctx.lead_number||ctx.inquiry_number||'';
    $('broJobNumber').value='';
    $('broJobType').value=inferType(ctx);
    $('broJobContractDate').value=ctx.contract_date||today();
    $('broJobAmount').value=ctx.contract_amount||ctx.estimate_price||'';
    $('broJobDeposit').value=ctx.deposit_amount||'';
    $('broJobDepositMethod').value=ctx.deposit_method||'';
    $('broJobInsurance').value=String(!!(ctx.insurance_involved||ctx.insurance_related));
    $('broJobSalesperson').value=ctx.salesperson||ctx.assigned_to||'Roy';
    $('broJobAddress').value=ctx.property_address||[ctx.street_address,ctx.city,ctx.state,ctx.zip].filter(Boolean).join(', ');
    $('broJobScope').value=[ctx.product_description,ctx.notes].filter(Boolean).join('\n\n');
    $('broCreateJobDialog').showModal();setTimeout(()=>$('broJobNumber').focus(),0);
  }
  async function save(){
    const dbc=db(),btn=$('broSaveJobBtn');if(!dbc)return;
    const customer=$('broJobCustomer').value.trim(),leadId=ctx?.lead_id||ctx?.id||null,jobNumber=$('broJobNumber').value.trim()||null;
    if(!customer)return notice('Customer is required.','error');if(!leadId)return notice('This job must be linked to an inquiry.','error');
    btn.disabled=true;btn.textContent='Creating…';
    try{
      const contractAmount=money($('broJobAmount').value),depositAmount=money($('broJobDeposit').value);
      if(contractAmount!==null&&depositAmount!==null&&depositAmount>contractAmount)throw new Error('Deposit cannot exceed the contract amount.');
      const {data:existing}=await dbc.from('jobs').select('id,job_number').eq('lead_id',leadId).is('deleted_at',null).limit(1);if((existing||[]).length)throw new Error(`A job already exists for this inquiry${existing[0].job_number?` (#${existing[0].job_number})`:''}.`);
      const row={lead_id:leadId,lead_number:$('broJobInquiry').value.trim()||null,customer_id:ctx.contact_id||ctx.customer_id||null,customer_name:customer,property_address:$('broJobAddress').value.trim()||null,salesperson:$('broJobSalesperson').value.trim()||'Roy',job_number:jobNumber,job_type:$('broJobType').value||null,primary_category:$('broJobType').value||null,production_notes:$('broJobScope').value.trim()||null,stage:'Needs Production Review',contract_date:$('broJobContractDate').value||today(),contract_amount:contractAmount,deposit_amount:depositAmount,deposit_method:$('broJobDepositMethod').value||null,deposit_status:$('broJobDeposit').value.trim()?'Pending':null,insurance_involved:$('broJobInsurance').value==='true',production_next_update_date:null,updated_at:new Date().toISOString()};
      const {data,error}=await dbc.from('jobs').insert(row).select('*').single();if(error)throw error;
      const marked=await dbc.from('leads').update({lead_status:'Sold',sales_stage:'Sold',updated_at:new Date().toISOString()}).eq('id',leadId);
      if(marked.error){notice('Job created, but the inquiry could not be marked Sold. Open the job and review the inquiry status.','error');btn.disabled=true;btn.textContent='Job created';const link=document.createElement('a');link.href=`jobs.html?job=${encodeURIComponent(data.id)}`;link.className='btn';link.textContent='Open created job';$('broCreateJobNotice').append(link);return;}
      notice('Job created.','success');setTimeout(()=>{location.href=`jobs.html?job=${encodeURIComponent(data.id)}`;},500);
    }catch(err){notice(err?.message||String(err),'error');}
    finally{btn.disabled=false;btn.textContent='Create Job';}
  }
  window.BROJobHandoff={open};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensureDialog);else ensureDialog();
})();

