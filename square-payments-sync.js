'use strict';
(function(){
  if(window.__broSquarePaymentsSyncLoaded)return;
  window.__broSquarePaymentsSyncLoaded=true;
  const cfg=window.BAUER_CONFIG||{};
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>Number(v||0).toLocaleString('en-US',{style:'currency',currency:'USD'});
  let client=null,jobs=[];

  function getClient(){
    try{if(typeof db!=='undefined'&&db)return db;}catch(_){ }
    if(!client&&window.supabase&&cfg.SUPABASE_URL&&cfg.SUPABASE_ANON_KEY)client=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
    return client;
  }

  function installStyles(){
    if($('broSquarePaymentsStyles'))return;
    const style=document.createElement('style');style.id='broSquarePaymentsStyles';
    style.textContent=`#broSquarePaymentsCard{border-top:4px solid #236f52}.bro-square-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.bro-square-head h3{margin:0}.bro-square-status{font-size:12px;color:#607083;margin:6px 0 10px}.bro-square-payment{border:1px solid #dfe7e3;border-radius:10px;padding:11px;margin-top:9px;background:#fbfdfc}.bro-square-payment-top{display:flex;justify-content:space-between;gap:10px}.bro-square-amount{font-size:17px;font-weight:800;color:#1f5f48}.bro-square-meta{font-size:11px;color:#687588;margin-top:4px;line-height:1.45}.bro-square-actions{display:grid;grid-template-columns:minmax(0,1fr) 140px auto;gap:7px;margin-top:9px}.bro-square-actions select{min-width:0}.bro-square-linked{border-color:#d6e0e9;background:#f7f9fb}.bro-square-empty{color:#687588;font-size:12px;padding:8px 0}@media(max-width:760px){.bro-square-actions{grid-template-columns:1fr}.bro-square-payment-top{display:block}}`;
    document.head.appendChild(style);
  }

  function ensureCard(){
    if($('broSquarePaymentsCard'))return $('broSquarePaymentsCard');
    const sidebar=document.querySelector('#view-today .today-sidebar');if(!sidebar)return null;
    const card=document.createElement('div');card.id='broSquarePaymentsCard';card.className='card section-card';
    card.innerHTML=`<div class="bro-square-head"><div><h3>Square Payments</h3><div class="meta">Read-only from Square. Assign a payment to a BRO job once.</div></div><button class="btn small primary" id="broSquareSyncBtn" type="button">Sync Square</button></div><div id="broSquareStatus" class="bro-square-status">Checking for recent payments…</div><div id="broSquarePaymentsList"></div>`;
    const quick=sidebar.querySelector('.quick-notes-card');sidebar.insertBefore(card,quick||sidebar.firstChild);
    $('broSquareSyncBtn').onclick=()=>syncSquare(true);
    return card;
  }

  async function loadJobs(){
    const c=getClient();if(!c)return;
    const {data,error}=await c.from('jobs').select('id,job_number,lead_number,customer_name,property_address,stage,amount_due').is('deleted_at',null).is('archived_at',null).order('created_at',{ascending:false}).limit(300);
    if(error)throw error;jobs=data||[];
  }

  function jobOptions(){return '<option value="">Choose job…</option>'+jobs.map(j=>`<option value="${esc(j.id)}">${esc(j.job_number?'Job '+j.job_number:'Job')} — ${esc(j.customer_name||'Unnamed')}${j.amount_due!=null?' — '+esc(money(j.amount_due)):''}</option>`).join('');}

  async function loadPayments(){
    const c=getClient();if(!c)return;
    await loadJobs();
    const {data,error}=await c.from('square_payments').select('square_payment_id,payment_date,amount,currency,status,source_type,receipt_number,receipt_url,card_brand,card_last4,note,reference_id,job_id,job_payment_id,linked_at').eq('status','COMPLETED').order('payment_date',{ascending:false}).order('square_created_at',{ascending:false}).limit(25);
    if(error)throw error;
    const rows=data||[],unmatched=rows.filter(x=>!x.job_payment_id);
    $('broSquareStatus').textContent=unmatched.length?`${unmatched.length} completed Square payment${unmatched.length===1?'':'s'} waiting to be assigned.`:'Square is up to date. No completed payments are waiting to be assigned.';
    $('broSquarePaymentsList').innerHTML=rows.length?rows.map(renderPayment).join(''):'<div class="bro-square-empty">No recent Square payments have been synced yet.</div>';
  }

  function renderPayment(p){
    const linked=!!p.job_payment_id;
    const card=[p.card_brand,p.card_last4?`•••• ${p.card_last4}`:''].filter(Boolean).join(' ');
    const extra=[card,p.receipt_number?`Receipt ${p.receipt_number}`:'',p.reference_id?`Ref ${p.reference_id}`:''].filter(Boolean).join(' • ');
    const receipt=p.receipt_url?`<a href="${esc(p.receipt_url)}" target="_blank" rel="noopener">Square receipt</a>`:'';
    return `<div class="bro-square-payment ${linked?'bro-square-linked':''}" data-square-payment="${esc(p.square_payment_id)}"><div class="bro-square-payment-top"><div><b>${esc(p.payment_date||'Date unavailable')}</b><div class="bro-square-meta">${esc(extra||p.source_type||'Square payment')}${p.note?`<br>${esc(p.note)}`:''}${receipt?`<br>${receipt}`:''}</div></div><div class="bro-square-amount">${esc(money(p.amount))}</div></div>${linked?`<div class="bro-square-meta"><b>Recorded in BRO.</b> This Square payment will not be imported again.</div>`:`<div class="bro-square-actions"><select data-square-job>${jobOptions()}</select><select data-square-type><option>Deposit</option><option>Payment at Start</option><option>Progress Payment</option><option>Final Payment</option><option>Other</option></select><button class="btn small primary" type="button" data-link-square>Record in Job</button></div>`}</div>`;
  }

  async function linkPayment(box){
    const c=getClient(),paymentId=box.dataset.squarePayment,jobId=box.querySelector('[data-square-job]')?.value,type=box.querySelector('[data-square-type]')?.value||'Other';
    if(!jobId){$('broSquareStatus').textContent='Choose the BRO job for this Square payment first.';return;}
    const button=box.querySelector('[data-link-square]');if(button)button.disabled=true;
    try{
      const {error}=await c.rpc('bro_link_square_payment',{p_square_payment_id:paymentId,p_job_id:jobId,p_payment_type:type});if(error)throw error;
      $('broSquareStatus').textContent='Square payment recorded in the selected job.';
      await loadPayments();
    }catch(error){$('broSquareStatus').textContent='Could not record Square payment: '+(error.message||error);}
    finally{if(button)button.disabled=false;}
  }

  async function syncSquare(manual=false){
    const c=getClient();if(!c)return;
    const button=$('broSquareSyncBtn');if(button)button.disabled=true;
    $('broSquareStatus').textContent='Reading recent completed payments from Square…';
    try{
      const {data,error}=await c.functions.invoke('bro-square-sync',{body:{days:7}});if(error)throw error;
      if(data?.error)throw new Error(data.error+(data.details?.length?': '+data.details.join('; '):''));
      localStorage.setItem('broSquareLastSyncAt',String(Date.now()));
      await loadPayments();
      if(manual&&data)$('broSquareStatus').textContent=`Square sync finished. ${Number(data.completed||0)} completed payment${Number(data.completed||0)===1?'':'s'} found in the last 7 days.`;
    }catch(error){$('broSquareStatus').textContent='Square sync failed: '+(error.message||error);}
    finally{if(button)button.disabled=false;}
  }

  function installEvents(){document.addEventListener('click',e=>{const b=e.target.closest('[data-link-square]');if(b){e.preventDefault();const box=b.closest('[data-square-payment]');if(box)linkPayment(box);}});}

  async function start(){
    installStyles();if(!ensureCard())return;installEvents();
    try{await loadPayments();}catch(error){$('broSquareStatus').textContent='Could not load Square payments: '+(error.message||error);}
    const last=Number(localStorage.getItem('broSquareLastSyncAt')||0);if(Date.now()-last>10*60*1000)syncSquare(false);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,350),{once:true});else setTimeout(start,350);
})();
