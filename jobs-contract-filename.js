'use strict';
(function(){
  const $=id=>document.getElementById(id);

  function contractFileName(){
    const raw=String($('editAddress')?.value||'').trim();
    if(!raw)return '';
    const street=raw.split(',')[0].trim();
    const match=street.match(/^([0-9]+(?:[-A-Za-z0-9]*)?)\s+(.+)$/);
    if(!match)return '';
    const number=match[1].trim();
    const name=match[2].trim();
    if(!number||!name)return '';
    return `Contract-${name},${number}`;
  }

  function prefill(){
    const type=$('documentType');
    const file=$('documentFileName');
    if(!type||!file||type.value!=='Contract'||String(file.value||'').trim())return;
    const suggested=contractFileName();
    if(suggested)file.value=suggested;
  }

  function install(){
    if(typeof openDocumentDialog==='function'&&!window.__broContractFilenameWrapped){
      window.__broContractFilenameWrapped=true;
      const original=openDocumentDialog;
      openDocumentDialog=function(doc=null){
        const result=original(doc);
        if(!doc)setTimeout(prefill,0);
        return result;
      };
    }
    const type=$('documentType');
    if(type&&!type.dataset.broContractFilename){
      type.dataset.broContractFilename='1';
      type.addEventListener('change',prefill);
    }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{install();setTimeout(install,300);},{once:true});
  else{install();setTimeout(install,300);}
})();

(function(){
  const REPAIR='#4054b2';
  const REROOF='#1296d4';

  function kind(j){
    const raw=String((typeof jobType==='function'?jobType(j):(j?.job_type||j?.primary_category||''))||'').toLowerCase();
    if(raw.includes('repair'))return'repair';
    if(raw.includes('reroof')||raw.includes('re-roof')||raw.includes('re roof'))return'reroof';
    return'';
  }

  function installStyles(){
    if(document.getElementById('broJobTypeColors'))return;
    const style=document.createElement('style');
    style.id='broJobTypeColors';
    style.textContent=`
      .job-card.bro-repair{border:3px solid ${REPAIR}!important;padding:8px!important}
      .job-card.bro-reroof{border:3px solid ${REROOF}!important;padding:8px!important}
      .jobs-table tr.bro-repair td:first-child{border-left:6px solid ${REPAIR}!important}
      .jobs-table tr.bro-reroof td:first-child{border-left:6px solid ${REROOF}!important}
      .jobs-table tr.bro-repair{background:linear-gradient(90deg,rgba(64,84,178,.08),transparent 24%)}
      .jobs-table tr.bro-reroof{background:linear-gradient(90deg,rgba(18,150,212,.08),transparent 24%)}
      .jobs-table tr.bro-repair:hover{background:linear-gradient(90deg,rgba(64,84,178,.15),#f8fbff 28%)}
      .jobs-table tr.bro-reroof:hover{background:linear-gradient(90deg,rgba(18,150,212,.15),#f8fbff 28%)}
    `;
    document.head.appendChild(style);
  }

  function decorateTable(){
    if(typeof jobs==='undefined')return;
    document.querySelectorAll('.jobs-table tr[data-job-id]').forEach(row=>{
      const j=jobs.find(x=>String(x.id)===String(row.dataset.jobId));
      row.classList.remove('bro-repair','bro-reroof');
      const k=kind(j);
      if(k)row.classList.add('bro-'+k);
    });
  }

  installStyles();

  if(typeof card==='function'&&!window.__broJobTypeCardWrapped){
    window.__broJobTypeCardWrapped=true;
    const baseCard=card;
    card=function(j){
      const html=baseCard(j);
      const k=kind(j);
      return k?html.replace('class="job-card"',`class="job-card bro-${k}"`):html;
    };
  }

  if(typeof renderTable==='function'&&!window.__broJobTypeTableWrapped){
    window.__broJobTypeTableWrapped=true;
    const baseRenderTable=renderTable;
    renderTable=function(){const result=baseRenderTable();decorateTable();return result;};
  }

  if(typeof renderAll==='function')renderAll();
})();
