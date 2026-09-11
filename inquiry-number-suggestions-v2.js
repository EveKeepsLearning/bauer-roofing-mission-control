'use strict';
(function(){
  if(window.__broInquiryNumberSuggestionsLoaded)return;
  window.__broInquiryNumberSuggestionsLoaded=true;
  const cfg=window.BAUER_CONFIG||{};
  let db=null;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function ensureStyles(){if(document.getElementById('broInquiryNumberSuggestionStyles'))return;const s=document.createElement('style');s.id='broInquiryNumberSuggestionStyles';s.textContent='.bro-number-suggestion{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:5px;font-size:12px;color:#5d6b7d}.bro-number-suggestion b{color:#26394f}.bro-number-suggestion button{font-size:11px;padding:3px 7px}.bro-number-suggestion.loading{opacity:.7}';document.head.appendChild(s);}
  async function nextAvailableNumber(){
    db=db||window.supabase?.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);if(!db)throw new Error('Database is not available.');
    const [leadRes,settingRes]=await Promise.all([
      db.from('leads').select('lead_number').is('deleted_at',null).not('lead_number','is',null).limit(10000),
      db.from('settings').select('value').eq('setting','Lead Sheet Highest Number').limit(1)
    ]);
    if(leadRes.error)throw leadRes.error;
    const used=new Set();let max=0;
    for(const r of leadRes.data||[]){const s=String(r.lead_number||'').trim();if(!/^\d+$/.test(s))continue;const n=Number(s);used.add(n);if(n>max)max=n;}
    if(!settingRes.error&&settingRes.data?.length){const floor=Number(String(settingRes.data[0].value||'').trim());if(Number.isFinite(floor)&&floor>max)max=floor;}
    let candidate=max+1;while(used.has(candidate))candidate++;return String(candidate);
  }
  async function refreshSuggestion(input,box){if(!input||!box)return;box.classList.add('loading');box.innerHTML='Checking next inquiry number…';try{const n=await nextAvailableNumber();box.dataset.suggested=n;box.innerHTML=`Suggested next inquiry #: <b>${esc(n)}</b> <button type="button" class="btn small">Use ${esc(n)}</button>`;box.querySelector('button').onclick=async()=>{const fresh=await nextAvailableNumber();input.value=fresh;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));box.dataset.suggested=fresh;box.innerHTML=`Using inquiry #<b>${esc(fresh)}</b> <button type="button" class="btn small">Recheck</button>`;box.querySelector('button').onclick=()=>refreshSuggestion(input,box);};}catch(e){box.textContent=`Could not suggest a number: ${e.message||e}`;}finally{box.classList.remove('loading');}}
  function decorate(input){if(!input||input.dataset.broNumberSuggestionReady)return;input.dataset.broNumberSuggestionReady='1';const box=document.createElement('div');box.className='bro-number-suggestion';input.insertAdjacentElement('afterend',box);if(!String(input.value||'').trim())refreshSuggestion(input,box);}
  function scan(){['inquiryLeadNumber','leadNumber'].forEach(id=>decorate(document.getElementById(id)));document.querySelectorAll('input[data-number-input],input[data-bro-suggest-number="1"]').forEach(decorate);}
  window.BRONextInquiryNumber=nextAvailableNumber;
  window.BRORefreshInquiryNumberSuggestion=async input=>{if(!input)return;let box=input.nextElementSibling;if(!box||!box.classList?.contains('bro-number-suggestion')){input.dataset.broNumberSuggestionReady='';decorate(input);box=input.nextElementSibling;}await refreshSuggestion(input,box);};
  function install(){ensureStyles();scan();new MutationObserver(scan).observe(document.body,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
