'use strict';
(() => {
  let account=null,sequence=0,members=[],rows=[],sending=false,offset=0,replyDraft=null;
  const sidebar=document.querySelector('#view-today .today-sidebar');if(!sidebar)return;
  const card=document.createElement('section');card.className='card section-card';card.id='teamMessagesCard';
  card.innerHTML=`<div class="sidebar-card-heading"><h3>Team Messages</h3><button type="button" class="btn small" id="refreshTeamMessages">Refresh</button></div>
    <p class="meta">Only you and the teammate you choose can see your conversation.</p>
    <p class="meta" id="teamMessageStatus" role="status" aria-live="polite"></p>
    <div id="teamMessageList" style="max-height:580px;overflow:auto"></div>
    <button class="btn small hidden" id="moreTeamMessages" type="button">Older conversations</button>
    <h4 style="margin:20px 0 8px;border-top:1px solid #dbe4f0;padding-top:16px">New conversation</h4>
    <form id="teamMessageForm"><label for="teamMessageRecipient">To</label><select id="teamMessageRecipient" required><option value="">Choose a teammate</option></select>
    <label for="teamMessageBody">Message</label><textarea id="teamMessageBody" required maxlength="4000" placeholder="Write a message…"></textarea>
    <button class="btn primary small" id="sendTeamMessage" type="submit">Send Message</button></form>`;
  sidebar.prepend(card);
  const style=document.createElement('style');style.textContent='#teamMessagesCard .message-unread{background:#fff5cf;border:2px solid #e3aa16;border-left:6px solid #d28a00}#teamMessagesCard .message-new{display:inline-block;background:#9b5c00;color:white;border-radius:20px;padding:3px 9px;font-size:12px;margin-left:8px}#teamMessagesCard .message-thread{border-bottom:2px solid #dbe4f0;margin-bottom:16px;padding-bottom:12px}#teamMessagesCard .message-reply{margin-left:18px;border-left:3px solid #b7c9e4;padding-left:10px}#teamMessagesCard .reply-form{margin:10px 0 8px 18px}';document.head.append(style);
  const el=id=>document.getElementById(id);
  const say=text=>{el('teamMessageStatus').textContent=text;};
  const name=id=>members.find(m=>m.user_id===id)?.display_name||'Teammate';
  const unread=row=>!row.hidden&&row.recipient_id===account&&!row.read_at;
  function button(label,run){const b=document.createElement('button');b.type='button';b.className='btn small';b.textContent=label;b.onclick=run;return b;}
  function reset(){
    sequence++;account=null;members=[];rows=[];sending=false;offset=0;replyDraft=null;
    el('teamMessageForm').reset();el('teamMessageList').replaceChildren();
    el('teamMessageRecipient').innerHTML='<option value="">Choose a teammate</option>';say('');
    el('sendTeamMessage').disabled=false;el('moreTeamMessages').classList.add('hidden');card.querySelector('h3').textContent='Team Messages';
  }
  window.addEventListener('bro-user-change',reset);
  async function send(to,body,root=null){
    if(sending||!user?.id||!body.trim())return false;
    const uid=user.id;
    if(!members.some(m=>m.user_id===to&&m.user_id!==uid)){say('Choose an available teammate.');return false;}
    sending=true;el('sendTeamMessage').disabled=true;
    try{
      const result=await db.from('team_messages').insert({recipient_id:to,body:body.trim(),...(root?{reply_to:root}:{})});
      if(user?.id!==uid)return false;if(result.error)throw result.error;say('Message sent.');return true;
    }catch(error){if(user?.id===uid)say('Could not send: '+error.message);return false;}
    finally{if(user?.id===uid){sending=false;el('sendTeamMessage').disabled=false;}}
  }
  function replyForm(thread,root,to){
    const form=document.createElement('form');form.className='reply-form';
    const label=document.createElement('label');label.textContent='Reply to '+name(to);
    const input=document.createElement('textarea');input.required=true;input.maxLength=4000;input.value=replyDraft?.text||'';input.placeholder='Write a reply…';label.append(input);
    input.oninput=()=>{replyDraft={root,to,text:input.value};};
    const submit=document.createElement('button');submit.type='submit';submit.className='btn primary small';submit.textContent='Send Reply';
    form.append(label,submit,button('Cancel',()=>{replyDraft=null;render();}));
    form.onsubmit=async event=>{event.preventDefault();submit.disabled=true;if(await send(to,input.value,root)){replyDraft=null;await refresh();}else submit.disabled=false;};
    thread.append(form);
  }
  async function remove(row){
    if(!confirm('Delete this message from your view? The other person keeps their copy.'))return;
    const uid=account;
    try{
      const result=await db.from('team_message_dismissals').insert({message_id:row.id});
      if(user?.id!==uid)return;if(result.error&&result.error.code!=='23505')throw result.error;
      say('Message deleted from your view.');await refresh();
    }catch(error){if(user?.id===uid)say('Could not delete: '+error.message);}
  }
  async function markRead(row){
    const uid=account;
    try{
      const result=await db.from('team_messages').update({read_at:new Date().toISOString()}).eq('id',row.id).eq('recipient_id',uid).select('id');
      if(user?.id!==uid)return;if(result.error)throw result.error;if(!result.data?.length)throw Error('Message was not updated');await refresh();
    }catch(error){if(user?.id===uid)say('Could not mark read: '+error.message);}
  }
  function render(){
    const target=el('teamMessageList');target.replaceChildren();
    const newCount=rows.filter(unread).length;
    card.querySelector('h3').textContent='Team Messages'+(newCount?` • ${newCount} unread`:'');
    const groups=new Map();for(const row of rows){const root=row.reply_to||row.id;if(!groups.has(root))groups.set(root,[]);groups.get(root).push(row);}
    const threads=[...groups.entries()].filter(([,items])=>items.some(r=>!r.hidden)).sort((a,b)=>Number(b[1].some(unread))-Number(a[1].some(unread))||Math.max(...b[1].map(r=>Date.parse(r.created_at)))-Math.max(...a[1].map(r=>Date.parse(r.created_at))));
    if(!threads.length){target.textContent='No messages yet.';return;}
    for(const [root,items] of threads){
      const original=items.find(r=>r.id===root)||items[0],to=original.sender_id===account?original.recipient_id:original.sender_id;
      const thread=document.createElement('section');thread.className='message-thread';
      items.sort((a,b)=>Number(!!a.reply_to)-Number(!!b.reply_to)||Date.parse(a.created_at)-Date.parse(b.created_at));
      for(const row of items){
        if(row.hidden){if(row.id===root){const placeholder=document.createElement('p');placeholder.className='meta';placeholder.textContent='Original message deleted from your view.';thread.append(placeholder);}continue;}
        const item=document.createElement('article');item.className='task'+(row.reply_to?' message-reply':'')+(unread(row)?' message-unread':'');
        const heading=document.createElement('b');heading.textContent=row.sender_id===account?'You':name(row.sender_id);
        if(unread(row)){const badge=document.createElement('span');badge.className='message-new';badge.textContent='Unread';heading.append(badge);}
        const date=document.createElement('div');date.className='meta';date.textContent=new Date(row.created_at).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'})+(row.read_at?' • Read':'');
        const body=document.createElement('p');body.style.whiteSpace='pre-wrap';body.style.overflowWrap='anywhere';body.textContent=row.body;
        item.append(heading,date,body);
        if(unread(row))item.append(button('Mark Read',()=>markRead(row)));
        item.append(button('Delete',()=>remove(row)));thread.append(item);
      }
      if(replyDraft?.root===root)replyForm(thread,root,to);
      else thread.append(button('Reply to '+name(to),()=>{replyDraft={root,to,text:''};render();}));
      target.append(thread);
    }
  }
  async function refresh(older=false){
    if(typeof user==='undefined'||!user?.id||!db)return;
    if(account!==user.id){reset();account=user.id;}
    const uid=account,request=++sequence,nextOffset=older?offset+20:0;
    try{
      const [people,result]=await Promise.all([db.rpc('bro_message_recipients'),db.rpc('bro_message_threads',{p_offset:nextOffset})]);
      if(user?.id!==uid||request!==sequence)return;if(people.error)throw people.error;if(result.error)throw result.error;
      members=people.data||[];offset=nextOffset;
      const chosen=el('teamMessageRecipient').value;el('teamMessageRecipient').innerHTML='<option value="">Choose a teammate</option>';
      for(const person of members.filter(m=>m.user_id!==uid)){const option=document.createElement('option');option.value=person.user_id;option.textContent=person.display_name;el('teamMessageRecipient').append(option);}
      el('teamMessageRecipient').value=chosen;
      rows=older?[...new Map([...rows,...result.data.rows].map(r=>[r.id,r])).values()]:result.data.rows;
      el('moreTeamMessages').classList.toggle('hidden',!result.data.has_more);render();
    }catch(error){if(user?.id===uid&&request===sequence)say('Could not load messages: '+error.message);}
  }
  el('teamMessageForm').onsubmit=async event=>{event.preventDefault();if(await send(el('teamMessageRecipient').value,el('teamMessageBody').value)){el('teamMessageBody').value='';await refresh();}};
  el('refreshTeamMessages').onclick=()=>refresh();el('moreTeamMessages').onclick=()=>refresh(true);
  setInterval(()=>{if(!document.hidden&&!el('view-today').classList.contains('hidden')&&!sending&&!replyDraft&&!offset)refresh();},30000);
  setInterval(()=>{if(typeof user!=='undefined'&&user?.id!==account){if(user?.id)refresh();else reset();}},1000);
})();
