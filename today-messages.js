'use strict';
(() => {
  let account=null, sequence=0, members=[], rows=[], sending=false;
  const sidebar=document.querySelector('#view-today .today-sidebar');
  if(!sidebar)return;
  const card=document.createElement('section');
  card.className='card section-card';
  card.id='teamMessagesCard';
  card.innerHTML=`<div class="sidebar-card-heading"><h3>Team Messages</h3><button type="button" class="btn small" id="refreshTeamMessages">Refresh</button></div>
    <p class="meta">Messages are visible only to you and the teammate you choose.</p>
    <form id="teamMessageForm"><label for="teamMessageRecipient">To</label><select id="teamMessageRecipient" required><option value="">Choose a teammate</option></select>
    <label for="teamMessageBody">Message</label><textarea id="teamMessageBody" required maxlength="4000" placeholder="Write a message…"></textarea>
    <button class="btn primary small" id="sendTeamMessage" type="submit">Send Message</button></form>
    <p class="meta" id="teamMessageStatus" role="status" aria-live="polite"></p>
    <div id="teamMessageList" style="max-height:420px;overflow:auto"></div>
    <button class="btn small hidden" id="moreTeamMessages" type="button">Older messages</button>`;
  sidebar.prepend(card);
  const el=id=>document.getElementById(id);
  function reset(){
    sequence++;account=null;members=[];rows=[];sending=false;
    el('teamMessageForm').reset();el('teamMessageList').replaceChildren();
    el('teamMessageRecipient').innerHTML='<option value="">Choose a teammate</option>';
    el('teamMessageStatus').textContent='';
    el('sendTeamMessage').disabled=false;
    el('moreTeamMessages').classList.add('hidden');
  }
  window.addEventListener('bro-user-change',reset);
  function render(){
    const target=el('teamMessageList');target.replaceChildren();
    if(!rows.length){target.textContent='No messages yet.';return;}
    for(const row of rows){
      const received=row.recipient_id===account;
      const other=received?row.sender_id:row.recipient_id;
      const item=document.createElement('article');item.className='task';
      const heading=document.createElement('b');
      heading.textContent=`${received?'From':'To'} ${members.find(m=>m.user_id===other)?.display_name||'Teammate'}${received&&!row.read_at?' • New':''}`;
      const date=document.createElement('div');date.className='meta';
      date.textContent=new Date(row.created_at).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'})+(row.read_at?' • Read':'');
      const body=document.createElement('p');body.style.whiteSpace='pre-wrap';body.style.overflowWrap='anywhere';body.textContent=row.body;
      item.append(heading,date,body);
      if(received){
        const reply=document.createElement('button');reply.type='button';reply.className='btn small';reply.textContent='Reply';
        reply.onclick=()=>{el('teamMessageRecipient').value=row.sender_id;el('teamMessageBody').focus();};item.append(reply);
        if(!row.read_at){
          const read=document.createElement('button');read.type='button';read.className='btn small';read.textContent='Mark Read';
          read.onclick=async()=>{
            const uid=account;read.disabled=true;
            const result=await db.from('team_messages').update({read_at:new Date().toISOString()}).eq('id',row.id).eq('recipient_id',uid).select('id');
            if(user?.id!==uid)return;
            if(result.error||!result.data?.length){el('teamMessageStatus').textContent=result.error?.message||'Could not mark message read.';read.disabled=false;return;}
            await refresh();
          };item.append(read);
        }
      }
      target.append(item);
    }
  }
  async function refresh(older=false){
    if(typeof user==='undefined'||!user?.id||!db)return;
    if(account!==user.id){reset();account=user.id;}
    const uid=account, request=++sequence;
    try{
      const offset=older?rows.length:0;
      const [people,result]=await Promise.all([
        db.rpc('bro_message_recipients'),
        db.from('team_messages').select('*').or(`sender_id.eq.${uid},recipient_id.eq.${uid}`).order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+49)
      ]);
      if(user?.id!==uid||request!==sequence)return;
      if(people.error)throw people.error;if(result.error)throw result.error;
      members=people.data||[];
      const chosen=el('teamMessageRecipient').value;
      el('teamMessageRecipient').innerHTML='<option value="">Choose a teammate</option>';
      for(const person of members.filter(m=>m.user_id!==uid)){
        const option=document.createElement('option');option.value=person.user_id;option.textContent=person.display_name;el('teamMessageRecipient').append(option);
      }
      el('teamMessageRecipient').value=chosen;
      rows=older?[...rows,...result.data]:result.data;
      el('moreTeamMessages').classList.toggle('hidden',result.data.length<50);
      if(!members.some(m=>m.user_id!==uid))el('teamMessageStatus').textContent='Teammates appear here once their accounts are ready.';
      render();
    }catch(error){if(user?.id===uid&&request===sequence)el('teamMessageStatus').textContent='Could not load messages: '+error.message;}
  }
  el('teamMessageForm').onsubmit=async event=>{
    event.preventDefault();if(sending||!user?.id)return;
    const uid=user.id,recipient=el('teamMessageRecipient').value,body=el('teamMessageBody').value.trim();
    if(!body||!members.some(m=>m.user_id===recipient&&m.user_id!==uid))return;
    sending=true;el('sendTeamMessage').disabled=true;
    try{
      const result=await db.from('team_messages').insert({recipient_id:recipient,body});
      if(user?.id!==uid)return;
      if(result.error)throw result.error;
      el('teamMessageBody').value='';el('teamMessageStatus').textContent='Message sent.';await refresh();
    }catch(error){if(user?.id===uid)el('teamMessageStatus').textContent='Could not send: '+error.message;}
    finally{if(user?.id===uid){sending=false;el('sendTeamMessage').disabled=false;}}
  };
  el('refreshTeamMessages').onclick=()=>refresh();
  el('moreTeamMessages').onclick=()=>refresh(true);
  setInterval(()=>{if(!document.hidden&&!el('view-today').classList.contains('hidden')&&!sending&&rows.length<=50)refresh();},30000);
  // Auth is initialized asynchronously; observe account changes without saving drafts in this browser.
  setInterval(()=>{if(typeof user!=='undefined'&&user?.id!==account){if(user?.id)refresh();else reset();}},1000);
})();
