const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
class Element{
 constructor(){this.value='';this.textContent='';this.children=[];this.disabled=false;this.style={};this.classList={add(){},toggle(){},contains(){return false;}};}
 set innerHTML(v){this.html=v;this.children=[];}get innerHTML(){return this.html;}
 append(...v){this.children.push(...v);}prepend(v){this.children.unshift(v);}replaceChildren(){this.children=[];}focus(){}
 reset(){for(const id of ['teamMessageBody','teamMessageRecipient'])get(id).value='';}
}
const els=new Map(),get=id=>{if(!els.has(id))els.set(id,new Element());return els.get(id);};
const timers=[],events={},inserts=[];
const people=[{user_id:'eve',display_name:'Eve'},{user_id:'jonathan',display_name:'Jonathan'}];
const context={user:{id:'eve'},document:{hidden:false,querySelector:()=>get('sidebar'),createElement:()=>new Element(),getElementById:get},window:{addEventListener:(n,fn)=>events[n]=fn},setInterval:fn=>timers.push(fn),Date,console};
context.db={rpc:async()=>({data:people}),from:()=>{
 const q={select(){return q},or(){return q},order(){return q},range:async()=>({data:[{id:'m',sender_id:'jonathan',recipient_id:'eve',created_at:'2026-09-12T12:00:00Z',body:'<img src=x onerror=alert(1)>',read_at:null}]}),insert:async data=>{inserts.push(data);return{};}};return q;
}};
vm.createContext(context);vm.runInContext(fs.readFileSync(process.argv[2]||'today-messages.js','utf8'),context);
(async()=>{
 timers[1]();await new Promise(r=>setImmediate(r));
 assert.equal(inserts.length,0,'Loading must not send');
 assert.equal(get('teamMessageRecipient').children[0].textContent,'Jonathan');
 const message=get('teamMessageList').children[0];
 assert.equal(message.children[2].textContent,'<img src=x onerror=alert(1)>');
 assert.equal(message.children[2].children.length,0,'Message uses text, not HTML');
 get('teamMessageRecipient').value='jonathan';get('teamMessageBody').value=' Hello Jonathan ';
 await get('teamMessageForm').onsubmit({preventDefault(){}});
 assert.equal(inserts.length,1);assert.equal(inserts[0].recipient_id,'jonathan');assert.equal(inserts[0].body,'Hello Jonathan');assert.equal(inserts[0].sender_id,undefined,'Database controls sender');
 get('teamMessageBody').value='Private unsent draft';events['bro-user-change']();context.user={id:'jonathan'};
 assert.equal(get('teamMessageBody').value,'');assert.equal(get('teamMessageList').children.length,0);
 console.log('PASS: recipient selection, no automatic sends, safe text rendering, send action, draft cleared on account change');
})().catch(e=>{console.error(e);process.exitCode=1;});
