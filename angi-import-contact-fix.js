'use strict';
(function(){
  if(window.__broAngiImportContactFixLoaded)return;
  window.__broAngiImportContactFixLoaded=true;

  const waitForApp=()=>{
    if(typeof db==='undefined'||!db||typeof importAngiExport!=='function'||!document.getElementById('angiImportBtn')){
      setTimeout(waitForApp,120);
      return;
    }
    install();
  };

  function textNorm(v){return String(v||'').trim().toLowerCase().replace(/\s+/g,' ');}
  function phoneNorm(v){return String(v||'').replace(/\D/g,'');}
  function addressNorm(v){return String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');}
  function rowHasValues(row){return Array.isArray(row)&&row.some(v=>String(v??'').trim()!=='');}

  function findHeaderRow(rows){
    const aliases=new Set(['lead number','lead #','lead id','lead number / id']);
    for(let i=0;i<Math.min(rows.length,30);i++){
      const normalized=(rows[i]||[]).map(v=>textNorm(v));
      const hasLead=normalized.some(v=>aliases.has(v));
      const supporting=normalized.filter(v=>/^(lead status|customer first name|first name|customer last name|last name|phone|phone number|email|email address|customer address|address|lead date)$/.test(v)).length;
      if(hasLead&&supporting>=2)return i;
    }
    return -1;
  }

  function dedupeByLeadNumber(rows){
    if(rows.length<2)return rows;
    const headers=rows[0].map(v=>String(v??'').trim());
    let idx=-1;
    try{if(typeof angiHeaderIndex==='function')idx=angiHeaderIndex(headers).leadNumber;}catch(_){idx=-1;}
    if(idx<0){
      idx=headers.map(textNorm).findIndex(v=>['lead number','lead #','lead id','lead number / id'].includes(v));
    }
    if(idx<0)return rows;
    const byRef=new Map();
    const noRef=[];
    for(const row of rows.slice(1)){
      if(!rowHasValues(row))continue;
      const ref=String(row[idx]??'').trim();
      if(ref)byRef.set(ref,row);else noRef.push(row);
    }
    return [rows[0],...byRef.values(),...noRef];
  }

  function workbookRows(workbook){
    for(const sheetName of workbook?.SheetNames||[]){
      const sheet=workbook.Sheets[sheetName];
      const rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false,dateNF:'m/d/yyyy h:mm AM/PM'}).filter(rowHasValues);
      if(findHeaderRow(rows)>=0)return rows;
    }
    return [];
  }

  async function robustReadAngiExportRows(file){
    const name=String(file?.name||'').toLowerCase();
    if(!/\.(xls|xlsx|csv)$/.test(name))throw new Error('Choose the .xls, .xlsx, or .csv file downloaded from Angi.');
    const buffer=await file.arrayBuffer();
    let rows=[];

    // Angi often gives a .xls extension to delimited text. Handle UTF-8 and UTF-16 exports,
    // as well as real Excel workbooks, and do not require the header to be the first row.
    const bytes=new Uint8Array(buffer);
    const nullRatio=bytes.length?bytes.slice(0,Math.min(bytes.length,4000)).filter(b=>b===0).length/Math.min(bytes.length,4000):0;
    const encodings=nullRatio>.08?['utf-16le','utf-8']:['utf-8','utf-16le'];
    for(const encoding of encodings){
      try{
        const text=new TextDecoder(encoding).decode(buffer).replace(/^\uFEFF/,'').trim();
        if(!text||!/lead\s*(number|#|id)/i.test(text))continue;
        if(typeof XLSX!=='undefined'){
          try{rows=workbookRows(XLSX.read(text,{type:'string',raw:false}));}catch(_){rows=[];}
        }
        if(!rows.length&&typeof parseCsvText==='function'&&text.includes(',')){
          try{rows=parseCsvText(text).filter(rowHasValues);}catch(_){rows=[];}
        }
        if(!rows.length&&text.includes('\t')){
          rows=text.split(/\r?\n/).map(line=>line.split('\t')).filter(rowHasValues);
        }
        if(rows.length)break;
      }catch(_){/* try the next format */}
    }

    if(!rows.length&&typeof XLSX!=='undefined'){
      try{rows=workbookRows(XLSX.read(buffer,{type:'array',cellDates:true,raw:false}));}catch(_){rows=[];}
    }
    if(!rows.length)throw new Error('I could not read this Angi export. Download a fresh export from Angi and try again.');

    const headerRow=findHeaderRow(rows);
    if(headerRow<0)throw new Error('I found the file, but could not find the Angi Lead Number header row.');
    rows=rows.slice(headerRow).filter(rowHasValues);
    return dedupeByLeadNumber(rows);
  }

  async function findContactForProspect(p){
    const name=String(p.customer_name||[p.first_name,p.last_name].filter(Boolean).join(' ')||'').trim();
    const email=String(p.email||'').trim();
    const phone=String(p.phone||'').trim();
    const street=String(p.street_address||'').trim();
    const calls=[];
    if(email&&email.includes('@'))calls.push(db.from('contacts').select('*').ilike('email',email).limit(5));
    if(phone)calls.push(db.from('contacts').select('*').eq('phone',phone).limit(5));
    if(name)calls.push(db.from('contacts').select('*').ilike('name',name).limit(10));
    if(!calls.length)return null;
    const results=await Promise.all(calls);
    const map=new Map();
    results.forEach(r=>(r.data||[]).forEach(c=>map.set(c.id,c)));
    const em=textNorm(email),ph=phoneNorm(phone),nm=textNorm(name),st=addressNorm(street);
    const matches=[...map.values()].filter(c=>{
      const emailMatch=em&&em.includes('@')&&textNorm(c.email)===em;
      const phoneMatch=ph.length>=7&&phoneNorm(c.phone)===ph;
      const nameAddressMatch=nm&&st&&textNorm(c.name)===nm&&addressNorm(c.street_address)===st;
      return emailMatch||phoneMatch||nameAddressMatch;
    });
    return matches.length?matches[0]:null;
  }

  async function ensureContactForProspect(p){
    if(!p||p.contact_id)return p?.contact_id||null;
    let contact=await findContactForProspect(p);
    if(!contact){
      const name=String(p.customer_name||[p.first_name,p.last_name].filter(Boolean).join(' ')||'').trim()||'Unknown';
      const row={
        name,
        phone:p.phone||null,
        email:p.email||null,
        street_address:p.street_address||null,
        city:p.city||null,
        state:p.state||null,
        zip:p.zip||null,
        notes:'Created from Angi prospect so the prospect is part of the BRO contact record.'
      };
      const created=await db.from('contacts').insert(row).select('*').single();
      if(created.error)throw created.error;
      contact=created.data;
    }
    const linked=await db.from('prospects').update({contact_id:contact.id,updated_at:new Date().toISOString()}).eq('id',p.id);
    if(linked.error)throw linked.error;
    p.contact_id=contact.id;
    return contact.id;
  }

  async function ensureActiveAngiContacts(){
    const res=await db.from('prospects').select('id,contact_id,customer_name,first_name,last_name,phone,email,street_address,city,state,zip').eq('source','Angi').is('deleted_at',null).eq('archive_flag',false).is('converted_to_lead_at',null).limit(2000);
    if(res.error)throw res.error;
    let linked=0;
    for(const p of res.data||[]){
      await ensureContactForProspect(p);
      linked++;
    }
    return linked;
  }

  function install(){
    // Replace only the file reader; the established workflow/status logic remains intact.
    try{readAngiExportRows=robustReadAngiExportRows;}catch(_){window.readAngiExportRows=robustReadAngiExportRows;}

    const originalImport=importAngiExport;
    const fixedImport=async function(){
      const button=document.getElementById('angiImportBtn');
      const status=document.getElementById('angiImportStatus');
      if(button){button.disabled=true;button.textContent='Importing…';}
      try{
        await originalImport();
        if(status?.textContent?.trim()){
          const linked=await ensureActiveAngiContacts();
          status.textContent += ` ${linked} active Angi prospect${linked===1?' is':'s are'} linked to BRO contacts. Prospects remain prospects; no inquiry is created until they are promoted.`;
          if(typeof loadAll==='function')await loadAll();
          if(typeof renderAngiQueue==='function')renderAngiQueue();
        }
      }catch(error){
        if(typeof msg==='function')msg('Could not finish Angi import: '+(error?.message||String(error)),'error');
      }finally{
        if(button){button.disabled=false;button.textContent='Import Angi .xls';}
      }
    };
    try{importAngiExport=fixedImport;}catch(_){window.importAngiExport=fixedImport;}
    document.getElementById('angiImportBtn').onclick=fixedImport;

    // Manual Angi prospects also become BRO contacts.
    if(typeof saveProspect==='function'){
      const originalSaveProspect=saveProspect;
      const fixedSaveProspect=async function(){
        const isAngi=document.getElementById('prospectSource')?.value==='Angi';
        await originalSaveProspect();
        if(isAngi){try{await ensureActiveAngiContacts();}catch(error){console.warn('Could not link Angi prospect contact:',error);}}
      };
      try{saveProspect=fixedSaveProspect;}catch(_){window.saveProspect=fixedSaveProspect;}
      const saveProspectBtn=document.getElementById('saveProspectBtn');if(saveProspectBtn)saveProspectBtn.onclick=fixedSaveProspect;
    }

    // When an Angi prospect becomes an inquiry, carry the same contact forward.
    if(typeof saveLead==='function'){
      const originalSaveLead=saveLead;
      const fixedSaveLead=async function(){
        const prospectId=document.getElementById('leadProspectId')?.value||'';
        let contactId='';
        if(prospectId){
          const p=(typeof state!=='undefined'?(state.prospects||[]).find(x=>x.id===prospectId):null);
          contactId=p?.contact_id||'';
          if(!contactId){
            const pr=await db.from('prospects').select('contact_id').eq('id',prospectId).single();
            contactId=pr.data?.contact_id||'';
          }
        }
        await originalSaveLead();
        if(prospectId&&contactId){
          const lr=await db.from('leads').select('id,contact_id').eq('prospect_id',prospectId).order('created_at',{ascending:false}).limit(1);
          const lead=(lr.data||[])[0];
          if(lead&&!lead.contact_id)await db.from('leads').update({contact_id:contactId,updated_at:new Date().toISOString()}).eq('id',lead.id);
        }
      };
      try{saveLead=fixedSaveLead;}catch(_){window.saveLead=fixedSaveLead;}
      const saveLeadBtn=document.getElementById('saveLeadBtn');if(saveLeadBtn)saveLeadBtn.onclick=fixedSaveLead;
    }
  }

  if(document.readyState==='complete')waitForApp();
  else window.addEventListener('load',waitForApp,{once:true});
})();