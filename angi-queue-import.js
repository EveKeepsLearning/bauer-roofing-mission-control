'use strict';
(() => {
  if(window.__broAngiQueueImportLoaded)return;
  window.__broAngiQueueImportLoaded=true;
  const $=id=>document.getElementById(id);

  function openManualAngi(){
    if(typeof openProspectDialog!=='function')return;
    openProspectDialog();
    $('prospectDialogTitle').textContent='Add New Angi Lead';
    $('prospectSource').value='Angi';
    if(typeof toggleAngiFields==='function')toggleAngiFields('prospect');
    $('prospectStatus').value='New';
    $('prospectNextAction').value='Call now';
    $('prospectFirstName').focus();
  }

  function install(){
    const heading=$('view-angi')?.querySelector('.angi-toolbar-card .toolbar');
    const file=$('angiImportFile');
    const importButton=$('angiImportBtn');
    const next=$('angiWorkNextBtn');
    if(!heading||!file||!importButton||$('angiQuickImportBtn'))return;

    const manual=document.createElement('button');
    manual.id='angiQuickManualBtn';manual.type='button';manual.className='btn small';manual.textContent='+ Add Angi Lead';manual.onclick=openManualAngi;
    const quick=document.createElement('button');
    quick.id='angiQuickImportBtn';quick.type='button';quick.className='btn primary small';quick.textContent='Import New Leads';quick.title='Choose an Angi .xls, .xlsx, or .csv export. No Outlook connection is required.';quick.onclick=()=>file.click();
    heading.insertBefore(manual,next||null);heading.insertBefore(quick,next||null);

    const note=document.createElement('div');note.className='auth-note';note.id='angiQuickImportNote';note.textContent='Import directly from an Angi export—no Outlook connection or administrator permission required.';
    heading.parentElement.appendChild(note);
    const status=$('angiImportStatus');if(status)heading.parentElement.appendChild(status);

    file.addEventListener('change',()=>{if(file.files?.length)importButton.click();});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
