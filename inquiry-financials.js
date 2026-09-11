'use strict';
(function(){
  const $=id=>document.getElementById(id);
  const fmt=v=>Number.isFinite(Number(v))?Number(v).toLocaleString(undefined,{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}):'$0.00';
  const parseMoney=v=>{const raw=String(v??'').replace(/[$,\s]/g,'');if(raw==='')return null;const n=Number(raw);return Number.isFinite(n)?n:null;};
  function wireMoneyInput(input){if(!input||input.dataset.broMoneyReady)return;input.dataset.broMoneyReady='1';input.type='text';input.inputMode='decimal';input.placeholder='$0.00';input.addEventListener('focus',()=>{const n=parseMoney(input.value);input.value=n==null?'':n.toFixed(2);input.select();});input.addEventListener('blur',()=>{const n=parseMoney(input.value);input.value=n==null?'':fmt(n);});}
  function installField(){
    if($('quotedPrice')){wireMoneyInput($('quotedPrice'));return;}
    const grid=document.querySelector('main .card2 .grid');
    if(!grid) return;
    const work=$('workCategory')?.parentElement;
    const div=document.createElement('div');
    div.innerHTML='<label>Quoted price</label><input id="quotedPrice" type="text" inputmode="decimal" placeholder="$0.00">';
    if(work) work.insertAdjacentElement('afterend',div); else grid.appendChild(div);
    wireMoneyInput($('quotedPrice'));
  }
  installField();

  if(typeof fill==='function'){
    const originalFill=fill;
    fill=function(){
      originalFill();
      installField();
      if($('quotedPrice')) $('quotedPrice').value=inquiry?.quoted_price==null?'':fmt(inquiry.quoted_price);
    };
  }

  const saveBtn=$('saveInquiryBtn');
  if(saveBtn && typeof saveInquiry==='function'){
    const originalSave=saveInquiry;
    saveBtn.onclick=async()=>{
      const quoted=parseMoney($('quotedPrice')?.value);
      if($('quotedPrice')?.value.trim()&&quoted==null){if(typeof notice==='function')notice('Enter a valid quoted price.','error');return;}
      if(inquiryId){
        const {error}=await db.from('leads').update({quoted_price:quoted,updated_at:new Date().toISOString()}).eq('id',inquiryId);
        if(error){ if(typeof notice==='function') notice(error.message,'error'); return; }
      }
      await originalSave();
    };
  }

  if(typeof inquiry!=='undefined' && inquiry && $('quotedPrice')) $('quotedPrice').value=inquiry.quoted_price==null?'':fmt(inquiry.quoted_price);
})();
