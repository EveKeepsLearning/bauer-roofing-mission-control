'use strict';
(function(){
  const $=id=>document.getElementById(id);
  function installField(){
    if($('quotedPrice')) return;
    const grid=document.querySelector('main .card2 .grid');
    if(!grid) return;
    const work=$('workCategory')?.parentElement;
    const div=document.createElement('div');
    div.innerHTML='<label>Quoted price</label><input id="quotedPrice" type="number" min="0" step="0.01" inputmode="decimal">';
    if(work) work.insertAdjacentElement('afterend',div); else grid.appendChild(div);
  }
  installField();

  if(typeof fill==='function'){
    const originalFill=fill;
    fill=function(){
      originalFill();
      installField();
      if($('quotedPrice')) $('quotedPrice').value=inquiry?.quoted_price??'';
    };
  }

  const saveBtn=$('saveInquiryBtn');
  if(saveBtn && typeof saveInquiry==='function'){
    const originalSave=saveInquiry;
    saveBtn.onclick=async()=>{
      const raw=$('quotedPrice')?.value;
      const quoted=raw===''||raw==null?null:Number(raw);
      if(inquiryId){
        const {error}=await db.from('leads').update({quoted_price:quoted,updated_at:new Date().toISOString()}).eq('id',inquiryId);
        if(error){ if(typeof notice==='function') notice(error.message,'error'); return; }
      }
      await originalSave();
    };
  }

  if(typeof inquiry!=='undefined' && inquiry && $('quotedPrice')) $('quotedPrice').value=inquiry.quoted_price??'';
})();
