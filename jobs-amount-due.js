'use strict';
(() => {
  function removeLegacyAmountDue(){
    const input=document.getElementById('editAmountDue');
    if(input){
      const wrap=input.closest('div');
      if(wrap)wrap.remove();
      else input.remove();
    }
  }

  // Balance due is now the single customer-balance value shown in BRO.
  // Keep the legacy amount_due database field available behind the scenes for compatibility,
  // but do not render or edit it on the job form or Open Jobs cards.
  removeLegacyAmountDue();
  setTimeout(removeLegacyAmountDue,200);
  setTimeout(removeLegacyAmountDue,800);
})();
