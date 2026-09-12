'use strict';
(function(){
  const $=id=>document.getElementById(id);
  function open(kind,id){if(id)window.open(`measure-sheet.html?${kind}=${encodeURIComponent(id)}`,'_blank','noopener');}
  const job=$('jobBtn');
  if(job&&!$('printInquiryMeasureSheet')){
    const b=document.createElement('button');b.id='printInquiryMeasureSheet';b.type='button';b.className='btn';b.textContent='Print Measure Sheet';
    b.onclick=()=>{if(typeof inquiryHasUnsavedChanges!=='undefined'&&inquiryHasUnsavedChanges){notice('Save your inquiry changes before printing.','error');return;}open('inquiry',new URLSearchParams(location.search).get('id'));};job.after(b);
  }
  const title=$('jobDialogTitle');
  if(title&&!$('printJobMeasureSheet')){
    const b=document.createElement('button');b.id='printJobMeasureSheet';b.type='button';b.className='btn';b.textContent='Print Measure Sheet';b.style.marginBottom='12px';
    let dirty=false;const dialog=$('jobDialog');dialog.addEventListener('input',()=>dirty=true);dialog.addEventListener('change',()=>dirty=true);dialog.addEventListener('close',()=>dirty=false);
    b.onclick=()=>{if(dirty){if(typeof notice==='function')notice('Save your job changes before printing.','error');alert('Save your job changes before printing.');return;}open('job',$('editJobId').value);};title.after(b);
  }
})();
