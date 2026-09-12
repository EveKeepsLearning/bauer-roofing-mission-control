'use strict';
(function(){
 const cfg=window.BAUER_CONFIG||{};
 let names={},workspaceOwner=false;
 const states=['New','Planned','In progress','Done'];
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let user=null,client=null,sessionGeneration=0,initialized=false;
 const panels=[];
 function setupPanel(root,scope){
  root.innerHTML=`${scope==='business'?'<h3>Business Improvements</h3><p class="ideas-private">Private to you. Track business processes you want to improve.</p>':''}<form class="ideas-compose"><label for="${scope}IdeaText">${scope==='bro'?'What should we fix or improve?':'What would you like to improve?'}</label><textarea id="${scope}IdeaText" maxlength="5000" required placeholder="Capture an idea…"></textarea><div class="ideas-tools"><button class="btn primary small" type="submit">Add Idea</button><button class="btn small" type="button" data-cancel hidden>Cancel Edit</button></div></form><div class="ideas-tools"><label>Show<select data-filter><option value="active">Active ideas</option><option value="all">All ideas</option><option value="Done">Completed</option></select></label><button class="btn small" type="button" data-refresh>Refresh</button></div><div class="ideas-status" role="status"></div><div data-list></div><button class="btn small ideas-load-more" data-more type="button" hidden>Load More</button>`;
  const p={root,scope,rows:[],editing:null,request:0,limit:50};panels.push(p);
  const $=q=>root.querySelector(q);
  function message(s){$('.ideas-status').textContent=s;}
  function cancel(){p.editing=null;$('textarea').value='';$('button[type="submit"]').textContent='Add Idea';$('[data-cancel]').hidden=true;}
  function render(){
   $('[data-list]').innerHTML=p.rows.length?p.rows.map(row=>`<article class="idea-row" data-id="${esc(row.id)}" data-status="${esc(row.status)}"><div class="idea-meta">${esc(row.author_id===user?.id?'You':names[row.author_id]||'Teammate')} · ${esc(new Date(row.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}))}<span class="idea-badge">${esc(row.status)}</span></div><div class="idea-text">${esc(row.idea)}</div><div class="idea-actions"><label>Status <select data-state aria-label="Idea status">${states.map(s=>`<option ${s===row.status?'selected':''}>${s}</option>`).join('')}</select></label><button class="btn" type="button" data-edit>Edit</button>${row.author_id===user?.id||workspaceOwner?'<button class="btn" type="button" data-delete style="color:#b42318">Delete</button>':''}</div></article>`).join(''):'<div class="ideas-empty">No ideas here yet.</div>';
  }
  async function load(){
   if(!user)return;const generation=sessionGeneration,request=++p.request;
   message('Loading…');
   try{let q=client.from('improvement_ideas').select('*').eq('scope',scope).order('created_at',{ascending:false}).order('id').limit(p.limit+1);
    if(scope==='business')q=q.eq('author_id',user.id);
    const filter=$('[data-filter]').value;if(filter==='active')q=q.neq('status','Done');else if(filter==='Done')q=q.eq('status','Done');
    const r=await q;if(r.error)throw r.error;if(generation!==sessionGeneration||request!==p.request)return;
    p.rows=(r.data||[]).slice(0,p.limit);$('[data-more]').hidden=(r.data||[]).length<=p.limit;render();message('');
   }catch(e){if(generation===sessionGeneration&&request===p.request)message(e.message||String(e));}
  }
  $('form').onsubmit=async e=>{e.preventDefault();if(!user)return;const generation=sessionGeneration,idea=$('textarea').value.trim();if(!idea)return;const button=$('button[type="submit"]');button.disabled=true;
   try{const r=p.editing?await client.from('improvement_ideas').update({idea,updated_at:new Date().toISOString()}).eq('id',p.editing).select('id'):await client.from('improvement_ideas').insert({scope,idea}).select('id');if(r.error)throw r.error;if(!r.data?.length)throw new Error('The idea was not saved. Refresh and try again.');if(generation!==sessionGeneration)return;cancel();await load();message('Idea saved.');}catch(e){if(generation===sessionGeneration)message(e.message||String(e));}finally{button.disabled=false;}
  };
  $('[data-cancel]').onclick=cancel;$('[data-refresh]').onclick=load;$('[data-filter]').onchange=()=>{p.limit=50;load();};$('[data-more]').onclick=()=>{p.limit+=50;load();};
  root.addEventListener('click',async e=>{const rowEl=e.target.closest('[data-id]');if(!rowEl||!user)return;const row=p.rows.find(x=>x.id===rowEl.dataset.id);if(!row)return;
   if(e.target.closest('[data-edit]')){p.editing=row.id;$('textarea').value=row.idea;$('button[type="submit"]').textContent='Save Changes';$('[data-cancel]').hidden=false;$('textarea').focus();return;}
   if(e.target.closest('[data-delete]')){if(!confirm('Delete this improvement idea?\n\n'+row.idea.slice(0,160)))return;const r=await client.from('improvement_ideas').delete().eq('id',row.id).select('id');if(r.error)return message(r.error.message);if(!r.data?.length)return message('Idea was not deleted. Refresh and try again.');if(p.editing===row.id)cancel();await load();}
  });
  root.addEventListener('change',async e=>{if(!e.target.matches('[data-state]')||!user)return;const select=e.target,id=select.closest('[data-id]').dataset.id;select.disabled=true;const r=await client.from('improvement_ideas').update({status:select.value,updated_at:new Date().toISOString()}).eq('id',id).select('id');select.disabled=false;if(r.error||!r.data?.length){message(r.error?.message||'Status was not saved.');return;}await load();});
  p.load=load;p.clear=()=>{p.request++;p.rows=[];cancel();$('[data-list]').innerHTML='';message('');$('[data-more]').hidden=true;};
 }
 async function start(){
  const shared=document.getElementById('broIdeas');if(shared)setupPanel(shared,'bro');
  const notes=document.getElementById('quickNotesList')?.closest('.quick-notes-card');
  if(notes){const root=document.createElement('section');root.id='businessImprovements';root.className='card section-card ideas-card';root.hidden=true;root.style.display='none';notes.after(root);setupPanel(root,'business');}
  if(!panels.length)return;
  client=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
  async function session(s){
   const next=s?.user||null;if(initialized&&next?.id===user?.id)return;initialized=true;
   const generation=++sessionGeneration;user=next;workspaceOwner=false;names={};
   for(const p of panels){p.clear();p.root.hidden=true;p.root.style.display='none';}
   if(user){
    const meta=await client.rpc('bro_ideas_context');if(generation!==sessionGeneration)return;
    if(meta.error){if(shared){shared.hidden=false;shared.style.display='';shared.querySelector('.ideas-status').textContent=meta.error.message;}return;}
    workspaceOwner=!!meta.data?.is_workspace_owner;names=Object.fromEntries((meta.data?.members||[]).map(m=>[m.user_id,m.display_name]));
   }
   for(const p of panels){const allowed=!!user&&(p.scope==='bro'||workspaceOwner);p.root.hidden=!allowed;p.root.style.display=allowed?'':'none';if(allowed)p.load();}
   if(shared){shared.querySelectorAll('input,textarea,button,select').forEach(el=>el.disabled=!user);if(!user){shared.hidden=false;shared.style.display='';shared.querySelector('.ideas-status').textContent='Sign into BRO on Today, then reload this page.';}}
  }
  client.auth.onAuthStateChange((_event,s)=>{setTimeout(()=>session(s),0);});
  const r=await client.auth.getSession();if(r.error){for(const p of panels)p.root.textContent=r.error.message;return;}session(r.data.session);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
