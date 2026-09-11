'use strict';
const cfg=window.BAUER_CONFIG||{};
const $=id=>document.getElementById(id);
let db=null;
let allJobs=[];
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function notice(t,type=''){const n=$('notice');n.textContent=t||'';n.className=`notice ${type}`.trim();if(!t)n.classList.add('hidden');}
function stateOf(j){
  const stage=String(j.stage||'').trim().toLowerCase();
  if(j.contract_canceled_at||stage.includes('cancel'))return'canceled';
  if(j.archived_at)return'archived';
  if(j.closed_at||j.completion_date||['closed','final / closed','fully paid','work complete','final payment / closeout'].includes(stage))return'closed';
  return'open';
}
function dateLabel(v){if(!v)return'—';const d=new Date(String(v).slice(0,10)+'T12:00:00');return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString();}
function searchText(j){return [j.customer_name,j.job_number,j.lead_number,j.property_address,j.job_type,j.primary_category,j.primary_job_type,j.stage,j.salesperson,j.installer,j.production_notes,j.production_blocker].join(' ').toLowerCase();}
function render(){
  const q=$('allJobSearch').value.trim().toLowerCase();
  const status=$('allJobStatus').value;
  const sort=$('allJobSort').value;
  const rows=allJobs.filter(j=>(status==='all'||stateOf(j)===status)&&(!q||searchText(j).includes(q))).slice().sort((a,b)=>{
    if(sort==='job')return String(a.job_number||'').localeCompare(String(b.job_number||''),undefined,{numeric:true});
    if(sort==='customer')return String(a.customer_name||'').localeCompare(String(b.customer_name||''));
    if(sort==='contract')return String(b.contract_date||'').localeCompare(String(a.contract_date||''));
    if(sort==='stage')return String(a.stage||'').localeCompare(String(b.stage||''));
    return String(b.updated_at||b.created_at||'').localeCompare(String(a.updated_at||a.created_at||''));
  });
  const counts={open:0,closed:0,canceled:0,archived:0};allJobs.forEach(j=>counts[stateOf(j)]++);
  $('allJobSummary').innerHTML=`<span class="summary-pill"><b>${rows.length}</b> shown</span><span class="summary-pill"><b>${allJobs.length}</b> total</span><span class="summary-pill"><b>${counts.open}</b> open</span><span class="summary-pill"><b>${counts.closed}</b> completed / closed</span><span class="summary-pill"><b>${counts.canceled}</b> canceled</span><span class="summary-pill"><b>${counts.archived}</b> archived</span>`;
  $('allJobsBody').innerHTML=rows.length?rows.map(j=>{const s=stateOf(j);return `<tr><td><b>${esc(j.job_number||'—')}</b></td><td>${esc(j.customer_name||'Unnamed customer')}</td><td>${esc(j.lead_number||'—')}</td><td>${esc(j.property_address||'—')}</td><td>${esc(j.job_type||j.primary_category||j.primary_job_type||'—')}</td><td><span class="status-badge ${s}">${esc(j.stage||s)}</span></td><td>${esc(dateLabel(j.contract_date||j.sale_date))}</td><td><a class="btn small" href="jobs.html?job=${encodeURIComponent(j.id)}">Open Job</a></td></tr>`;}).join(''):'<tr><td colspan="8"><div class="empty">No jobs match this search.</div></td></tr>';
}
async function start(){
  db=supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
  const {data:auth,error:authError}=await db.auth.getSession();
  if(authError)return notice(authError.message,'error');
  if(!auth.session){location.href='index.html';return;}
  const {data,error}=await db.from('jobs').select('*').is('deleted_at',null).order('updated_at',{ascending:false}).limit(5000);
  if(error)return notice(error.message,'error');
  allJobs=data||[];
  render();
  $('allJobSearch').focus();
}
$('allJobSearch').oninput=render;
$('allJobStatus').onchange=render;
$('allJobSort').onchange=render;
start();
