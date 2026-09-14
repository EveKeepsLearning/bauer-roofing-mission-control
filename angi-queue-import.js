'use strict';
(() => {
  if(window.__broAngiQueueImportLoaded)return;
  window.__broAngiQueueImportLoaded=true;
  const $=id=>document.getElementById(id);
  const norm=v=>String(v??'').trim().toLowerCase().replace(/\s+/g,' ');
  const rowHasValues=row=>Array.isArray(row)&&row.some(v=>String(v??'').trim()!=='');

  const HEADER_ALIASES={
    leadNumber:['lead number','lead #','lead id','lead number / id','lead id number','leadid','request id','request number'],
    leadDate:['lead date','date','received date','date received','created','created date','date created','lead received','received'],
    leadStatus:['lead status','status','status name','lead state'],
    description:['lead description','project description','description','service request','project details','service description','project'],
    leadType:['lead type','type','service','service type','category','project type'],
    firstName:['customer first name','first name','customer firstname','firstname'],
    lastName:['customer last name','last name','customer lastname','lastname'],
    fullName:['customer name','homeowner name','name','contact name'],
    address:['customer address','address','street address','property address','service address'],
    city:['city','customer city','service city'],
    state:['state','customer state','service state'],
    zip:['zip code','zip','postal code','customer zip','zipcode','postal'],
    phone:['phone','phone number','customer phone','customer phone number','primary phone','telephone'],
    email:['email','email address','customer email','customer email address','primary email']
  };

  function aliasIndex(headers,key){
    const values=headers.map(norm);
    for(const alias of HEADER_ALIASES[key]||[]){const i=values.indexOf(alias);if(i>=0)return i;}
    return -1;
  }

  function findHeaderRow(rows){
    for(let i=0;i<Math.min(rows.length,40);i++){
      const headers=(rows[i]||[]).map(v=>String(v??'').trim());
      const lead=aliasIndex(headers,'leadNumber');
      const supporting=['leadStatus','firstName','lastName','fullName','phone','email','address','leadDate','leadType'].filter(key=>aliasIndex(headers,key)>=0).length;
      if(lead>=0&&supporting>=1)return i;
    }
    return -1;
  }

  function workbookRows(workbook){
    for(const sheetName of workbook?.SheetNames||[]){
      const rows=XLSX.utils.sheet_to_json(workbook.Sheets[sheetName],{header:1,defval:'',raw:false,dateNF:'m/d/yyyy h:mm AM/PM'}).filter(rowHasValues);
      if(findHeaderRow(rows)>=0)return rows;
    }
    return [];
  }

  function addColumn(rows,label,getValue){
    rows[0].push(label);
    rows.slice(1).forEach((row,index)=>row.push(getValue?getValue(row,index):''));
  }

  function makeImporterCompatible(rows){
    const headers=rows[0].map(v=>String(v??'').trim());
    if(aliasIndex(headers,'leadNumber')<0)throw new Error('The file opened, but no Angi Lead Number/Lead ID column was found.');
    const fullNameIndex=aliasIndex(headers,'fullName');
    if(aliasIndex(headers,'firstName')<0){
      addColumn(rows,'Customer First Name',row=>{
        const full=fullNameIndex>=0?String(row[fullNameIndex]||'').trim():'';
        if(!full)return'';
        if(full.includes(','))return full.split(',').slice(1).join(',').trim();
        const parts=full.split(/\s+/).filter(Boolean);
        return parts.length>1?parts.slice(0,-1).join(' '):parts[0]||'';
      });
      headers.push('Customer First Name');
    }
    if(aliasIndex(headers,'lastName')<0){
      addColumn(rows,'Customer Last Name',row=>{
        const full=fullNameIndex>=0?String(row[fullNameIndex]||'').trim():'';
        if(!full)return'';
        if(full.includes(','))return full.split(',')[0].trim();
        const parts=full.split(/\s+/).filter(Boolean);
        return parts.length>1?parts[parts.length-1]:'';
      });
      headers.push('Customer Last Name');
    }
    const optional=[['leadDate','Lead Date'],['leadStatus','Lead Status'],['description','Lead Description'],['leadType','Lead Type'],['address','Customer Address'],['city','City'],['state','State'],['zip','Zip Code'],['phone','Phone'],['email','Email']];
    for(const [key,label] of optional){if(aliasIndex(headers,key)<0){addColumn(rows,label);headers.push(label);}}
    return rows;
  }

  function dedupeByLeadNumber(rows){
    const idx=aliasIndex(rows[0]||[],'leadNumber');
    if(idx<0)return rows;
    const byLead=new Map(),noLead=[];
    for(const row of rows.slice(1)){
      if(!rowHasValues(row))continue;
      const ref=String(row[idx]??'').trim();
      if(ref)byLead.set(ref,row);else noLead.push(row);
    }
    return [rows[0],...byLead.values(),...noLead];
  }

  async function robustReadAngiExportRows(file){
    const name=String(file?.name||'').toLowerCase();
    if(!/\.(xls|xlsx|csv)$/.test(name))throw new Error('Choose the .xls, .xlsx, or .csv file downloaded from Angi.');
    const buffer=await file.arrayBuffer();
    let rows=[];
    const bytes=new Uint8Array(buffer);
    const sample=bytes.slice(0,Math.min(bytes.length,4000));
    const nullRatio=sample.length?[...sample].filter(b=>b===0).length/sample.length:0;
    const encodings=nullRatio>.08?['utf-16le','utf-8']:['utf-8','utf-16le'];

    for(const encoding of encodings){
      try{
        const text=new TextDecoder(encoding).decode(buffer).replace(/^\uFEFF/,'').trim();
        if(!text||!/lead\s*(number|#|id)|request\s*(id|number)/i.test(text))continue;
        if(typeof XLSX!=='undefined'){
          try{rows=workbookRows(XLSX.read(text,{type:'string',raw:false}));}catch(_){rows=[];}
        }
        if(!rows.length&&typeof parseCsvText==='function'&&text.includes(',')){
          try{rows=parseCsvText(text).filter(rowHasValues);}catch(_){rows=[];}
        }
        if(!rows.length&&text.includes('\t'))rows=text.split(/\r?\n/).map(line=>line.split('\t')).filter(rowHasValues);
        if(rows.length)break;
      }catch(_){/* try the next format */}
    }

    if(!rows.length&&typeof XLSX!=='undefined'){
      try{rows=workbookRows(XLSX.read(buffer,{type:'array',cellDates:true,raw:false}));}catch(_){rows=[];}
    }
    if(!rows.length)throw new Error('BRO could not read this Angi export. Download a fresh export from Angi and try again.');

    const headerRow=findHeaderRow(rows);
    if(headerRow<0){
      const preview=(rows[0]||[]).slice(0,12).map(v=>String(v||'').trim()).filter(Boolean).join(', ');
      throw new Error('BRO opened the file but could not identify the Angi header row.'+(preview?` First row: ${preview}`:''));
    }
    rows=rows.slice(headerRow).filter(rowHasValues);
    return dedupeByLeadNumber(makeImporterCompatible(rows));
  }

  // app.js owns the actual import/status workflow. This small module owns file-reading
  // compatibility so Angi format changes do not require another one-off patch loader.
  try{readAngiExportRows=robustReadAngiExportRows;}catch(_){window.readAngiExportRows=robustReadAngiExportRows;}

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
