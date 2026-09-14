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

  async function loadAllProspectsBeforeImport(){
    if(typeof db==='undefined'||!db||typeof state==='undefined')return;
    const all=[];
    const pageSize=1000;
    for(let from=0;;from+=pageSize){
      const result=await db.from('prospects').select('*').order('id').range(from,from+pageSize-1);
      if(result.error)throw result.error;
      const rows=result.data||[];
      all.push(...rows);
      if(rows.length<pageSize)break;
    }
    const byId=new Map((state.prospects||[]).map(row=>[String(row.id),row]));
    all.forEach(row=>byId.set(String(row.id),row));
    state.prospects=[...byId.values()];
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

    file.addEventListener('change',async()=>{
      if(!file.files?.length)return;
      const status=$('angiImportStatus');
      quick.disabled=true;
      manual.disabled=true;
      if(status)status.textContent='Checking BRO for leads already imported…';
      try{
        await loadAllProspectsBeforeImport();
        importButton.click();
      }catch(error){
        if(status)status.textContent='';
        if(typeof msg==='function')msg('Could not prepare the Angi import: '+(error.message||String(error)),'error');
      }finally{
        quick.disabled=false;
        manual.disabled=false;
      }
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
