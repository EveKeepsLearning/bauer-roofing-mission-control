'use strict';
(() => {
  if(window.__broTeamMessageAlertsLoaded)return;
  window.__broTeamMessageAlertsLoaded=true;

  let client=null,uid=null,channel=null,active=null,polling=false;
  const queued=new Map(),names=new Map();
  const $=id=>document.getElementById(id);

  function install(){
    if($('broTeamMessageAlert'))return;
    const style=document.createElement('style');
    style.id='broTeamMessageAlertStyles';
    style.textContent=`#broTeamMessageAlert{border:0;border-radius:18px;padding:0;max-width:min(600px,92vw);width:100%;box-shadow:0 28px 90px rgba(12,31,55,.34)}#broTeamMessageAlert::backdrop{background:rgba(12,31,55,.72);backdrop-filter:blur(2px)}.bro-message-alert{padding:24px}.bro-message-alert-kicker{font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:#a85c00}.bro-message-alert h2{margin:5px 0 6px;color:#20354f;font-size:26px}.bro-message-alert-meta{color:#687588;font-size:13px;margin-bottom:16px}.bro-message-alert-body{white-space:pre-wrap;overflow-wrap:anywhere;background:#fff8dc;border:2px solid #e7ad24;border-left:7px solid #cf7d00;border-radius:12px;padding:18px;font-size:18px;line-height:1.45;color:#26384d}.bro-message-alert-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}.bro-message-alert-count{font-size:12px;color:#687588;margin-top:10px}`;
    document.head.appendChild(style);
    const dialog=document.createElement('dialog');
    dialog.id='broTeamMessageAlert';
    dialog.dataset.noGuard='true';
    dialog.innerHTML=`<div class="bro-message-alert"><div class="bro-message-alert-kicker">New Team Message</div><h2 id="broTeamMessageSender">Message from teammate</h2><div class="bro-message-alert-meta" id="broTeamMessageWhen"></div><div class="bro-message-alert-body" id="broTeamMessageBody"></div><div class="bro-message-alert-actions"><button class="btn primary" type="button" id="broTeamMessageOpen">Read & Open Conversation</button><button class="btn" type="button" id="broTeamMessageRead">Mark Read</button></div><div class="bro-message-alert-count" id="broTeamMessageCount"></div></div>`;
    dialog.addEventListener('cancel',e=>e.preventDefault());
    document.body.appendChild(dialog);
    $('broTeamMessageRead').onclick=()=>acknowledge(false);
    $('broTeamMessageOpen').onclick=()=>acknowledge(true);
  }

  function senderName(id){return names.get(id)||'Teammate';}
  function rootId(row){return row?.reply_to||row?.id||'';}
  function formatWhen(value){try{return new Date(value).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}catch{return'';}}

  function present(){
    install();
    const dialog=$('broTeamMessageAlert');
    if(active||dialog?.open)return;
    const next=[...queued.values()].sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at))[0];
    if(!next)return;
    queued.delete(next.id);active=next;
    $('broTeamMessageSender').textContent='Message from '+senderName(next.sender_id);
    $('broTeamMessageWhen').textContent=formatWhen(next.created_at);
    $('broTeamMessageBody').textContent=next.body||'';
    const waiting=queued.size;
    $('broTeamMessageCount').textContent=waiting?`${waiting} more unread team message${waiting===1?'':'s'} waiting.`:'This message will stay here until you acknowledge it.';
    dialog.showModal();
    setTimeout(()=>$('broTeamMessageOpen')?.focus(),0);
  }

  function enqueue(row){
    if(!row?.id||row.recipient_id!==uid||row.read_at||row.id===active?.id)return;
    queued.set(row.id,row);present();
  }

  async function loadNames(){
    if(!client||!uid)return;
    const r=await client.rpc('bro_message_recipients');
    if(r.error)return;
    names.clear();for(const person of r.data||[])names.set(person.user_id,person.display_name||'Teammate');
  }

  async function checkUnread(){
    if(polling||!client||!uid)return;
    polling=true;
    try{
      const [m,d]=await Promise.all([
        client.from('team_messages').select('id,sender_id,recipient_id,body,created_at,reply_to,read_at').eq('recipient_id',uid).is('read_at',null).order('created_at',{ascending:true}).limit(50),
        client.from('team_message_dismissals').select('message_id')
      ]);
      if(m.error)throw m.error;if(d.error)throw d.error;
      const hidden=new Set((d.data||[]).map(x=>x.message_id));
      for(const row of m.data||[])if(!hidden.has(row.id))enqueue(row);
    }catch(error){console.warn('BRO team message alerts could not refresh:',error?.message||error);}
    finally{polling=false;}
  }

  async function acknowledge(openConversation){
    if(!active||!client||!uid)return;
    const row=active;
    const readBtn=$('broTeamMessageRead'),openBtn=$('broTeamMessageOpen');
    readBtn.disabled=true;openBtn.disabled=true;
    try{
      const result=await client.from('team_messages').update({read_at:new Date().toISOString()}).eq('id',row.id).eq('recipient_id',uid).select('id');
      if(result.error)throw result.error;
      active=null;$('broTeamMessageAlert')?.close();window.BROUX?.refreshUnread?.();
      if(openConversation){location.href=`index.html?view=today&thread=${encodeURIComponent(rootId(row))}#teamMessagesCard`;return;}
      present();
    }catch(error){console.warn('BRO could not mark the team message read:',error?.message||error);}
    finally{readBtn.disabled=false;openBtn.disabled=false;}
  }

  function stopRealtime(){if(channel&&client)client.removeChannel(channel);channel=null;}
  function startRealtime(){
    stopRealtime();if(!client||!uid||typeof client.channel!=='function')return;
    channel=client.channel('bro-team-message-alerts-'+uid)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'team_messages',filter:`recipient_id=eq.${uid}`},payload=>enqueue(payload.new))
      .subscribe();
  }

  async function bindAccount(){
    await window.BROUX?.ready;
    const nextClient=window.BROUX?.client?.(),nextUid=window.BROUX?.account?.();
    if(!nextClient||!nextUid)return;
    if(client===nextClient&&uid===nextUid)return;
    stopRealtime();client=nextClient;uid=nextUid;active=null;queued.clear();
    if($('broTeamMessageAlert')?.open)$('broTeamMessageAlert').close();
    await loadNames();startRealtime();await checkUnread();
  }

  async function init(){install();await bindAccount();setInterval(()=>{bindAccount();checkUnread();},5000);window.addEventListener('bro-ux-ready',bindAccount);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
