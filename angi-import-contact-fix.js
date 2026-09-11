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
    email:['email','email address','customer email','customer email address','primary email'],
    fee:['lead fee','fee','lead cost','cost']
  };

  function aliasIndex(headers,key){
    const normalized=headers.map(textNorm);
    const aliases=HEADER_ALIASES[key]||[];
    for(const alias of aliases){const i=normalized.indexOf(alias);if(i>=0)return i;}
    return -1;
  }

  function findHeaderRow(rows){
    for(let i=0;i<Math.min(rows.length,40);i++){
      const headers=(rows[i]||[]).map(v=>String(v??'').trim());
      const lead=aliasIndex(headers,'leadNumber');
      const supporting=['leadStatus','firstName','lastName','fullName','phone','email','address','leadDate','leadType'].filter(k=>aliasIndex(headers,k)>=0).length;
      if(lead>=0&&supporting>=1)return i;
    }
    return -1;
  }

  function dedupeByLeadNumber(rows){
    if(rows.length<2)return rows;
    const headers=rows[0].map(v=>String(v??'').trim());
    const idx=aliasIndex(headers,'leadNumber');
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

  function addColumn(rows,label,values){
    rows[0].push(label);
    rows.slice(1).forEach((row,i)=>row.push(values?values(row,i):''));
  }

  function makeOriginalImporterCompatible(rows){
    if(!rows.length)return rows;
    const headers=rows[0].map(v=>String(v??'').trim());
    if(aliasIndex(headers,'leadNumber')<0){
      throw new Error('The file opened, but no Angi Lead Number/Lead ID column was found.');
    }

    // Some current Angi exports use a single Customer Name field instead of first/last.
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

    // The original workflow can safely handle blanks for these fields. Add blank
    // canonical columns when Angi omits them instead of rejecting the whole export.
    const optional=[
      ['leadDate','Lead Date'],['leadStatus','Lead Status'],['description','Lead Description'],
      ['leadType','Lead Type'],['address','Customer Address'],['city','City'],['state','State'],
      ['zip','Zip Code'],['phone','Phone'],['email','Email']
    ];
    for(const [key,label] of optional){
      if(aliasIndex(headers,key)<0){addColumn(rows,label);headers.push(label);}
    }
    return rows;
  }

  async function robustReadAngiExportRows(file){
    const name=String(file?.name||'').toLowerCase();
    if(!/\.(xls|xlsx|csv)$/.test(name))throw new Error('Choose the .xls, .xlsx, or .csv file downloaded from Angi.');
    const buffer=await file.arrayBuffer();
    let rows=[];

    // Angi exports have appeared as CSV/TSV text with an .xls extension, UTF-16 text,
    // HTML/Excel-compatible files, and true Excel workbooks. Try all of those forms.
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
    rows=makeOriginalImporterCompatible(rows);
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
      const row={name,phone:p.phone||null,email:p.email||null,street_address:p.street_address||null,city:p.city||null,state:p.state||null,zip:p.zip||null,notes:'Created from Angi prospect so the prospect is part of the BRO contact record.'};
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
    for(const p of res.data||[]){await ensureContactForProspect(p);linked++;}
    return linked;
  }

  function install(){
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

    if(typeof saveLead==='function'){
      const originalSaveLead=saveLead;
      const fixedSaveLead=async function(){
        const prospectId=document.getElementById('leadProspectId')?.value||'';
        let contactId='';
        if(prospectId){
          const p=(typeof state!=='undefined'?(state.prospects||[]).find(x=>x.id===prospectId):null);
          contactId=p?.contact_id||'';
          if(!contactId){const pr=await db.from('prospects').select('contact_id').eq('id',prospectId).single();contactId=pr.data?.contact_id||'';}
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
