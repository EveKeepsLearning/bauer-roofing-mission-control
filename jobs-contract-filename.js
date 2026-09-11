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
