/* Read-only directory; opening a result uses the existing inquiry editor. */
(()=>{
'use strict';
const $=id=>document.getElementById(id),cfg=window.BAUER_CONFIG||{},size=50;
let db,offset=0,total=0,sequence=0,timer;
const fields=['query','status','source','from','to','archive','sort'];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function dateLabel(v){if(!v)return '—';const d=new Date(v+'T12:00:00');return Number.isNaN(d.getTime())?'—':d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}
function inquiryHref(row){return 'inquiry.html?id='+encodeURIComponent(row.id)+(row.contact_id?'&contact='+encodeURIComponent(row.contact_id):'');}
function optionList(id,values,label){const selected=$(id).value;$(id).innerHTML='<option value="">'+label+'</option>'+values.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');$(id).value=selected;}
function saveUrl(){const p=new URLSearchParams();for(const id of fields)if($(id).value)p.set(id,$(id).value);if(offset)p.set('offset',offset);history.replaceState(null,'','all-inquiries.html?'+p);}
function render(data){
total=Number(data.total)||0;const rows=data.rows||[];
optionList('status',data.statuses||[],'All statuses');optionList('source',data.sources||[],'All sources');
$('summary').innerHTML=`<strong>${total.toLocaleString()} matching inquiries</strong> <span class="sub">of ${Number(data.all_total||0).toLocaleString()} total</span>`;
$('rows').innerHTML=rows.length?rows.map(row=>{
const status=row.inquiry_status||'Not set',tone=/sold/i.test(status)?'sold':/reject|closed|cancel|historical/i.test(status)?'closed':'';
return `<tr data-href="${esc(inquiryHref(row))}" tabindex="0" aria-label="Open inquiry ${esc(row.lead_number||'without number')} for ${esc(row.customer_name)}"><td><a href="${esc(inquiryHref(row))}">${row.lead_number?'#'+esc(row.lead_number):'No number'}</a></td><td>${esc(dateLabel(row.inquiry_date))}</td><td><b>${esc(row.customer_name)}</b><div class="sub">${esc(row.address||'No property address')}</div></td><td>${esc(row.interest||'—')}</td><td><span class="badge ${tone}">${esc(status)}</span>${row.archived_at?'<div class="archive">Archived</div>':''}</td><td>${esc(row.source||'—')}<div class="sub">${esc(row.assigned_to||'Unassigned')}</div></td></tr>`;
}).join(''):'<tr><td colspan="6" class="empty">No inquiries match these filters. Try a name, address, or inquiry number, or clear the filters.</td></tr>';
$('pageLabel').textContent=`Page ${Math.floor(offset/size)+1} of ${Math.max(1,Math.ceil(total/size))}`;
$('previous').disabled=offset===0;$('next').disabled=offset+size>=total;
}
async function search(reset=false){
 clearTimeout(timer);const request=++sequence;if(reset)offset=0;
 if($('from').value&&$('to').value&&$('from').value>$('to').value){$('notice').textContent='From date must be on or before Through date.';$('busy').textContent='';return;}
 $('notice').textContent='';$('busy').textContent='Searching…';$('previous').disabled=true;$('next').disabled=true;
 saveUrl();
 try{
 const {data,error}=await db.rpc('bro_search_inquiries',{p_query:$('query').value.trim(),p_status:$('status').value,p_source:$('source').value,p_from:$('from').value||null,p_to:$('to').value||null,p_archive:$('archive').value,p_sort:$('sort').value,p_offset:offset,p_limit:size});
 if(request!==sequence)return;if(error)throw error;
 if(offset>0&&offset>=Number(data.total)){offset=Math.max(0,(Math.ceil(Number(data.total)/size)-1)*size);return search();}
 render(data);
 }catch(error){if(request!==sequence)return;$('notice').textContent='Could not load inquiries: '+error.message;$('summary').textContent='Search could not finish.';$('rows').innerHTML='<tr><td colspan="6" class="empty">Please press Search to try again.</td></tr>';}
 finally{if(request===sequence)$('busy').textContent='';}
}
async function start(){
 try{
 db=supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
 const {data,error}=await db.auth.getSession();if(error)throw error;if(!data.session){location.href='index.html';return;}
 const p=new URLSearchParams(location.search);
 for(const id of fields){if(!p.has(id))continue;const value=p.get(id);if(id==='status'||id==='source')$(id).add(new Option(value,value));$(id).value=value;}
 if(!$('archive').value)$('archive').value='all';if(!$('sort').value)$('sort').value='newest';
 offset=Math.floor(Math.max(0,Number(p.get('offset'))||0)/size)*size;
 $('filters').onsubmit=e=>{e.preventDefault();search(true);};
 $('query').oninput=()=>{++sequence;clearTimeout(timer);timer=setTimeout(()=>search(true),300);};
 for(const id of fields.filter(x=>x!=='query'))$(id).onchange=()=>search(true);
 $('clear').onclick=()=>{$('filters').reset();search(true);};
 $('previous').onclick=()=>{offset=Math.max(0,offset-size);search();};$('next').onclick=()=>{offset+=size;search();};
 $('rows').onclick=e=>{const row=e.target.closest('[data-href]');if(!row||e.target.closest('a'))return;if(e.ctrlKey||e.metaKey)window.open(row.dataset.href,'_blank','noopener');else location.href=row.dataset.href;};
 $('rows').onkeydown=e=>{if(!['Enter',' '].includes(e.key)||e.target.closest('a'))return;const row=e.target.closest('[data-href]');if(row){e.preventDefault();location.href=row.dataset.href;}};
 await search();
 }catch(error){$('notice').textContent='Could not start the inquiry directory: '+error.message;$('summary').textContent='Unable to load inquiries.';}
}
start();
})();
