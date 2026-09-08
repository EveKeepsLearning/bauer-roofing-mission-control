'use strict';

const cfg = window.BAUER_CONFIG || {};
const initialAuthHash = new URLSearchParams(window.location.hash.replace(/^#/,''));
const passwordRecoveryRequested = initialAuthHash.get('type') === 'recovery';

let db = null;
let user = null;

let state = {
  tasks: [],
  task_subtasks: [],
  jobs: [],
  communications: [],
  incoming: [],
  phone: [],
  prospects: [],
  leads: [],
  appointments: [],
  sales_communications: [],
  job_communications: [],
  lookups: [],
  sops: [],
  suggestions: [],
  quick_notes: [],
  roy_updates: [],
  dad_updates: []
};

let selectedLeadId = '';
let urlNavigationApplied = false;
let leadAddressSessionToken = null;
let leadAddressPredictions = [];
let leadAddressActiveIndex = -1;
let leadAddressDebounce = null;
let placesLibraryPromise = null;
let reportContext = 'leads';
let reportData = { leads:[], prospects:[], jobs:[], appointments:[] };
let reportRows = [];
let reportDetailRows = [];

const $ = id => document.getElementById(id);

function loadGooglePlacesLibrary() {
  const key = String(cfg.GOOGLE_MAPS_API_KEY || '').trim();
  if (!key) return Promise.resolve(null);
  if (placesLibraryPromise) return placesLibraryPromise;

  placesLibraryPromise = new Promise((resolve, reject) => {
    const callbackName = '__bauerGoogleMapsReady';
    window[callbackName] = async () => {
      try {
        const library = await google.maps.importLibrary('places');
        resolve(library);
      } catch (error) {
        reject(error);
      } finally {
        delete window[callbackName];
      }
    };

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&loading=async&libraries=places&v=weekly&callback=${callbackName}`;
    script.async = true;
    script.onerror = () => reject(new Error('Google address suggestions could not be loaded.'));
    document.head.appendChild(script);
  });

  return placesLibraryPromise;
}

function clearLeadAddressSuggestions() {
  leadAddressPredictions = [];
  leadAddressActiveIndex = -1;
  const list = $('leadAddressSuggestions');
  if (list) {
    list.innerHTML = '';
    list.classList.add('hidden');
  }
  $('leadStreet')?.setAttribute('aria-expanded', 'false');
}

function addressComponent(place, type, short = false) {
  const component = (place.addressComponents || []).find(item => item.types?.includes(type));
  return component ? String(short ? component.shortText : component.longText || '').trim() : '';
}

async function chooseLeadAddress(index) {
  const prediction = leadAddressPredictions[index];
  if (!prediction) return;

  try {
    const place = prediction.toPlace();
    await place.fetchFields({ fields: ['addressComponents', 'formattedAddress'] });
    const number = addressComponent(place, 'street_number');
    const route = addressComponent(place, 'route');
    const city = addressComponent(place, 'locality') || addressComponent(place, 'postal_town') || addressComponent(place, 'sublocality_level_1');
    const region = addressComponent(place, 'administrative_area_level_1', true);
    const zip = addressComponent(place, 'postal_code');
    const street = [number, route].filter(Boolean).join(' ') || String(place.formattedAddress || '').split(',')[0].trim();

    $('leadStreet').value = street;
    if (city) $('leadCity').value = city;
    if (region) $('leadState').value = region;
    if (zip) $('leadZip').value = zip;
    clearLeadAddressSuggestions();
    leadAddressSessionToken = null;
    $('leadCity').focus();
  } catch (error) {
    console.warn('Could not fill the selected address:', error);
    msg('The address could not be filled automatically. You can still enter it manually.', 'error');
  }
}

function renderLeadAddressSuggestions(suggestions) {
  const list = $('leadAddressSuggestions');
  if (!list) return;
  leadAddressPredictions = suggestions.map(item => item.placePrediction).filter(Boolean);
  leadAddressActiveIndex = -1;
  list.innerHTML = leadAddressPredictions.map((prediction, index) => {
    const main = prediction.mainText?.toString() || prediction.text?.toString() || '';
    const secondary = prediction.secondaryText?.toString() || '';
    return `<button type="button" class="address-suggestion" role="option" data-lead-address-index="${index}"><span class="address-suggestion-main">${esc(main)}</span>${secondary ? `<span class="address-suggestion-secondary">${esc(secondary)}</span>` : ''}</button>`;
  }).join('');
  list.classList.toggle('hidden', !leadAddressPredictions.length);
  $('leadStreet')?.setAttribute('aria-expanded', leadAddressPredictions.length ? 'true' : 'false');
}

async function requestLeadAddressSuggestions() {
  const input = $('leadStreet');
  const value = String(input?.value || '').trim();
  if (value.length < 3) return clearLeadAddressSuggestions();

  try {
    const library = await loadGooglePlacesLibrary();
    if (!library?.AutocompleteSuggestion) return;
    if (!leadAddressSessionToken) leadAddressSessionToken = new library.AutocompleteSessionToken();
    const response = await library.AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: value,
      sessionToken: leadAddressSessionToken,
      includedRegionCodes: ['us'],
      language: 'en',
      region: 'us'
    });
    if (String(input.value || '').trim() !== value) return;
    renderLeadAddressSuggestions(response.suggestions || []);
  } catch (error) {
    clearLeadAddressSuggestions();
    console.warn('Google address suggestions are unavailable:', error);
  }
}

function setupLeadAddressAutocomplete() {
  const input = $('leadStreet');
  const list = $('leadAddressSuggestions');
  if (!input || !list) return;

  if (String(cfg.GOOGLE_MAPS_API_KEY || '').trim()) $('leadAddressHelp')?.classList.remove('hidden');
  input.addEventListener('input', () => {
    clearTimeout(leadAddressDebounce);
    leadAddressDebounce = setTimeout(requestLeadAddressSuggestions, 250);
  });
  input.addEventListener('keydown', event => {
    const options = [...list.querySelectorAll('.address-suggestion')];
    if (!options.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      leadAddressActiveIndex = event.key === 'ArrowDown'
        ? (leadAddressActiveIndex + 1) % options.length
        : (leadAddressActiveIndex - 1 + options.length) % options.length;
      options.forEach((option, index) => option.classList.toggle('active', index === leadAddressActiveIndex));
    } else if (event.key === 'Enter' && leadAddressActiveIndex >= 0) {
      event.preventDefault();
      chooseLeadAddress(leadAddressActiveIndex);
    } else if (event.key === 'Escape') {
      clearLeadAddressSuggestions();
    }
  });
  list.addEventListener('mousedown', event => event.preventDefault());
  list.addEventListener('click', event => {
    const option = event.target.closest('[data-lead-address-index]');
    if (option) chooseLeadAddress(Number(option.dataset.leadAddressIndex));
  });
  input.addEventListener('blur', () => setTimeout(clearLeadAddressSuggestions, 150));
}

async function ensureLatestRelease() {
  try {
    // Never reload while Supabase is consuming a one-time sign-in callback.
    // Reloading this URL can discard or reuse the authentication token and
    // send the user back to the sign-in screen.
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/,''));
    const isAuthCallback =
      query.has('code') || query.has('token_hash') || query.has('error') ||
      hash.has('access_token') || hash.has('refresh_token') || hash.has('error');
    if (isAuthCallback) return false;

    const response = await fetch(`release.json?t=${Date.now()}`, { cache:'no-store' });
    if (!response.ok) return false;
    const release = await response.json();
    const latest = String(release.version || '').trim();
    const current = String(cfg.APP_VERSION || '').trim();
    if (!latest || !current || latest === current) return false;
    const url = new URL(window.location.href);
    if (url.searchParams.get('release') === latest) return false;
    url.searchParams.set('release', latest);
    window.location.replace(url.toString());
    return true;
  } catch (error) {
    console.warn('Bauer Roofing Operations could not check for a newer release:', error);
    return false;
  }
}

async function fetchEveryReportRow(table, orderColumn) {
  const rows = [];
  const pageSize = 1000;
  for (let start=0; start<50000; start+=pageSize) {
    const result = await db.from(table).select('*').order(orderColumn,{ascending:false}).range(start,start+pageSize-1);
    if (result.error) throw result.error;
    rows.push(...(result.data||[]));
    if ((result.data||[]).length < pageSize) break;
  }
  return rows;
}

function reportDateOnly(value) {
  const text=String(value||'').slice(0,10);
  const match=text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match?`${match[2]}/${match[3]}/${match[1]}`:text;
}

function reportMoney(value) {
  const amount=Number(value||0);
  return amount.toLocaleString('en-US',{style:'currency',currency:'USD'});
}

function reportJobAmount(job) {
  const value=job.contract_amount??job.job_amount??job.amount??job.contract_price??job.price??0;
  const number=Number(String(value||0).replace(/[$,]/g,''));
  return Number.isFinite(number)?number:0;
}

function reportZip(record) {
  const direct=String(record.zip||record.postal_code||record.mailing_zip||'').match(/\b\d{5}\b/)?.[0];
  if(direct)return direct;
  return String(record.property_address||record.street_address||record.mailing_address||'').match(/\b\d{5}\b/)?.[0]||'';
}

function reportJobForLead(lead) {
  return reportData.jobs.find(job=>
    (job.lead_id&&job.lead_id===lead.id)||
    (job.lead_number&&lead.lead_number&&String(job.lead_number)===String(lead.lead_number))
  )||null;
}

function reportLatestAppointment(leadId) {
  return reportData.appointments
    .filter(item=>item.lead_id===leadId&&!item.deleted_at)
    .sort((a,b)=>String(b.appointment_at||'').localeCompare(String(a.appointment_at||'')))[0]||null;
}

function reportRecordDate(row) {
  return String(row.report_date||row.lead_date||row.contract_date||row.created_at||'').slice(0,10);
}

function reportAddressParts(record) {
  return {
    street:record.mailing_street_address||record.mailing_address||record.street_address||record.property_address||'',
    city:record.mailing_city||record.city||'',
    state:record.mailing_state||record.state||'',
    zip:record.mailing_zip||record.zip||reportZip(record)
  };
}

function reportLeadRows() {
  return reportData.leads.filter(row=>!row.deleted_at).map(lead=>{
    const appointment=reportLatestAppointment(lead.id);
    const job=reportJobForLead(lead);
    return {...lead,
      report_name:leadName(lead),
      report_date:String(lead.lead_date||lead.created_at||'').slice(0,10),
      report_zip:reportZip(lead),
      report_type:lead.work_category||lead.lead_type||'',
      report_status:lead.lead_status||'',
      report_appointment_date:String(appointment?.appointment_at||'').slice(0,10),
      report_appointment_result:appointment?.appointment_result||'',
      report_job_number:job?.job_number||''
    };
  });
}

function directMailRows() {
  const badStatuses=new Set(['Bad/Invalid Lead','Duplicate/Existing Customer','No Longer Needs Service']);
  const prospects=reportData.prospects
    .filter(row=>!row.deleted_at&&!row.converted_to_lead_at&&!badStatuses.has(row.current_status)&&!row.do_not_mail)
    .map(row=>{
      const address=reportAddressParts(row);
      return {...row,...address,report_audience:'Prospect',report_name:prospectName(row),report_date:String(row.created_at||'').slice(0,10),report_type:row.work_category||'',report_status:row.current_status||'',spouse_name:row.spouse_name||''};
    });
  const pastLeads=reportData.leads
    .filter(row=>!row.deleted_at&&!row.do_not_mail&&!reportJobForLead(row)&&row.lead_status!=='Sold')
    .map(row=>{
      const address=reportAddressParts(row);
      return {...row,...address,report_audience:'Past Lead',report_name:leadName(row),report_date:String(row.lead_date||row.created_at||'').slice(0,10),report_type:row.work_category||row.lead_type||'',report_status:row.lead_status||''};
    });
  const deduped=new Map();
  [...prospects,...pastLeads].forEach(row=>{
    if(!row.street||!row.city||!row.state||!row.zip)return;
    const key=[row.street,row.city,row.state,row.zip].map(value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'')).join('|');
    const existing=deduped.get(key);
    if(!existing||row.report_audience==='Past Lead')deduped.set(key,row);
  });
  return [...deduped.values()].map(row=>({...row,
    greeting:row.spouse_name
      ? `${row.first_name||row.report_name} and ${row.spouse_name}`
      : (row.first_name||row.report_name)
  }));
}

function reportJobRows() {
  return reportData.jobs.filter(row=>!row.deleted_at).map(job=>({...job,
    report_name:job.customer_name||'',
    report_date:String(job.contract_date||job.created_at||'').slice(0,10),
    report_zip:reportZip(job),
    report_type:job.primary_job_type||job.job_type||'',
    report_status:job.stage||'',
    report_amount:reportJobAmount(job)
  }));
}

const REPORT_COLUMN_SETS={
  lead_list:[
    ['lead_number','Lead #'],['report_name','Homeowner'],['spouse_name','Spouse'],['street_address','Street Address'],['city','City'],['state','State'],['report_zip','ZIP'],['mailing_street_address','Mailing Address'],['mailing_city','Mailing City'],['mailing_state','Mailing State'],['mailing_zip','Mailing ZIP'],['subdivision','Subdivision'],['directions','Directions'],['phone','Phone'],['phone_secondary','Other Phone'],['email','Email'],['source','Source'],['referral_category','Referral Category'],['referral_detail','Referral Details'],['report_type','Lead Type'],['report_status','Status'],['assigned_to','Salesperson'],['taken_by','Taken By'],['report_date','Lead Date'],['insurance_related','Insurance Related'],['insurance_company','Insurance Company'],['shingle_age','Shingle Age'],['desired_work_timing','Desired Timing'],['roof_layers','Roof Layers'],['current_leak','Current Leak'],['current_leak_location','Current Leak Location'],['prior_leak','Prior Leak'],['prior_leak_location','Prior Leak Location'],['home_type','Home Type'],['roof_pitch','Roof Pitch'],['payment_plan','Payment Plan'],['report_appointment_date','Appointment Date'],['report_appointment_result','Appointment Result'],['estimate_status','Estimate Status'],['report_job_number','Job #']
  ],
  direct_mail:[
    ['report_audience','Record Type'],['first_name','First Name'],['last_name','Last Name'],['spouse_name','Spouse'],['greeting','Greeting'],['street','Street Address'],['city','City'],['state','State'],['zip','ZIP'],['source','Source'],['report_type','Lead Type'],['report_date','Inquiry Date']
  ],
  job_list:[
    ['job_number','Job #'],['lead_number','Lead #'],['report_name','Customer'],['property_address','Property Address'],['report_zip','ZIP'],['report_type','Job Type'],['report_status','Stage'],['salesperson','Salesperson'],['contract_date','Contract Date'],['report_amount','Contract Amount'],['material_type','Material'],['material_color','Color'],['target_start_date','Target Start'],['confirmed_start_date','Confirmed Start'],['expected_completion_date','Expected Completion']
  ],
  sales_by_type:[
    ['year','Year'],['job_type','Job Type'],['job_count','Jobs Sold'],['total_sales','Total Sales'],['average_sale','Average Job']
  ]
};

function reportColumnValue(row,key,forExcel=false) {
  const value=row[key]??'';
  if(['insurance_related','current_leak','prior_leak'].includes(key))return value===true?'Yes':value===false?'No':'';
  if(['report_date','lead_date','contract_date','report_appointment_date','target_start_date','confirmed_start_date','expected_completion_date'].includes(key))return reportDateOnly(value);
  if(['report_amount','total_sales','average_sale'].includes(key))return forExcel?Number(value||0):reportMoney(value);
  return value;
}

function uniqueReportValues(rows,key) {
  return [...new Set(rows.map(row=>String(row[key]||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
}

function setReportSelect(id,values,allLabel='All') {
  const control=$(id);
  control.innerHTML=`<option value="">${esc(allLabel)}</option>`+values.map(value=>`<option value="${esc(value)}">${esc(value)}</option>`).join('');
}

function reportTypeRows(type) {
  if(type==='lead_list')return reportLeadRows();
  if(type==='direct_mail')return directMailRows();
  return reportJobRows();
}

function configureReportControls() {
  const type=$('reportType').value;
  const base=reportTypeRows(type);
  const filterOne=$('reportFilterOneLabel');
  const filterTwo=$('reportFilterTwoLabel');
  const filterThree=$('reportFilterThreeLabel');
  let sorts=[];

  if(type==='lead_list'){
    filterOne.textContent='Source';filterTwo.textContent='Lead type';filterThree.textContent='Status';
    setReportSelect('reportFilterOne',uniqueReportValues(base,'source'),'All sources');
    setReportSelect('reportFilterTwo',uniqueReportValues(base,'report_type'),'All lead types');
    setReportSelect('reportFilterThree',uniqueReportValues(base,'report_status'),'All statuses');
    sorts=[['report_date','Lead date'],['report_name','Homeowner'],['report_zip','ZIP'],['source','Source'],['report_type','Lead type'],['report_status','Status']];
  }else if(type==='direct_mail'){
    filterOne.textContent='Audience';filterTwo.textContent='Source';filterThree.textContent='Lead type';
    setReportSelect('reportFilterOne',uniqueReportValues(base,'report_audience'),'Prospects and past leads');
    setReportSelect('reportFilterTwo',uniqueReportValues(base,'source'),'All sources');
    setReportSelect('reportFilterThree',uniqueReportValues(base,'report_type'),'All lead types');
    sorts=[['last_name','Last name'],['report_zip','ZIP'],['report_date','Inquiry date'],['source','Source'],['report_type','Lead type']];
  }else if(type==='sales_by_type'){
    filterOne.textContent='Year';filterTwo.textContent='Job type';filterThree.textContent='Salesperson';
    setReportSelect('reportFilterOne',uniqueReportValues(base.map(row=>({...row,year:reportRecordDate(row).slice(0,4)})),'year'),'All years');
    setReportSelect('reportFilterTwo',uniqueReportValues(base,'report_type'),'All job types');
    setReportSelect('reportFilterThree',uniqueReportValues(base,'salesperson'),'All salespeople');
    sorts=[['year','Year'],['job_type','Job type'],['total_sales','Total sales'],['job_count','Jobs sold']];
  }else{
    filterOne.textContent='Stage';filterTwo.textContent='Job type';filterThree.textContent='Salesperson';
    setReportSelect('reportFilterOne',uniqueReportValues(base,'report_status'),'All stages');
    setReportSelect('reportFilterTwo',uniqueReportValues(base,'report_type'),'All job types');
    setReportSelect('reportFilterThree',uniqueReportValues(base,'salesperson'),'All salespeople');
    sorts=[['report_date','Contract date'],['job_number','Job #'],['report_name','Customer'],['report_zip','ZIP'],['report_type','Job type'],['report_status','Stage'],['salesperson','Salesperson'],['report_amount','Contract amount']];
  }

  $('reportSort').innerHTML=sorts.map(([value,label])=>`<option value="${value}">${esc(label)}</option>`).join('');
  $('reportDirection').value=['lead_list','job_list','sales_by_type'].includes(type)?'desc':'asc';
  const columns=REPORT_COLUMN_SETS[type];
  $('reportColumns').innerHTML=columns.map(([key,label])=>`<label class="report-column"><input type="checkbox" value="${esc(key)}" checked><span>${esc(label)}</span></label>`).join('');
  $('reportColumnsWrap').classList.toggle('hidden',false);
  $('reportPreview').innerHTML='';
  $('reportStatus').textContent='Choose filters, preview the report, then export it to Excel.';
}

function selectedReportColumns() {
  const selected=new Set([...document.querySelectorAll('#reportColumns input:checked')].map(input=>input.value));
  return (REPORT_COLUMN_SETS[$('reportType').value]||[]).filter(([key])=>selected.has(key));
}

function filteredReportBaseRows() {
  const type=$('reportType').value;
  let rows=reportTypeRows(type);
  const one=$('reportFilterOne').value;
  const two=$('reportFilterTwo').value;
  const three=$('reportFilterThree').value;
  const zip=$('reportZip').value.trim();
  const from=$('reportDateFrom').value;
  const to=$('reportDateTo').value;
  rows=rows.filter(row=>{
    const date=reportRecordDate(row);
    if(type==='sales_by_type'&&/cancel/i.test(String(row.report_status||'')))return false;
    if(zip&&reportZip(row)!==zip)return false;
    if(from&&date&&date<from)return false;
    if(to&&date&&date>to)return false;
    if(type==='lead_list'&&((one&&row.source!==one)||(two&&row.report_type!==two)||(three&&row.report_status!==three)))return false;
    if(type==='direct_mail'&&((one&&row.report_audience!==one)||(two&&row.source!==two)||(three&&row.report_type!==three)))return false;
    if(type==='job_list'&&((one&&row.report_status!==one)||(two&&row.report_type!==two)||(three&&row.salesperson!==three)))return false;
    if(type==='sales_by_type'&&((one&&date.slice(0,4)!==one)||(two&&row.report_type!==two)||(three&&row.salesperson!==three)))return false;
    return true;
  });
  return rows;
}

function buildCurrentReport() {
  const type=$('reportType').value;
  const base=filteredReportBaseRows();
  reportDetailRows=base;
  if(type==='sales_by_type'){
    const groups=new Map();
    base.forEach(job=>{
      const year=reportRecordDate(job).slice(0,4)||'No date';
      const jobType=job.report_type||'Not entered';
      const key=year+'|'+jobType;
      const group=groups.get(key)||{year,job_type:jobType,job_count:0,total_sales:0,average_sale:0};
      group.job_count++;
      group.total_sales+=job.report_amount||0;
      group.average_sale=group.job_count?group.total_sales/group.job_count:0;
      groups.set(key,group);
    });
    reportRows=[...groups.values()];
  }else reportRows=base;

  const sortKey=$('reportSort').value;
  const direction=$('reportDirection').value==='desc'?-1:1;
  reportRows.sort((a,b)=>{
    const av=a[sortKey]??'',bv=b[sortKey]??'';
    if(typeof av==='number'||typeof bv==='number')return (Number(av||0)-Number(bv||0))*direction;
    return String(av).localeCompare(String(bv),undefined,{numeric:true})*direction;
  });
  return reportRows;
}

function previewCurrentReport() {
  const rows=buildCurrentReport();
  const columns=selectedReportColumns();
  if(!columns.length){$('reportStatus').textContent='Select at least one column.';$('reportPreview').innerHTML='';return;}
  if(!rows.length){$('reportStatus').textContent='No records match these filters.';$('reportPreview').innerHTML='<div class="report-empty">No matching records.</div>';return;}
  const head=columns.map(([,label])=>`<th>${esc(label)}</th>`).join('');
  const body=rows.slice(0,200).map(row=>`<tr>${columns.map(([key])=>`<td class="${['report_amount','total_sales','average_sale','job_count'].includes(key)?'report-number':''}">${esc(reportColumnValue(row,key,false))}</td>`).join('')}</tr>`).join('');
  $('reportPreview').innerHTML=`<table class="report-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  const amountMissing=$('reportType').value==='sales_by_type'&&reportDetailRows.length&&!reportDetailRows.some(row=>row.report_amount);
  $('reportStatus').textContent=`${rows.length} ${rows.length===1?'row':'rows'} ready.${rows.length>200?' Preview shows the first 200.':''}${amountMissing?' Contract amounts are not stored on current jobs yet, so this report currently shows job counts.':''}`;
}

function excelRowsForReport(rows,columns) {
  return rows.map(row=>Object.fromEntries(columns.map(([key,label])=>[label,reportColumnValue(row,key,true)])));
}

function exportCurrentReport() {
  if(typeof XLSX==='undefined')return msg('Excel export could not load. Refresh Bauer Roofing Operations and try again.','error');
  previewCurrentReport();
  const columns=selectedReportColumns();
  if(!reportRows.length||!columns.length)return;
  const workbook=XLSX.utils.book_new();
  const type=$('reportType').value;
  XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet(excelRowsForReport(reportRows,columns)),type==='direct_mail'?'Direct Mail':type==='sales_by_type'?'Sales Summary':type==='job_list'?'Jobs':'Leads');
  if(type==='sales_by_type'){
    const detailColumns=REPORT_COLUMN_SETS.job_list;
    XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet(excelRowsForReport(reportDetailRows,detailColumns)),'Job Detail');
  }
  const date=new Date().toLocaleDateString('en-CA',{timeZone:'America/New_York'});
  const name={lead_list:'Leads-Report',direct_mail:'Direct-Mail',job_list:'Jobs-Report',sales_by_type:'Sales-by-Year-and-Job-Type'}[type]||'Mission-Control-Report';
  XLSX.writeFile(workbook,`${name}-${date}.xlsx`);
  $('reportStatus').textContent=`Exported ${reportRows.length} ${reportRows.length===1?'row':'rows'} to Excel.`;
}

async function openReports(context) {
  reportContext=context;
  $('reportDialogTitle').textContent=context==='leads'?'Lead Reports':'Job Reports';
  $('reportDialogDescription').textContent=context==='leads'
    ? 'Sort and export Leads, or create a deduplicated direct-mail list from Prospects and past Leads that did not convert.'
    : 'Sort and export Jobs, or review sales by contract year and primary job type.';
  $('reportType').innerHTML=context==='leads'
    ? '<option value="lead_list">Lead List</option><option value="direct_mail">Direct Mail — Prospects & Past Leads</option>'
    : '<option value="job_list">Job List</option><option value="sales_by_type">Sales by Year & Job Type</option>';
  $('reportStatus').textContent='Loading all records…';
  $('reportPreview').innerHTML='';
  $('reportDialog').showModal();
  try{
    const [leads,prospects,jobs,appointments]=await Promise.all([
      fetchEveryReportRow('leads','created_at'),fetchEveryReportRow('prospects','created_at'),fetchEveryReportRow('jobs','created_at'),fetchEveryReportRow('appointments','appointment_at')
    ]);
    reportData={leads,prospects,jobs,appointments};
    configureReportControls();
  }catch(error){
    $('reportStatus').textContent='Could not load report records: '+(error.message||String(error));
  }
}

const esc = v =>
  String(v ?? '').replace(
    /[&<>"']/g,
    c =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[c])
  );

const todayISO = () =>
  new Date().toLocaleDateString(
    'en-CA',
    { timeZone: 'America/New_York' }
  );

const localNow = () =>
  new Intl.DateTimeFormat(
    'en-US',
    {
      timeZone: 'America/New_York',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }
  ).format(new Date());


function msg(text, type = '') {
  const e = $('systemMsg');

  e.textContent = text;
  e.className = 'notice ' + type;
  e.classList.remove('hidden');

  setTimeout(
    () => e.classList.add('hidden'),
    5000
  );
}


function authMsg(text, type = '') {
  const e = $('loginMsg');

  e.textContent = text;
  e.className = 'notice ' + type;
  e.classList.remove('hidden');
}


function setView(name) {
  document
    .querySelectorAll('[id^="view-"]')
    .forEach(x =>
      x.classList.toggle(
        'hidden',
        x.id !== `view-${name}`
      )
    );

  document
    .querySelectorAll('#nav button')
    .forEach(x =>
      x.classList.toggle(
        'active',
        x.dataset.view === name
      )
    );

  if (name === 'angi') {
    renderAngiQueue();
  }

  if (name === 'leads') {
    renderProspectsLeads();
  }

  if (name === 'playbook') {
    renderSops();
  }

  if (name === 'suggestions') {
    renderSuggestions();
  }
}

function applyUrlNavigation(){
  if(urlNavigationApplied) return;
  const params=new URLSearchParams(window.location.search);
  const requestedView=params.get('view');
  const requestedLead=params.get('lead');
  const requestedJob=params.get('job');

  if(requestedLead){
    const lead=state.leads.find(item=>item.id===requestedLead);
    if(lead){
      selectedLeadId=lead.id;
      setView('leads');
      renderProspectsLeads();
      urlNavigationApplied=true;
      if(params.get('edit')==='1') setTimeout(()=>openLeadEdit(lead.id),0);
      return;
    }
  }

  if(requestedJob){
    const job=state.jobs.find(item=>item.id===requestedJob);
    if(job){
      setView('jobs');
      renderJobs();
      urlNavigationApplied=true;
      setTimeout(()=>openJobEdit(job.id),0);
      return;
    }
  }

  const allowedViews=['today','phone','angi','leads','jobs','playbook','suggestions'];
  if(requestedView&&allowedViews.includes(requestedView)) setView(requestedView);
  urlNavigationApplied=true;
}


function empty(text) {
  return `<p class="empty">${esc(text)}</p>`;
}


function dueStamp(t) {
  return [
    t.due_date,
    t.due_time
  ]
    .filter(Boolean)
    .join(' ');
}

function formatDueDateTime(dateValue,timeValue) {
  const date=String(dateValue||'').trim();
  const time=String(timeValue||'').trim();
  let formattedDate='';
  let formattedTime='';
  const dateParts=date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(dateParts)formattedDate=`${dateParts[2]}/${dateParts[3]}/${dateParts[1]}`;
  else if(date)formattedDate=date;
  const timeParts=time.match(/^(\d{1,2}):(\d{2})/);
  if(timeParts){
    const hour=Number(timeParts[1]);
    formattedTime=`${hour%12||12}:${timeParts[2]} ${hour>=12?'pm':'am'}`;
  }else if(time)formattedTime=time;
  if(formattedTime&&formattedDate)return `${formattedTime} on ${formattedDate}`;
  return formattedTime||formattedDate;
}


function priorityRank(p) {
  return p === 'Critical'
    ? 3
    : p === 'High'
    ? 2
    : 1;
}


function resolveRelatedNumber(value) {
  const relatedNumber =
    String(value || '').trim();

  if (!relatedNumber) {
    return {
      related_number: null,
      lead_number: null,
      job_number: null
    };
  }

  const normalized =
    relatedNumber.toLowerCase();

  const jobMatch =
    state.jobs.find(j =>
      String(j.job_number || '')
        .trim()
        .toLowerCase() === normalized
    );

  if (jobMatch) {
    return {
      related_number: relatedNumber,
      lead_number: null,
      job_number:
        String(jobMatch.job_number || relatedNumber)
          .trim()
    };
  }

  const directLeadMatch =
    state.leads.find(l =>
      String(l.lead_number || '')
        .trim()
        .toLowerCase() === normalized
    );

  if (directLeadMatch) {
    return {
      related_number: relatedNumber,
      lead_number:
        String(directLeadMatch.lead_number || relatedNumber)
          .trim(),
      job_number: null
    };
  }

  const jobLeadMatch =
    state.jobs.find(j =>
      String(j.lead_number || '')
        .trim()
        .toLowerCase() === normalized
    );

  if (jobLeadMatch) {
    return {
      related_number: relatedNumber,
      lead_number:
        String(jobLeadMatch.lead_number || relatedNumber)
          .trim(),
      job_number: null
    };
  }

  return {
    related_number: relatedNumber,
    lead_number: null,
    job_number: null
  };
}


function relatedLabel(item) {
  if (item.job_number) {
    return 'Job # ' + esc(item.job_number);
  }

  if (item.lead_number) {
    return 'Lead # ' + esc(item.lead_number);
  }

  if (item.related_number) {
    return 'Related # ' + esc(item.related_number);
  }

  return '';
}


function taskCard(t) {
  const progress =
    t.progress_total
      ? ` • <b>${esc(t.progress_current || 0)} of ${esc(t.progress_total)}</b>`
      : '';

  const skipButton =
    t.recurring_rule_id
      ? '<button class="btn small" data-action="skip">Skip</button>'
      : '';

  return `
    <div
      class="task"
      data-task-id="${esc(t.id)}"
    >

      <div class="task-title">

        <b>${esc(t.task)}</b>

        <span class="badge ${esc(t.base_priority)}">
          ${esc(t.base_priority)}
        </span>

      </div>

      <div class="meta">

        ${esc(t.status)}

        ${progress}

        ${
          t.next_action
            ? ' • Next: ' + esc(t.next_action)
            : ''
        }

        ${
          dueStamp(t)
            ? ' • Due ' + esc(dueStamp(t))
            : ''
        }

        ${
          relatedLabel(t)
            ? ' • ' + relatedLabel(t)
            : ''
        }

      </div>

      ${
        t.description
          ? `<div>${esc(t.description)}</div>`
          : ''
      }

      <div class="actions">

        <button
          class="btn primary small"
          data-action="start">
          Start
        </button>

        <button
          class="btn small"
          data-action="pause">
          Pause
        </button>

        <button
          class="btn small"
          data-action="resume">
          Resume
        </button>

        <button
          class="btn small"
          data-action="complete">
          Complete
        </button>

        ${skipButton}

        <button
          class="btn small"
          data-action="block">
          Block
        </button>

      </div>

    </div>
  `;
}



function isFinancialTask(t) {
  if (!t || !activeRow(t) || isCommunicationTask(t)) return false;
  if(t.category==='Financial / QuickBooks') return true;
  if(t.category==='Needs Your Attention') return false;
  const allText = [t.task, t.description, t.category, t.next_action].filter(Boolean).join(' ').toLowerCase();
  return /\b(quickbooks|payroll|withholding|tax(?:es)?|credit card|bill(?:s)?|invoice|deposit|bank|expense|reconcil|accounting|bookkeep|payment processing)\b/.test(allText);
}

function openUnblockedTask(t) {
  return activeRow(t)
    && !['Completed','Cancelled','Skipped','Blocked','Waiting','In Progress'].includes(t.status);
}

function financialTasks() {
  return state.tasks.filter(t => openUnblockedTask(t) && isFinancialTask(t)).sort((a,b) => {
    const ad = `${a.due_date || '9999'} ${a.due_time || '23:59:59'}`;
    const bd = `${b.due_date || '9999'} ${b.due_time || '23:59:59'}`;
    if (ad !== bd) return ad.localeCompare(bd);
    return priorityRank(b.base_priority) - priorityRank(a.base_priority);
  });
}

function renderQuickNotes() {
  if (!$('quickNotesList')) return;
  const rows = (state.quick_notes || []).filter(n => !n.deleted_at).sort((a,b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')));
  $('quickNotesList').innerHTML = rows.map(n => `
    <div class="task" data-quick-note-id="${esc(n.id)}">
      <div>${esc(n.note).replace(/\n/g,'<br>')}</div>
      <div class="meta">${esc(new Date(n.updated_at || n.created_at).toLocaleString())}</div>
      <div class="actions">
        <button class="btn small" data-edit-quick-note="${esc(n.id)}">Edit</button>
        <button class="btn small" data-note-to-task="${esc(n.id)}">Convert to Task</button>
        <button class="btn small" data-delete-quick-note="${esc(n.id)}">Delete</button>
      </div>
    </div>`).join('') || empty('No notes yet.');
}

function clearQuickNoteForm() {
  if (!$('quickNoteEditId')) return;
  $('quickNoteEditId').value = '';
  $('quickNoteText').value = '';
  $('saveQuickNoteBtn').textContent = 'Add Note';
  $('cancelQuickNoteEditBtn').classList.add('hidden');
}

async function saveQuickNote() {
  try {
    const id = $('quickNoteEditId').value;
    const note = $('quickNoteText').value.trim();
    if (!note) return msg('Write a note first.','error');
    const result = id
      ? await db.from('quick_notes').update({note}).eq('id',id)
      : await db.from('quick_notes').insert({note});
    if (result.error) throw result.error;
    clearQuickNoteForm();
    await loadAll();
    msg(id ? 'Note updated.' : 'Note saved.','success');
  } catch(error) { msg('Could not save note: ' + (error.message || String(error)),'error'); }
}

async function deleteQuickNote(id) {
  if (!confirm('Delete this note?')) return;
  try {
    const r = await db.from('quick_notes').update({deleted_at:new Date().toISOString()}).eq('id',id);
    if (r.error) throw r.error;
    await loadAll();
    msg('Note deleted.','success');
  } catch(error) { msg('Could not delete note: ' + (error.message || String(error)),'error'); }
}

function convertQuickNoteToTask(id) {
  const n = (state.quick_notes || []).find(x => x.id === id);
  if (!n) return;
  clearTaskForm();
  $('taskName').value = n.note.split(/\n/)[0].slice(0,140);
  $('taskDescription').value = n.note;
  $('taskDialog').showModal();
}

function actionableTasks() {
  const finished = new Set([
    'Completed',
    'Cancelled',
    'Skipped'
  ]);

  return state.tasks
    .filter(t =>
      !finished.has(t.status) &&
      t.status !== 'In Progress' &&
      ![
        'Blocked',
        'Waiting'
      ].includes(t.status)
    )
    .sort((a, b) => {

      const priorityDifference =
        priorityRank(b.base_priority) -
        priorityRank(a.base_priority);

      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      return String(a.due_date || '9999')
        .localeCompare(
          String(b.due_date || '9999')
        );
    });
}


function currentTask() {
  return (
    state.tasks.find(
      t => t.status === 'In Progress'
    ) || null
  );
}


function startOfWeek() {
  const d = new Date();
  const day = d.getDay();

  d.setDate(
    d.getDate() - day
  );

  d.setHours(
    0,
    0,
    0,
    0
  );

  return d;
}


function endOfWeek() {
  const d = startOfWeek();

  d.setDate(
    d.getDate() + 7
  );

  return d;
}


function jobsThisWeek() {
  const start = startOfWeek();
  const end = endOfWeek();

  return state.jobs.filter(j => {

    if (!activeRow(j) || jobIsCancelled(j)) {
      return false;
    }

    const value =
      j.confirmed_start_date ||
      j.target_start_date;

    if (!value) {
      return false;
    }

    const date =
      new Date(
        value + 'T12:00:00'
      );

    return (
      date >= start &&
      date < end
    );
  });
}


function commDueSoon() {
  const d = new Date();

  d.setDate(
    d.getDate() + 2
  );

  const end =
    d.toLocaleDateString(
      'en-CA',
      {
        timeZone:
          'America/New_York'
      }
    );

  return state.communications
    .filter(c =>
      c.status !== 'Completed' &&
      c.due_date &&
      c.due_date <= end
    )
    .sort((a, b) =>
      String(a.due_date)
        .localeCompare(
          String(b.due_date)
        )
    );
}


function renderDashboard() {
  $('nowText').textContent = localNow();

  const cur = currentTask();

  $('currentTask').innerHTML = cur
    ? `
      <div class="card critical">
        <h2>Current / Resume</h2>
        ${taskCard(cur)}
      </div>
    `
    : '';

  const acts = actionableTasks();

  $('taskList').innerHTML =
    acts.map(taskCard).join('') ||
    empty('Nothing urgent right now.');

  const blocked = state.tasks.filter(t =>
    ['Blocked', 'Waiting'].includes(t.status)
  );

  $('blockedList').innerHTML =
    blocked.map(taskCard).join('') ||
    empty('None.');

  const jw = jobsThisWeek();

  $('weekJobs').innerHTML =
    jw.map(j => `
      <div class="task">
        <b>${esc(j.customer_name || 'Unnamed customer')}</b>

        <div class="meta">
          ${esc(j.property_address || '')}
          • ${esc(j.stage)}
          • Start ${esc(
            j.confirmed_start_date ||
            j.target_start_date ||
            'Not set'
          )}
        </div>
      </div>
    `).join('') ||
    empty('No jobs entered for this week yet.');

  const comms = commDueSoon();

  $('commList').innerHTML =
    comms.map(c => `
      <div class="task">
        <b>${esc(c.purpose)}</b>

        <div class="meta">
          Job ${esc(c.job_id || '')}
          • ${esc(c.status)}
          • Due ${esc(
            [c.due_date, c.due_time]
              .filter(Boolean)
              .join(' ')
          )}
        </div>
      </div>
    `).join('') ||
    empty('No communication due in the next two days.');

  const td = todayISO();

  const isOpen = t =>
    ![
      'Completed',
      'Cancelled',
      'Skipped'
    ].includes(t.status);

  $('kpiCritical').textContent =
    state.tasks.filter(t =>
      isOpen(t) &&
      (
        t.base_priority === 'Critical' ||
        (t.due_date && t.due_date < td)
      )
    ).length;

  $('kpiDue').textContent =
    state.tasks.filter(t =>
      isOpen(t) &&
      t.due_date === td
    ).length;

  $('kpiComms').textContent =
    comms.length;

  $('kpiWeekJobs').textContent =
    jw.length;

  renderPhone();
  renderJobs();
}


function renderIncoming() {
  $('incomingList').innerHTML =
    state.incoming
      .slice(0, 30)
      .map(i => `
        <div class="task">

          ${esc(i.description)}

          <div class="meta">

            ${esc(i.source || '')}

            •

            ${esc(
              new Date(
                i.captured_at
              ).toLocaleString()
            )}

            •

            ${esc(i.status)}

          </div>

        </div>
      `)
      .join('')
    ||
    empty('None.');
}


function renderPhone() {
  $('phoneHistory').innerHTML =
    state.phone
      .slice(0, 30)
      .map(p => `
        <div class="task">

          <b>
            ${esc(
              p.caller_name ||
              'Unknown caller'
            )}
          </b>

          <div class="meta">

            ${esc(p.phone || '')}

            •

            ${esc(
              p.called_for ||
              ''
            )}

            ${
              relatedLabel(p)
                ? ' • ' + relatedLabel(p)
                : ''
            }

            •

            ${esc(
              new Date(
                p.created_at
              ).toLocaleString()
            )}

          </div>

          <div>
            ${esc(
              p.reason_message ||
              ''
            )}
          </div>

        </div>
      `)
      .join('')
    ||
    empty(
      'No messages yet.'
    );
}


function lookupValues(category, fallback = []) {
  const rows = state.lookups
    .filter(x => x.category === category && x.is_active !== false)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  return rows.length ? rows : fallback.map((value, i) => ({
    value,
    sort_order: i + 1,
    is_default: i === 0
  }));
}


function fillSelect(id, category, fallback = [], blankLabel = '') {
  const el = $(id);
  if (!el) return;

  const options = lookupValues(category, fallback);
  const current = el.value;

  el.innerHTML =
    (blankLabel ? `<option value="">${esc(blankLabel)}</option>` : '') +
    options.map(o => `<option value="${esc(o.value)}">${esc(o.value)}</option>`).join('');

  const def = options.find(o => o.is_default);

  if (current && options.some(o => o.value === current)) {
    el.value = current;
  } else if (def) {
    el.value = def.value;
  }
}


function setupLeadProspectSelects() {
  fillSelect('prospectSource', 'prospect_source', ['Angi', 'Referral', 'Website', 'Google', 'Repeat Customer', 'Call-In', 'Other']);
  fillSelect('prospectSourceAccount', 'angi_source_account', ['Bauer Roofing - PPL', 'Bauer Roofing Inc - Angi Ads'], 'Choose account');
  fillSelect('prospectStatus', 'prospect_status', ['New', 'Attempting Contact', 'Connected', 'Waiting on Customer', 'Appointment Set', 'Unable to Reach', 'Not Interested']);
  fillSelect('prospectAssignedTo', 'assigned_to', ['Roy', 'Eve', 'Dad']);

  fillSelect('leadSource', 'prospect_source', ['Angi', 'Referral', 'Website', 'Google', 'Repeat Customer', 'Call-In', 'Other']);
  fillSelect('leadSourceAccount', 'angi_source_account', ['Bauer Roofing - PPL', 'Bauer Roofing Inc - Angi Ads'], 'Choose account');
  fillSelect('leadAssignedTo', 'assigned_to', ['Roy', 'Eve', 'Dad']);
  fillSelect('leadEstimateStatus', 'estimate_status', ['Not Known', 'Expected', 'Sent', 'Customer Says Not Received', 'Resent']);
  fillSelect('leadMarketSharpStatus', 'marketsharp_status', ['Automatic', 'Not Needed Yet', 'Needs Entry', 'Added', 'Already There']);

  toggleAngiFields('prospect');
  toggleAngiFields('lead');
}


function toggleAngiFields(prefix) {
  const source = $(`${prefix}Source`);
  const wrap = $(`${prefix}AngiAccountWrap`);
  if (!source || !wrap) return;

  wrap.classList.toggle('hidden', source.value !== 'Angi');
}


function formatWhen(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString();
}


function prospectName(p) {
  return p.customer_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unnamed prospect';
}


function leadName(l) {
  return l.homeowner_name || [l.first_name, l.last_name].filter(Boolean).join(' ') || 'Unnamed lead';
}



function angiImportKey(sourceAccount, sourceReference) {
  return `${String(sourceAccount || '').trim().toLowerCase()}|${String(sourceReference || '').trim()}`;
}

function sanitizeHistoricalTimestamp(value) {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value).trim();
  // Excel time-only placeholders such as 00:00:00 are not valid timestamptz values.
  if (/^\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(s)) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function sanitizeHistoricalProspectRow(raw) {
  const row = {...raw};
  for (const key of ['received_at','last_attempt_at','next_follow_up_at','last_communication_at','converted_to_lead_at','created_at','updated_at','archived_at','deleted_at']) {
    if (key in row) row[key] = sanitizeHistoricalTimestamp(row[key]);
  }
  return row;
}

async function importAngiHistoricalPackage() {
  const file = $('angiHistoricalImportFile')?.files?.[0];
  const status = $('angiHistoricalImportStatus');
  if (!file) return msg('Choose the historical Angi migration JSON file.','error');
  try {
    status.textContent = 'Reading reconciled Angi history package…';
    const pkg = JSON.parse(await file.text());
    if (pkg.package_type !== 'bauer_angi_historical_migration_v1') throw new Error('This is not the Bauer Angi historical migration package.');
    if (!pkg.safety?.historical_import || pkg.safety?.send_initial_text || pkg.safety?.send_initial_email) throw new Error('Historical-import safety check failed.');

    const prospectMap = new Map();
    for (const p of state.prospects.filter(x => x.source === 'Angi' && x.source_reference)) {
      prospectMap.set(angiImportKey(p.source_account,p.source_reference), p);
    }

    let prospectsAdded = 0, prospectsExisting = 0;
    for (const raw of pkg.prospects || []) {
      const key = angiImportKey(raw.source_account,raw.source_reference);
      let existing = prospectMap.get(key);
      if (!existing) {
        const row = sanitizeHistoricalProspectRow(raw);
        delete row._archive_flag_raw; delete row._appointment_at; delete row._historical_attempts; delete row._historical_review_only;
        const r = await db.from('prospects').insert(row).select().single();
        if (r.error) throw r.error;
        existing = r.data;
        prospectMap.set(key, existing);
        prospectsAdded++;
      } else {
        // The earlier migration created these prospect rows, but some operational
        // Angi fields were not reconciled. Refresh only tracker-derived fields so
        // the work queue can correctly recognize active calls while preserving
        // Bauer Roofing Operations notes and other user-entered history.
        const sync = {
          source: raw.source || existing.source || 'Angi',
          source_account: raw.source_account || existing.source_account || null,
          source_reference: raw.source_reference || existing.source_reference || null,
          received_at: sanitizeHistoricalTimestamp(raw.received_at) || existing.received_at || null,
          first_name: raw.first_name || existing.first_name || null,
          last_name: raw.last_name || existing.last_name || null,
          customer_name: raw.customer_name || existing.customer_name || null,
          phone: raw.phone || existing.phone || null,
          email: raw.email || existing.email || null,
          street_address: raw.street_address || existing.street_address || null,
          city: raw.city || existing.city || null,
          state: raw.state || existing.state || null,
          zip: raw.zip || existing.zip || null,
          work_category: raw.work_category || existing.work_category || null,
          current_status: raw.current_status || existing.current_status || 'New',
          attempts_count: raw.attempts_count ?? existing.attempts_count ?? 0,
          next_follow_up_at: sanitizeHistoricalTimestamp(raw.next_follow_up_at),
          next_action: raw.next_action || existing.next_action || null,
          last_result: raw.last_result || existing.last_result || null,
          duplicate_flag: raw.duplicate_flag ?? existing.duplicate_flag ?? false,
          duplicate_resolution: raw.duplicate_resolution || existing.duplicate_resolution || null,
          archive_flag: raw.archive_flag ?? existing.archive_flag ?? false
        };
        const ur = await db.from('prospects').update(sync).eq('id', existing.id).select().single();
        if (ur.error) throw ur.error;
        existing = ur.data;
        prospectMap.set(key, existing);
        prospectsExisting++;
      }
      const safe = await db.rpc('angi_mark_historical_import',{p_prospect_id:existing.id});
      if (safe.error) throw safe.error;
    }

    let communicationsAdded = 0, communicationsSkipped = 0;
    for (const c of pkg.communications || []) {
      const p = prospectMap.get(angiImportKey(c.source_account,c.source_reference));
      if (!p) continue;
      if (c.external_log_id) {
        const found = await db.from('sales_communications').select('id').eq('external_log_id',c.external_log_id).limit(1);
        if (found.error) throw found.error;
        if (found.data?.length) { communicationsSkipped++; continue; }
      }
      const row = {...c, prospect_id:p.id};
      for (const key of ['communication_at','created_at','updated_at','follow_up_at','next_follow_up_at']) { if (key in row) row[key] = sanitizeHistoricalTimestamp(row[key]); }
      delete row.source_reference; delete row.source_account;
      const r = await db.from('sales_communications').insert(row);
      if (r.error) throw r.error;
      communicationsAdded++;
    }

    let appointmentsAdded = 0, appointmentsSkipped = 0, leadsCreated = 0;
    const leadByProspect = new Map(state.leads.filter(l => l.prospect_id).map(l => [l.prospect_id,l]));
    for (const a of pkg.appointments || []) {
      const p = prospectMap.get(angiImportKey(a.source_account,a.source_reference));
      if (!p) continue;
      const found = await db.from('appointments').select('id').eq('external_import_key',a.external_import_key).limit(1);
      if (found.error) throw found.error;
      if (found.data?.length) { appointmentsSkipped++; continue; }

      let lead = leadByProspect.get(p.id);
      if (!lead) {
        const lr = await db.from('leads').insert({
          prospect_id:p.id, source:'Angi', source_account:a.source_account, source_reference:a.source_reference,
          import_source:'Angi Historical Tracker', homeowner_name:a.customer_name || p.customer_name,
          first_name:p.first_name, last_name:p.last_name, street_address:a.street_address || p.street_address,
          city:a.city || p.city, state:a.state || p.state, zip:a.zip || p.zip, phone:a.phone || p.phone,
          email:a.email || p.email, work_category:a.work_category || p.work_category,
          lead_status:a.appointment_at ? 'Appointment Scheduled' : 'Appointment Wanted', assigned_to:a.assigned_to || p.assigned_to,
          qualified_at:sanitizeHistoricalTimestamp(a.created_at) || sanitizeHistoricalTimestamp(a.appointment_at) || p.received_at || new Date().toISOString(), notes:a.notes || null
        }).select().single();
        if (lr.error) throw lr.error;
        lead = lr.data; leadByProspect.set(p.id,lead); leadsCreated++;
      }
      const ar = await db.from('appointments').insert({
        lead_id:lead.id, prospect_id:p.id, appointment_at:sanitizeHistoricalTimestamp(a.appointment_at), appointment_status:a.appointment_status || 'Scheduled',
        appointment_type:a.appointment_type || 'Measure & Presentation', assigned_to:a.assigned_to, notes:a.notes, marketsharp_status:a.marketsharp_status || 'Not Needed Yet',
        marketsharp_action:a.marketsharp_action, import_source:'Angi Historical Tracker', external_import_key:a.external_import_key,
        created_at:sanitizeHistoricalTimestamp(a.created_at) || undefined, updated_at:sanitizeHistoricalTimestamp(a.updated_at) || undefined
      });
      if (ar.error) throw ar.error;
      const pr = await db.from('prospects').update({converted_to_lead_at:sanitizeHistoricalTimestamp(a.created_at) || sanitizeHistoricalTimestamp(a.appointment_at) || new Date().toISOString()}).eq('id',p.id);
      if (pr.error) throw pr.error;
      appointmentsAdded++;
    }

    await loadAll();
    $('angiHistoricalImportFile').value = '';
    status.textContent = `Historical migration complete: ${prospectsAdded} prospects added (${prospectsExisting} already present), ${communicationsAdded} communications added (${communicationsSkipped} already present), ${leadsCreated} leads created, ${appointmentsAdded} appointments added (${appointmentsSkipped} already present). No automatic first-contact texts or emails were sent.`;
    renderAngiQueue();
    msg('Angi history reconciled safely. Appointment-set and closed records stay out of the call queue.','success');
  } catch(error) {
    status.textContent = '';
    msg('Could not import existing Angi history: ' + (error.message || String(error)),'error');
  }
}

function renderProspectsLeads() {
  if (!$('prospectList')) return;

  const now = new Date();
  const activeProspects = state.prospects.filter(p => !p.archive_flag && !p.converted_to_lead_at);
  const followupsDue = activeProspects.filter(p => p.next_follow_up_at && new Date(p.next_follow_up_at) <= now);
  const activeLeads = state.leads.filter(l => !['Sold', 'Not Moving Forward'].includes(l.lead_status));
  const upcomingAppointments = state.appointments
    .filter(a => a.appointment_at && new Date(a.appointment_at) >= now && !['Cancelled', 'Completed'].includes(a.appointment_status))
    .sort((a, b) => new Date(a.appointment_at) - new Date(b.appointment_at));

  $('kpiProspects').textContent = activeProspects.length;
  $('kpiProspectDue').textContent = followupsDue.length;
  $('kpiLeads').textContent = activeLeads.length;
  $('kpiAppointments').textContent = upcomingAppointments.length;

  $('prospectList').innerHTML = activeProspects
    .slice()
    .sort((a, b) => String(a.next_follow_up_at || '9999').localeCompare(String(b.next_follow_up_at || '9999')))
    .map(p => `
      <div class="task" data-prospect-id="${esc(p.id)}">
        <div class="task-title">
          <b>${esc(prospectName(p))}</b>
          <span class="badge">${esc(p.current_status || 'New')}</span>
        </div>
        <div class="meta">
          ${esc(p.source || '')}
          ${p.source_account ? ' • ' + esc(p.source_account) : ''}
          ${p.source_reference ? ' • Ref ' + esc(p.source_reference) : ''}
          ${p.phone ? ' • ' + esc(p.phone) : ''}
        </div>
        ${p.street_address ? `<div>${esc(p.street_address)}${p.city ? ', ' + esc(p.city) : ''}</div>` : ''}
        <div class="meta">
          ${p.next_action ? 'Next: ' + esc(p.next_action) : ''}
          ${p.next_follow_up_at ? ' • Follow-up ' + esc(formatWhen(p.next_follow_up_at)) : ''}
        </div>
        <div class="actions">
          <button class="btn small primary" data-prospect-action="promote">Promote to Lead</button>
        </div>
      </div>
    `).join('') || empty('No active prospects yet.');

  $('leadList').innerHTML = state.leads
    .slice()
    .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')) * -1)
    .map(l => `
      <div class="task">
        <div class="task-title">
          <b>${esc(leadName(l))}</b>
          <span class="badge">${esc(l.lead_status || 'Appointment Wanted')}</span>
        </div>
        <div class="meta">
          ${l.lead_number ? 'Lead # ' + esc(l.lead_number) : 'Lead # not entered'}
          ${l.source ? ' • ' + esc(l.source) : ''}
          ${l.assigned_to ? ' • ' + esc(l.assigned_to) : ''}
        </div>
        ${l.street_address ? `<div>${esc(l.street_address)}${l.city ? ', ' + esc(l.city) : ''}</div>` : ''}
        <div class="meta">
          Estimate: ${esc(l.estimate_status || 'Not Known')}
          ${l.phone ? ' • ' + esc(l.phone) : ''}
        </div>
      </div>
    `).join('') || empty('No leads yet.');

  $('appointmentList').innerHTML = upcomingAppointments
    .slice(0, 20)
    .map(a => {
      const lead = state.leads.find(l => l.id === a.lead_id);
      return `
        <div class="task">
          <b>${esc(lead ? leadName(lead) : 'Lead')}</b>
          <div class="meta">
            ${esc(formatWhen(a.appointment_at))}
            • ${esc(a.appointment_status || 'Scheduled')}
            ${a.assigned_to ? ' • ' + esc(a.assigned_to) : ''}
            • MarketSharp: ${esc(a.marketsharp_status || 'Not Needed Yet')}
          </div>
        </div>
      `;
    }).join('') || empty('No upcoming appointments entered yet.');
}


function clearProspectForm() {
  ['prospectSourceRef', 'prospectFirstName', 'prospectLastName', 'prospectStreet', 'prospectCity', 'prospectZip', 'prospectPhone', 'prospectEmail', 'prospectNextFollow', 'prospectNextAction', 'prospectNotes']
    .forEach(id => { if ($(id)) $(id).value = ''; });
  $('prospectState').value = 'SC';
  $('prospectWorkCategory').value = 'Roofing';
  setupLeadProspectSelects();
}


function clearLeadForm() {
  ['leadProspectId', 'leadNumber', 'leadSourceRef', 'leadFirstName', 'leadLastName', 'leadStreet', 'leadCity', 'leadZip', 'leadPhone', 'leadEmail', 'leadAppointmentDate', 'leadAppointmentTime', 'leadEstimateNote', 'leadNotes']
    .forEach(id => { if ($(id)) $(id).value = ''; });
  $('leadState').value = 'SC';
  $('leadWorkCategory').value = 'Roofing';
  $('leadStatus').value = 'Appointment Wanted';
  $('leadDialogTitle').textContent = 'New Lead';
  setupLeadProspectSelects();
}


function openProspectDialog() {
  clearProspectForm();
  $('prospectDialog').showModal();
}


function openLeadDialog(prospect = null) {
  clearLeadForm();

  if (prospect) {
    $('leadDialogTitle').textContent = 'Promote Prospect to Lead';
    $('leadProspectId').value = prospect.id;
    $('leadSource').value = prospect.source || 'Angi';
    toggleAngiFields('lead');
    $('leadSourceAccount').value = prospect.source_account || '';
    $('leadSourceRef').value = prospect.source_reference || '';
    $('leadFirstName').value = prospect.first_name || '';
    $('leadLastName').value = prospect.last_name || '';
    $('leadStreet').value = prospect.street_address || '';
    $('leadCity').value = prospect.city || '';
    $('leadState').value = prospect.state || 'SC';
    $('leadZip').value = prospect.zip || '';
    $('leadPhone').value = prospect.phone || '';
    $('leadEmail').value = prospect.email || '';
    $('leadWorkCategory').value = prospect.work_category || 'Roofing';
    $('leadAssignedTo').value = prospect.assigned_to || 'Roy';
    $('leadNotes').value = prospect.notes || '';
    fillLeadIntake(prospect);
  }

  $('leadDialog').showModal();
}


async function saveProspect() {
  const first = $('prospectFirstName').value.trim();
  const last = $('prospectLastName').value.trim();
  const phone = $('prospectPhone').value.trim();
  const email = $('prospectEmail').value.trim();

  if (!first && !last && !phone && !email) {
    msg('Enter at least a name, phone number, or email for the prospect.', 'error');
    return;
  }

  const row = {
    source: $('prospectSource').value,
    source_account: $('prospectSource').value === 'Angi' ? ($('prospectSourceAccount').value || null) : null,
    source_reference: $('prospectSourceRef').value.trim() || null,
    import_source: 'Manual',
    first_name: first,
    last_name: last,
    customer_name: [first, last].filter(Boolean).join(' '),
    street_address: $('prospectStreet').value.trim(),
    city: $('prospectCity').value.trim(),
    state: $('prospectState').value.trim(),
    zip: $('prospectZip').value.trim(),
    phone,
    email,
    work_category: $('prospectWorkCategory').value,
    current_status: $('prospectStatus').value,
    assigned_to: $('prospectAssignedTo').value,
    next_follow_up_at: $('prospectNextFollow').value ? new Date($('prospectNextFollow').value).toISOString() : null,
    next_action: $('prospectNextAction').value.trim(),
    notes: $('prospectNotes').value.trim()
  };

  const { data, error } = await db.from('prospects').insert(row).select().single();

  if (error) {
    msg('Could not save prospect: ' + error.message, 'error');
    return;
  }

  state.prospects.unshift(data);
  $('prospectDialog').close();
  renderProspectsLeads();
  msg('Prospect saved.', 'success');
}


async function saveLead() {
  const first = $('leadFirstName').value.trim();
  const last = $('leadLastName').value.trim();
  const leadNumber = $('leadNumber').value.trim();
  const prospectId = $('leadProspectId').value || null;

  if (!first && !last && !$('leadPhone').value.trim()) {
    msg('Enter at least a homeowner name or phone number.', 'error');
    return;
  }

  const row = {
    prospect_id: prospectId,
    lead_number: leadNumber || null,
    source: $('leadSource').value,
    source_account: $('leadSource').value === 'Angi' ? ($('leadSourceAccount').value || null) : null,
    source_reference: $('leadSourceRef').value.trim() || null,
    import_source: 'Manual',
    homeowner_name: [first, last].filter(Boolean).join(' '),
    first_name: first,
    last_name: last,
    street_address: $('leadStreet').value.trim(),
    city: $('leadCity').value.trim(),
    state: $('leadState').value.trim(),
    zip: $('leadZip').value.trim(),
    phone: $('leadPhone').value.trim(),
    email: $('leadEmail').value.trim(),
    work_category: $('leadWorkCategory').value,
    lead_status: $('leadStatus').value,
    assigned_to: $('leadAssignedTo').value,
    estimate_status: $('leadEstimateStatus').value,
    estimate_issue_note: $('leadEstimateNote').value.trim(),
    notes: $('leadNotes').value.trim()
  };

  const { data, error } = await db.from('leads').insert(row).select().single();

  if (error) {
    msg('Could not save lead: ' + error.message, 'error');
    return;
  }

  state.leads.unshift(data);

  if (prospectId) {
    const convertedAt = new Date().toISOString();
    const updateResult = await db.from('prospects')
      .update({ converted_to_lead_at: convertedAt, updated_at: convertedAt })
      .eq('id', prospectId)
      .select()
      .single();

    if (!updateResult.error && updateResult.data) {
      state.prospects = state.prospects.map(p => p.id === prospectId ? updateResult.data : p);
    }
  }

  if ($('leadAppointmentDate').value) {
    const date = $('leadAppointmentDate').value;
    const time = $('leadAppointmentTime').value || '12:00';
    const appointmentAt = new Date(`${date}T${time}`).toISOString();

    const appointmentRow = {
      lead_id: data.id,
      prospect_id: prospectId,
      appointment_at: appointmentAt,
      appointment_type: 'Measure & Presentation',
      appointment_status: 'Scheduled',
      assigned_to: $('leadAssignedTo').value,
      marketsharp_status: $('leadMarketSharpStatus').value,
      google_calendar_status: 'Not Added'
    };

    const appointmentResult = await db.from('appointments').insert(appointmentRow).select().single();

    if (appointmentResult.error) {
      msg('Lead saved, but appointment could not be saved: ' + appointmentResult.error.message, 'error');
    } else {
      state.appointments.push(appointmentResult.data);
    }
  }

  $('leadDialog').close();
  renderProspectsLeads();
  msg('Lead saved.', 'success');
}


function renderJobs() {
  const rows =
    state.jobs
      .map(j => `
        <tr>

          <td>
            ${esc(j.customer_name)}
          </td>

          <td>
            ${esc(j.lead_number || '')}
          </td>

          <td>
            ${esc(j.job_number || '')}
          </td>

          <td>
            ${esc(
              j.property_address ||
              ''
            )}
          </td>

          <td class="job-stage">
            ${esc(j.stage)}
          </td>

          <td>
            ${esc(
              j.confirmed_start_date ||
              j.target_start_date ||
              ''
            )}
          </td>

          <td>
            ${esc(
              j.salesperson ||
              ''
            )}
          </td>

        </tr>
      `)
      .join('');

  $('jobsTable').innerHTML =
    rows
      ? `
        <div class="table-wrap">

          <table class="simple-table">

            <thead>

              <tr>
                <th>Customer</th>
                <th>Lead #</th>
                <th>Job #</th>
                <th>Address</th>
                <th>Stage</th>
                <th>Start</th>
                <th>Salesperson</th>
              </tr>

            </thead>

            <tbody>
              ${rows}
            </tbody>

          </table>

        </div>
      `
      : empty(
          'No jobs entered yet.'
        );

  $('allComms').innerHTML =
    state.communications
      .map(c => `
        <div class="task">

          <b>
            ${esc(c.purpose)}
          </b>

          <div
            class="meta ${
              c.due_date &&
              c.due_date < todayISO() &&
              c.status !== 'Completed'
                ? 'comm-overdue'
                : ''
            }"
          >

            ${esc(c.type)}

            •

            ${esc(c.status)}

            • Due

            ${esc(
              c.due_date ||
              ''
            )}

            ${esc(
              c.due_time ||
              ''
            )}

          </div>

        </div>
      `)
      .join('')
    ||
    empty(
      'No communication responsibilities yet.'
    );
}


function renderSops() {
  const select =
    $('sopSelect');

  const previouslySelected = select.value;

  select.innerHTML =
    state.sops
      .map(s => `
        <option value="${esc(s.id)}">
          ${esc(s.title)}
        </option>
      `)
      .join('');

  if (state.sops.some(s => String(s.id) === String(previouslySelected))) {
    select.value = previouslySelected;
  }

  const show = () => {

    const s =
      state.sops.find(
        x => x.id === select.value
      );

    $('sopBody').innerHTML =
      s
        ? `
          <h3>
            ${esc(s.title)}
          </h3>

          <p>
            <b>Purpose:</b>
            ${esc(s.purpose || '')}
          </p>

          <p>
            <b>When:</b>
            ${esc(s.when_to_use || '')}
          </p>

          <p>
            <b>Prerequisites:</b>
            ${esc(s.prerequisites || '')}
          </p>

          <p>
            <b>Steps:</b><br>

            ${esc(
              s.instructions ||
              ''
            ).replace(
              /\n/g,
              '<br>'
            )}
          </p>

          <p>
            <b>Verify:</b>
            ${esc(
              s.how_to_verify ||
              ''
            )}
          </p>
        `
        : empty(
            'No SOP selected.'
          );

    if ($('editSopBtn')) $('editSopBtn').disabled = !s;
  };

  select.onchange =
    show;

  show();
}


function renderSuggestions() {
  $('suggestionList').innerHTML =
    state.suggestions
      .map(s => `
        <div class="task">

          <b>
            ${esc(s.suggestion)}
          </b>

          <div class="meta">

            ${esc(s.type)}

            •

            ${esc(s.status)}

            •

            ${esc(
              new Date(
                s.created_at
              ).toLocaleDateString()
            )}

          </div>

          <div class="meta">
            Evidence:
            ${esc(
              s.pattern_evidence ||
              ''
            )}
          </div>

        </div>
      `)
      .join('')
    ||
    empty(
      'No suggestions yet. Click Analyze Work Patterns when you have some task history.'
    );
}


async function loadAll() {
  const calls = [
    ['tasks', 'created_at', false],
    ['jobs', 'updated_at', false],
    ['communications', 'due_date', true],
    ['incoming', 'captured_at', false],
    ['phone_messages', 'created_at', false],
    ['prospects', 'created_at', false],
    ['leads', 'created_at', false],
    ['appointments', 'appointment_at', true],
    ['lookup_options', 'sort_order', true],
    ['sops', 'title', true],
    ['suggestions', 'created_at', false]
  ];

  const results =
    await Promise.all(
      calls.map(
        ([table, order, ascending]) =>
          db
            .from(table)
            .select('*')
            .order(
              order,
              { ascending }
            )
            .limit(500)
      )
    );

  for (
    let i = 0;
    i < results.length;
    i++
  ) {
    if (results[i].error) {
      throw results[i].error;
    }

    let stateName =
      calls[i][0] === 'phone_messages'
        ? 'phone'
        : calls[i][0];

    if (stateName === 'lookup_options') {
      stateName = 'lookups';
    }

    state[stateName] =
      results[i].data || [];
  }

  setupLeadProspectSelects();
  renderDashboard();
  renderProspectsLeads();
}


function patchTaskLocal(
  id,
  patch
) {
  state.tasks =
    state.tasks.map(
      t =>
        t.id === id
          ? {
              ...t,
              ...patch
            }
          : t
    );

  renderDashboard();
}


async function taskAction(
  id,
  action
) {
  const task =
    state.tasks.find(
      x => x.id === id
    );

  if (!task) {
    return;
  }

  let note = '';

  if (action === 'block') {
    note =
      prompt(
        'Why is this task blocked?'
      ) || '';
  }

  if (action === 'skip') {

    if (
      !task.recurring_rule_id
    ) {
      msg(
        'Only recurring task occurrences can be skipped.',
        'error'
      );

      return;
    }

    note =
      prompt(
        'Optional: why are you skipping this occurrence?'
      ) || '';
  }

  const previousTask =
    { ...task };

  const now =
    new Date().toISOString();

  let patch = {
    updated_at: now
  };

  if (
    action === 'start' ||
    action === 'resume'
  ) {

    const oldCurrent =
      currentTask();

    if (
      oldCurrent &&
      oldCurrent.id !== id
    ) {
      patchTaskLocal(
        oldCurrent.id,
        {
          status: 'Paused',
          paused_at: now,
          updated_at: now
        }
      );
    }

    patch = {
      ...patch,
      status: 'In Progress',
      started_at:
        task.started_at ||
        now,
      paused_at: null
    };

  } else if (
    action === 'pause'
  ) {

    patch = {
      ...patch,
      status: 'Paused',
      paused_at: now
    };

  } else if (
    action === 'complete'
  ) {

    patch = {
      ...patch,
      status: 'Completed',
      completed_at: now
    };

  } else if (
    action === 'skip'
  ) {

    patch = {
      ...patch,
      status: 'Skipped',
      completed_at: now,
      notes:
        note
          ? [
              task.notes,
              'Skipped: ' + note
            ]
              .filter(Boolean)
              .join('\n')
          : task.notes
    };

  } else if (
    action === 'block'
  ) {

    patch = {
      ...patch,
      status: 'Blocked',
      notes:
        [
          task.notes,
          note
        ]
          .filter(Boolean)
          .join('\n')
    };
  }

  patchTaskLocal(
    id,
    patch
  );

  const {
    data,
    error
  } =
    await db.rpc(
      'task_action',
      {
        p_task_id: id,
        p_action: action,
        p_note: note
      }
    );

  if (error) {

    state.tasks =
      state.tasks.map(
        x =>
          x.id === id
            ? previousTask
            : x
      );

    msg(
      'Could not save task change: ' +
        error.message,
      'error'
    );

    await loadAll();

    return;
  }

  if (data) {
    state.tasks =
      state.tasks.map(
        x =>
          x.id === id
            ? data
            : x
      );
  }

  renderDashboard();
}


async function savePhone() {
  const related =
    resolveRelatedNumber(
      $('pmRelatedNumber').value
    );

  const row = {
    caller_name:
      $('pmName').value.trim(),

    street_address:
      $('pmStreet').value.trim(),

    phone:
      $('pmPhone').value.trim(),

    email:
      $('pmEmail').value.trim(),

    called_for:
      $('pmFor').value.trim(),

    reason_message:
      $('pmReason').value.trim(),

    follow_up_needed:
      $('pmFollow').value === 'Yes',

    follow_up_status:
      $('pmFollow').value === 'Yes'
        ? 'Open'
        : 'None',

    follow_up_notes:
      $('pmNotes').value.trim(),

    related_number:
      related.related_number,

    lead_number:
      related.lead_number,

    job_number:
      related.job_number,

    related_job_id:
      null
  };

  if (
    !row.caller_name &&
    !row.phone &&
    !row.reason_message
  ) {
    msg(
      'Enter at least a caller name, phone number, or message.',
      'error'
    );

    return;
  }

  const {
    data,
    error
  } =
    await db
      .from('phone_messages')
      .insert(row)
      .select()
      .single();

  if (error) {
    msg(
      error.message,
      'error'
    );

    return;
  }

  state.phone.unshift(data);

  [
    'pmName',
    'pmStreet',
    'pmPhone',
    'pmEmail',
    'pmFor',
    'pmReason',
    'pmNotes',
    'pmRelatedNumber'
  ].forEach(
    id => {
      $(id).value = '';
    }
  );

  $('pmFollow').value =
    'No';

  renderPhone();

  setView('today');

  msg(
    'Phone message saved.',
    'success'
  );
}


async function saveIncoming() {
  const description =
    $('incomingDesc')
      .value
      .trim();

  if (!description) {
    msg(
      'Enter what came in first.',
      'error'
    );

    return;
  }

  const {
    data,
    error
  } =
    await db
      .from('incoming')
      .insert({
        description,
        source:
          $('incomingSource')
            .value
            .trim(),
        status: 'Open'
      })
      .select()
      .single();

  if (error) {
    msg(
      error.message,
      'error'
    );

    return;
  }

  state.incoming.unshift(data);

  $('incomingDesc').value =
    '';

  $('incomingSource').value =
    '';

  renderIncoming();

  setView('today');

  msg(
    'Incoming work captured.',
    'success'
  );
}


async function saveTask() {
  const task =
    $('taskName')
      .value
      .trim();

  if (!task) {
    msg(
      'Task name is required.',
      'error'
    );

    return;
  }

  const related =
    resolveRelatedNumber(
      $('taskRelatedNumber').value
    );

  const {
    data,
    error
  } =
    await db
      .from('tasks')
      .insert({
        task,

        description:
          $('taskDescription')
            .value
            .trim(),

        category:
          $('taskCategory')
            .value
            .trim(),

        task_type:
          'One-Time',

        status:
          'Not Started',

        base_priority:
          $('taskPriority')
            .value,

        due_date:
          $('taskDueDate')
            .value ||
          null,

        due_time:
          $('taskDueTime')
            .value ||
          null,

        next_action:
          $('taskNext')
            .value
            .trim(),

        notes:
          $('taskNotes')
            .value
            .trim(),

        related_number:
          related.related_number,

        lead_number:
          related.lead_number,

        job_number:
          related.job_number
      })
      .select()
      .single();

  if (error) {
    msg(
      error.message,
      'error'
    );

    return;
  }

  state.tasks.push(data);

  [
    'taskName',
    'taskCategory',
    'taskDueDate',
    'taskDueTime',
    'taskRelatedNumber',
    'taskDescription',
    'taskNext',
    'taskNotes'
  ].forEach(id => {
    $(id).value = '';
  });

  $('taskPriority').value =
    'Normal';

  $('taskDialog').close();

  renderDashboard();

  msg(
    'Task created.',
    'success'
  );
}


async function saveJob() {
  const customer =
    $('jobCustomer')
      .value
      .trim();

  if (!customer) {
    msg(
      'Customer name is required.',
      'error'
    );

    return;
  }

  const row = {
    customer_name:
      customer,

    lead_number:
      $('jobLead')
        .value
        .trim(),

    job_number:
      $('jobNumber')
        .value
        .trim(),

    property_address:
      $('jobAddress')
        .value
        .trim(),

    salesperson:
      $('jobSalesperson')
        .value
        .trim(),

    stage:
      $('jobStage')
        .value,

    target_start_date:
      $('jobTarget')
        .value ||
      null,

    confirmed_start_date:
      $('jobConfirmed')
        .value ||
      null,

    production_notes:
      $('jobNotes')
        .value
        .trim()
  };

  const {
    data,
    error
  } =
    await db
      .from('jobs')
      .insert(row)
      .select()
      .single();

  if (error) {
    msg(
      error.message,
      'error'
    );

    return;
  }

  state.jobs.push(data);

  $('jobDialog').close();

  renderDashboard();

  msg(
    'Job created.',
    'success'
  );
}


async function generateSuggestions() {
  const { error } =
    await db.rpc(
      'generate_suggestions'
    );

  if (error) {
    msg(
      error.message,
      'error'
    );

    return;
  }

  const result =
    await db
      .from('suggestions')
      .select('*')
      .order(
        'created_at',
        {
          ascending: false
        }
      )
      .limit(100);

  if (result.error) {
    msg(
      result.error.message,
      'error'
    );

    return;
  }

  state.suggestions =
    result.data || [];

  renderSuggestions();

  msg(
    'Analysis complete.',
    'success'
  );
}


async function init() {
  if (
    !cfg.SUPABASE_URL ||
    !cfg.SUPABASE_ANON_KEY ||
    String(
      cfg.SUPABASE_URL
    ).includes('YOUR-')
  ) {
    document.body.innerHTML = `
      <div class="login">
        <div class="card">

          <h1>
            Setup needed
          </h1>

          <p>
            Create <b>config.js</b>
            and enter your Supabase
            project URL and publishable key.
          </p>

        </div>
      </div>
    `;

    return;
  }

  db =
    supabase.createClient(
      cfg.SUPABASE_URL,
      cfg.SUPABASE_ANON_KEY
    );

  const {
    data: {
      session
    }
  } =
    await db.auth.getSession();

  await handleSession(
    session
  );

  if(passwordRecoveryRequested && session){
    setTimeout(()=>$('passwordDialog')?.showModal(),0);
  }

  db.auth.onAuthStateChange((event,nextSession)=>{
    handleSession(nextSession);
    if(event==='PASSWORD_RECOVERY'){
      setTimeout(()=>$('passwordDialog')?.showModal(),0);
    }
  });
}


async function handleSession(
  session
) {
  user =
    session?.user ||
    null;

  if ($('signedInEmail')) {
    $('signedInEmail').textContent = user?.email ? `Signed in: ${user.email}` : '';
    $('signedInEmail').title = user?.email || '';
  }

  $('loginView')
    .classList
    .toggle(
      'hidden',
      !!user
    );

  $('appView')
    .classList
    .toggle(
      'hidden',
      !user
    );

  if (!user) {
    return;
  }

  try {

    const bootstrap =
      await db.rpc(
        'bootstrap_bauer_data'
      );

    if (bootstrap.error) {
      throw bootstrap.error;
    }

    const recurring =
      await db.rpc(
        'ensure_recurring_tasks'
      );

    if (recurring.error) {
      throw recurring.error;
    }

    await loadAll();

  } catch (error) {

    msg(
      error.message ||
      String(error),
      'error'
    );
  }
}


async function loginWithPassword() {
  const email=$('loginEmail').value.trim();
  const password=$('loginPassword').value;
  if(!email||!password){
    authMsg('Enter your email and Bauer Roofing Operations password.','error');
    return;
  }
  const {error}=await db.auth.signInWithPassword({email,password});
  authMsg(error?error.message:'Signed in.',error?'error':'success');
}

$('loginBtn').onclick=loginWithPassword;
$('loginPassword').addEventListener('keydown',event=>{
  if(event.key==='Enter'){event.preventDefault();loginWithPassword();}
});

$('magicLinkBtn').onclick=async()=>{
  const email=$('loginEmail').value.trim();
  if(!email)return authMsg('Enter your email first.','error');
  const {error}=await db.auth.signInWithOtp({email,options:{
    shouldCreateUser:false,
    emailRedirectTo:new URL(cfg.APP_URL||'./',window.location.href).toString()
  }});
  authMsg(error?error.message:'Check your email for the sign-in link.',error?'error':'success');
};

$('resetPasswordBtn').onclick=async()=>{
  const email=$('loginEmail').value.trim();
  if(!email)return authMsg('Enter your email first.','error');
  const {error}=await db.auth.resetPasswordForEmail(email,{
    redirectTo:new URL(cfg.APP_URL||'./',window.location.href).toString()
  });
  authMsg(error?error.message:'Check your email for the password setup link.',error?'error':'success');
};

$('savePasswordBtn').onclick=async()=>{
  const password=$('newPassword').value;
  const confirmation=$('confirmPassword').value;
  if(password.length<8)return msg('Use at least 8 characters.','error');
  if(password!==confirmation)return msg('The passwords do not match.','error');
  const {error}=await db.auth.updateUser({password});
  if(error)return msg(error.message,'error');
  $('passwordDialog').close();
  $('newPassword').value='';
  $('confirmPassword').value='';
  msg('Your Bauer Roofing Operations password is ready.','success');
};


$('logoutBtn').onclick =
  () =>
    db.auth.signOut();


$('refreshBtn').onclick =
  async () => {

    try {

      const result =
        await db.rpc(
          'ensure_recurring_tasks'
        );

      if (result.error) {
        throw result.error;
      }

      await loadAll();

      msg(
        'Refreshed.',
        'success'
      );

    } catch (error) {

      msg(
        error.message ||
        String(error),
        'error'
      );
    }
  };


document
  .querySelectorAll(
    '#nav button'
  )
  .forEach(
    button => {
      button.onclick =
        () =>
          setView(
            button.dataset.view
          );
    }
  );


document.body.addEventListener(
  'click',
  event => {

    const prospectButton = event.target.closest('[data-prospect-action]');

    if (prospectButton) {
      const prospectCard = prospectButton.closest('[data-prospect-id]');
      const prospect = prospectCard
        ? state.prospects.find(p => p.id === prospectCard.dataset.prospectId)
        : null;

      if (prospectButton.dataset.prospectAction === 'promote' && prospect) {
        openLeadDialog(prospect);
      }

      return;
    }

    const button =
      event.target.closest(
        '[data-action]'
      );

    if (!button) {
      return;
    }

    const card =
      button.closest(
        '[data-task-id]'
      );

    if (!card) {
      return;
    }

    taskAction(
      card.dataset.taskId,
      button.dataset.action
    );
  }
);


$('savePhoneBtn').onclick =
  savePhone;

$('newTaskBtn').onclick =
  () =>
    $('taskDialog')
      .showModal();

$('saveTaskBtn').onclick =
  saveTask;

if ($('newProspectBtn')) {
  $('newProspectBtn').onclick = openProspectDialog;
}

$('saveProspectBtn').onclick =
  saveProspect;

$('newLeadBtn').onclick =
  () => openLeadDialog();

$('saveLeadBtn').onclick =
  saveLead;

$('prospectSource').onchange =
  () => toggleAngiFields('prospect');

$('leadSource').onchange =
  () => toggleAngiFields('lead');

$('newJobBtn').onclick =
  () =>
    $('jobDialog')
      .showModal();

$('saveJobBtn').onclick =
  saveJob;

$('generateSuggestionsBtn').onclick =
  generateSuggestions;


// ============================================================
// EDIT / ARCHIVE / DELETE / RESTORE / UNDO SAFETY LAYER
// ============================================================

function activeRow(x) {
  return x && !x.deleted_at && !x.archived_at;
}

function jobIsCancelled(job) {
  return String(job?.stage || '').trim().toLowerCase() === 'cancelled';
}

function visibleProspect(x) {
  return activeRow(x) && !x.archive_flag && !x.converted_to_lead_at;
}

function visibleLead(x) {
  return activeRow(x);
}

function dateTimeLocalValue(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function datePart(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA');
}

function timePart(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toTimeString().slice(0,5);
}

async function updateRecord(table, id, patch, description) {
  const { data, error } = await db.rpc('bauer_update_record', {
    p_table: table,
    p_id: id,
    p_patch: patch,
    p_description: description
  });
  if (error) throw error;
  return data;
}

async function recordAction(table, id, action, description) {
  if (action === 'delete') {
    const ok = confirm(`Delete this ${table.replace('_',' ')}? This is intended for test entries or true mistakes. You can Undo immediately afterward.`);
    if (!ok) return null;
  }
  const { data, error } = await db.rpc('bauer_record_action', {
    p_table: table,
    p_id: id,
    p_action: action,
    p_description: description
  });
  if (error) throw error;
  return data;
}

async function undoLastAction() {
  try {
    const { data, error } = await db.rpc('undo_last_action');
    if (error) throw error;
    await loadAll();
    msg(data?.message || 'Last action undone.', data?.ok === false ? 'error' : 'success');
  } catch (error) {
    msg('Could not undo: ' + (error.message || String(error)), 'error');
  }
}

function taskCard(t) {
  const subtasks=(state.task_subtasks||[]).filter(s=>s.task_id===t.id&&!s.deleted_at).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
  const skipButton = (t.recurring_rule_id||t.repeat_pattern==='Weekdays') ? '<button class="btn small" data-action="skip">Skip</button>' : '';
  const subtaskHtml=subtasks.length?`<div class="task-subtasks">${subtasks.map(s=>`<label class="task-subtask ${s.completed_at?'done':''}"><input type="checkbox" data-subtask-toggle="${esc(s.id)}" ${s.completed_at?'checked':''}><span>${esc(s.title)}</span></label>`).join('')}</div>`:'';
  const status=String(t.status||'Not Started');
  const categoryClass=taskPlacement(t)==='Communication Due'?'task-category-communication':taskPlacement(t)==='Financial / QuickBooks'?'task-category-financial':'task-category-routine';
  const dueText=formatDueDateTime(t.due_date,t.due_time);
  const mainAction=status==='In Progress'
    ? '<button class="btn small" data-action="pause">Pause</button>'
    : ['Paused','Blocked','Waiting'].includes(status)
      ? '<button class="btn primary small" data-action="resume">Resume</button>'
      : '<button class="btn primary small" data-action="start">Start</button>';
  const blockButton=['Blocked','Waiting'].includes(status)?'':'<button class="btn small" data-action="block">Block</button>';
  return `
    <div class="task ${categoryClass}" data-task-id="${esc(t.id)}">
      <div class="task-title"><b>${esc(t.task)}</b></div>
      ${dueText?`<div class="task-due">${esc(dueText)}</div>`:''}
      ${t.description ? `<div>${esc(t.description)}</div>` : ''}
      ${subtaskHtml}
      <div class="actions">
        ${mainAction}
        <button class="btn small" data-action="complete">Complete</button>
        <details class="task-more">
          <summary title="More task actions" aria-label="More task actions">•••</summary>
          <div class="task-more-menu">
            ${skipButton}
            ${blockButton}
            ${state.sops.length ? `<button class="btn small" data-open-sop-task="${esc(t.id)}">Open Instructions</button>` : ''}
            <button class="btn small" data-duplicate-task="${esc(t.id)}">Duplicate</button>
            <button class="btn small" data-edit-task="${esc(t.id)}">Edit</button>
            <button class="btn small danger-link" data-record-action="delete" data-record-table="tasks" data-record-id="${esc(t.id)}">Delete</button>
          </div>
        </details>
      </div>
    </div>`;
}

function isCommunicationTask(t) {
  if (!t || !activeRow(t)) return false;

  if(t.category==='Communication Due') return true;
  if(['Needs Your Attention','Financial / QuickBooks'].includes(t.category)) return false;

  const linkedToCustomer = !!(t.prospect_id || t.lead_id || t.job_id || t.lead_number || t.job_number || t.related_number);
  const taskText = String(t.task || '').trim().toLowerCase();
  const allText = [t.task, t.description, t.next_action].filter(Boolean).join(' ').toLowerCase();

  // Any communication attached to a prospect, lead, or job belongs here.
  if (linkedToCustomer && /\b(call|callback|text|email|contact|follow[- ]?up|communicat|customer update|payment reminder|deposit reminder|warranty|final paperwork)\b/.test(allText)) {
    return true;
  }

  // Some communication tasks intentionally represent a group of people rather than
  // one linked record (for example, "Call Angi prospects due for follow-up").
  // Treat direct outbound-contact tasks as Communication Due even without a link.
  // This deliberately does NOT classify internal tasks such as
  // "Review email and capture actionable follow-up" as customer communication.
  return /^(call|callback|text|email|contact|follow[- ]?up|send|reply to|respond to|message)\b/.test(taskText)
    || /^call angi prospects\b/.test(taskText);
}

function communicationTaskDue(t) {
  const finished = new Set(['Completed','Cancelled','Skipped']);
  if (!isCommunicationTask(t) || finished.has(t.status) || ['Blocked','Waiting'].includes(t.status)) return false;
  return true;
}

function communicationDueItems() {
  const td = todayISO();
  const taskItems = state.tasks
    .filter(communicationTaskDue)
    .map(t => ({ kind:'task', dueDate:t.due_date || '', dueTime:t.due_time || '', item:t }));

  const responsibilityItems = state.communications
    .filter(c => activeRow(c) && c.status !== 'Completed' && c.due_date && c.due_date <= td)
    .map(c => ({ kind:'communication', dueDate:c.due_date || '', dueTime:c.due_time || '', item:c }));

  const jobItems = state.jobs
    .filter(j => activeRow(j) && !jobIsCancelled(j) && !['Final / Closed','Closed'].includes(j.stage || ''))
    .filter(j => j.client_communication_needed || (j.client_communication_due_date && j.client_communication_due_date <= td))
    .map(j => ({ kind:'job', dueDate:j.client_communication_due_date || td, dueTime:'', item:j }));

  return [...taskItems, ...responsibilityItems, ...jobItems].sort((a,b) => {
    const ad = `${a.dueDate || '9999'} ${a.dueTime || '23:59:59'}`;
    const bd = `${b.dueDate || '9999'} ${b.dueTime || '23:59:59'}`;
    return ad.localeCompare(bd);
  });
}

function communicationDueCard(entry) {
  if (entry.kind === 'task') return taskCard(entry.item);
  if (entry.kind === 'job') {
    const j=entry.item;
    const dueText=formatDueDateTime(j.client_communication_due_date,'');
    return `<div class="task task-category-communication"><b>${esc(j.customer_name || 'Job customer')}</b>${dueText?`<div class="task-due">${esc(dueText)}</div>`:''}<div>${esc(j.client_communication_reason || 'Weekly production check-in is due')}</div><div class="actions">${contactActionHtml({...contactForJob(j),kind:'job',id:j.id,name:j.customer_name})}<button class="btn success small" data-job-contacted="${esc(j.id)}">Mark Customer Contacted</button></div></div>`;
  }
  const c = entry.item;
  const dueText=formatDueDateTime(c.due_date,c.due_time);
  return `<div class="task task-category-communication"><b>${esc(c.purpose || c.type || 'Customer communication')}</b>${dueText?`<div class="task-due">${esc(dueText)}</div>`:''}</div>`;
}

function actionableTasks() {
  const finished = new Set(['Completed','Cancelled','Skipped']);
  return state.tasks
    .filter(t => activeRow(t) && !finished.has(t.status) && t.status !== 'In Progress' && !['Blocked','Waiting'].includes(t.status) && !isCommunicationTask(t) && !isFinancialTask(t))
    .sort((a,b) => {
      const p = priorityRank(b.base_priority) - priorityRank(a.base_priority);
      if (p) return p;
      const ad = `${a.due_date || '9999'} ${a.due_time || '23:59:59'}`;
      const bd = `${b.due_date || '9999'} ${b.due_time || '23:59:59'}`;
      return ad.localeCompare(bd);
    });
}

function currentTask() {
  return state.tasks.find(t => activeRow(t) && t.status === 'In Progress') || null;
}

function nextUpTask(candidates) {
  const current=currentTask();
  if(current) return current;
  const td=todayISO();
  return [...new Map(candidates.filter(Boolean).map(t=>[t.id,t])).values()].sort((a,b)=>{
    const aOverdue=a.due_date&&a.due_date<td?1:0;
    const bOverdue=b.due_date&&b.due_date<td?1:0;
    if(aOverdue!==bOverdue)return bOverdue-aOverdue;
    const dueOrder=`${a.due_date||'9999'} ${a.due_time||'23:59:59'}`.localeCompare(`${b.due_date||'9999'} ${b.due_time||'23:59:59'}`);
    if(dueOrder)return dueOrder;
    return priorityRank(b.base_priority)-priorityRank(a.base_priority);
  })[0]||null;
}

function renderNextUp(task){
  const target=$('currentTask');
  if(!target)return;
  if(!task){target.innerHTML='';return;}
  const inProgress=task.status==='In Progress';
  const action=inProgress?'resume':(['Paused','Blocked','Waiting'].includes(task.status)?'resume':'start');
  const label=inProgress?'Continue':(['Paused','Blocked','Waiting'].includes(task.status)?'Resume':'Start');
  const dueText=formatDueDateTime(task.due_date,task.due_time);
  target.innerHTML=`<div class="next-up-card" data-task-id="${esc(task.id)}"><div><div class="next-label">${inProgress?'CURRENT TASK':'NEXT UP'}</div><div class="next-title">${esc(task.task)}</div>${dueText?`<div class="next-meta">${esc(dueText)}</div>`:''}</div><button class="btn next-action" data-action="${action}">${label}</button></div>`;
}

function todayEntrySort(a,b){
  const aStamp=`${a.dueDate||'9999'} ${a.dueTime||'23:59:59'}`;
  const bStamp=`${b.dueDate||'9999'} ${b.dueTime||'23:59:59'}`;
  if(aStamp!==bStamp)return aStamp.localeCompare(bStamp);
  const aPriority=a.kind==='task'?priorityRank(a.item.base_priority):0;
  const bPriority=b.kind==='task'?priorityRank(b.item.base_priority):0;
  return bPriority-aPriority;
}

function todayEntryCard(entry){
  return entry.kind==='task'?taskCard(entry.item):communicationDueCard(entry);
}

function setSectionVisible(id,visible){
  const section=$(id);if(section)section.classList.toggle('hidden',!visible);
}

function renderDashboard() {
  $('nowText').textContent = localNow();
  const acts = actionableTasks();
  const blocked = state.tasks.filter(t => activeRow(t) && ['Blocked','Waiting'].includes(t.status));
  const jw = jobsThisWeek().filter(activeRow);
  $('weekJobs').innerHTML = jw.map(j => `<div class="task"><b>${esc(j.customer_name || 'Unnamed customer')}</b><div class="meta">${esc(j.property_address || '')} • ${esc(j.stage)} • Start ${esc(j.confirmed_start_date || j.target_start_date || 'Not set')}</div></div>`).join('') || empty('No jobs entered for this week yet.');
  const comms = communicationDueItems();
  const finances=financialTasks();
  const entries=[
    ...comms,
    ...finances.map(item=>({kind:'task',dueDate:item.due_date||'',dueTime:item.due_time||'',item})),
    ...acts.map(item=>({kind:'task',dueDate:item.due_date||'',dueTime:item.due_time||'',item}))
  ].sort(todayEntrySort);
  const next=nextUpTask(entries.filter(x=>x.kind==='task').map(x=>x.item));
  const shownEntries=entries.filter(entry=>entry.kind!=='task'||entry.item.id!==next?.id);
  renderNextUp(next);
  $('blockedList').innerHTML = blocked.map(taskCard).join('');
  if($('todayTaskList'))$('todayTaskList').innerHTML=shownEntries.map(todayEntryCard).join('');
  const remainingTaskCount=shownEntries.length;
  if($('todayTasksEmpty')){
    $('todayTasksEmpty').textContent=next?'✓ Everything else is clear.':"✓ Today's task list is clear.";
    $('todayTasksEmpty').classList.toggle('hidden',remainingTaskCount>0);
  }
  renderRoyUpdates();
  renderDadUpdates();
  renderQuickNotes();
  const td = todayISO();
  const isOpen = t => activeRow(t) && !['Completed','Cancelled','Skipped'].includes(t.status);
  const criticalCount=state.tasks.filter(t => isOpen(t) && (t.base_priority === 'Critical' || (t.due_date && t.due_date < td))).length;
  const dueCount=state.tasks.filter(t => isOpen(t) && t.due_date === td).length;
  $('kpiCritical').textContent = criticalCount;
  $('kpiDue').textContent = dueCount;
  $('kpiComms').textContent = comms.length;
  $('kpiWeekJobs').textContent = jw.length;
  const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',hourCycle:'h23'}).format(new Date()));
  if($('todayGreeting'))$('todayGreeting').textContent=`Good ${hour<12?'morning':hour<17?'afternoon':'evening'}, Eve`;
  if($('todayDate'))$('todayDate').textContent=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'long',month:'long',day:'numeric'}).format(new Date());
  const beforeNoon=state.tasks.filter(t=>isOpen(t)&&t.due_date===td&&t.due_time&&t.due_time<'12:00').length;
  if($('daySummary'))$('daySummary').textContent=criticalCount
    ? `${criticalCount} ${criticalCount===1?'thing needs':'things need'} your attention${beforeNoon?` — ${beforeNoon} before noon`:''}.`
    : dueCount
      ? `Today is looking manageable — ${dueCount} ${dueCount===1?'task is':'tasks are'} due.`
      : comms.length
        ? `${comms.length} ${comms.length===1?'communication is':'communications are'} ready for follow-up.`
        : `You're caught up. Nothing urgent is waiting.`;
  const attentionTotal=blocked.length+(state.roy_updates||[]).length+(state.dad_updates||[]).length;
  if($('attentionCount'))$('attentionCount').textContent=attentionTotal;
  if($('attentionEmpty'))$('attentionEmpty').classList.toggle('hidden',attentionTotal>0);
  setSectionVisible('blockedSection',blocked.length>0);
  if($('weekJobsCard'))$('weekJobsCard').classList.toggle('compact-empty',jw.length===0);
  renderPhone(); renderJobs();
}

function renderRoyUpdates(){
  const target=$('royUpdateList');
  if(!target) return;
  const rows=(state.roy_updates||[]).slice(0,20);
  setSectionVisible('royUpdateSection',rows.length>0);
  const cards=rows.map(row=>{
    const when=row.submitted_at ? formatWhen(row.submitted_at) : '';
    const label=row.item_type==='estimate' ? 'Past estimate' : 'Appointment';
    return `<div class="task">
      <b>${esc(row.homeowner_name || 'Lead')}</b>
      <div>${esc(row.outcome || '')}</div>
      <div class="meta">${esc(label)}${row.lead_number ? ' • Lead # '+esc(row.lead_number) : ''}${row.street_address ? ' • '+esc(row.street_address) : ''}${when ? ' • '+esc(when) : ''}</div>
      ${row.note ? `<div class="lead-detail-note"><span>ROY'S NOTE</span>${esc(row.note)}</div>` : ''}
    </div>`;
  });
  target.innerHTML=cards.slice(0,3).join('')+(cards.length>3?`<details class="updates-more"><summary>View ${cards.length-3} more</summary><div>${cards.slice(3).join('')}</div></details>`:'');
}

function renderDadUpdates(){
  const target=$('dadUpdateList');
  if(!target) return;
  const rows=(state.dad_updates||[]).slice(0,20);
  setSectionVisible('dadUpdateSection',rows.length>0);
  const cards=rows.map(row=>{
    const when=row.submitted_at ? formatWhen(row.submitted_at) : '';
    return `<div class="task">
      <b>${esc(row.customer_name || 'Job')}</b>
      <div>${esc(row.stage || 'Production update')}</div>
      <div class="meta">${row.job_number ? 'Job # '+esc(row.job_number)+' • ' : ''}${row.communication_action ? esc(row.communication_action)+' • ' : ''}${esc(when)}</div>
      ${row.blocker ? `<div class="lead-detail-note"><span>BLOCKER</span>${esc(row.blocker)}</div>` : ''}
      ${row.note ? `<div class="lead-detail-note"><span>${esc((row.submitted_by || 'Dad').toUpperCase())}'S NOTE</span>${esc(row.note)}</div>` : ''}
    </div>`;
  });
  target.innerHTML=cards.slice(0,3).join('')+(cards.length>3?`<details class="updates-more"><summary>View ${cards.length-3} more</summary><div>${cards.slice(3).join('')}</div></details>`:'');
}

function renderIncoming() {
  const rows = state.incoming.filter(activeRow).slice(0,30);
  $('incomingList').innerHTML = rows.map(i => `
    <div class="task">
      <div>${esc(i.description)}</div>
      <div class="meta">${esc(i.source || '')} • ${esc(new Date(i.captured_at).toLocaleString())} • ${esc(i.status)}</div>
      <div class="actions">
        <button class="btn small" data-edit-incoming="${esc(i.id)}">Edit</button>
        <button class="btn small" data-record-action="delete" data-record-table="incoming" data-record-id="${esc(i.id)}">Delete</button>
      </div>
    </div>`).join('') || empty('None.');
}

function renderPhone() {
  const rows = state.phone.filter(activeRow).slice(0,30);
  $('phoneHistory').innerHTML = rows.map(p => `
    <div class="task">
      <b>${esc(p.caller_name || 'Unknown caller')}</b>
      <div class="meta">${esc(p.phone || '')} • ${esc(p.called_for || '')}${relatedLabel(p) ? ' • ' + relatedLabel(p) : ''} • ${esc(new Date(p.created_at).toLocaleString())}</div>
      <div>${esc(p.reason_message || '')}</div>
      ${contactActionHtml({phone:p.phone,email:p.email,name:p.caller_name})}
      <div class="actions">
        <button class="btn small" data-edit-phone="${esc(p.id)}">Edit</button>
        <button class="btn small" data-record-action="delete" data-record-table="phone_messages" data-record-id="${esc(p.id)}">Delete</button>
      </div>
    </div>`).join('') || empty('No messages yet.');
}

function phoneDigits(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  return digits;
}

function contactActionHtml({ phone = '', email = '', kind = '', id = '', name = '', callUsable = true, extraHtml = '' } = {}) {
  const digits = phoneDigits(phone);
  const subject = encodeURIComponent('Bauer Roofing');
  const call = digits && callUsable !== false ? `<a class="btn small primary" href="tel:${esc(digits)}">☎ Call</a>` : '';
  const text = digits ? `<a class="btn small" href="sms:${esc(digits)}">Text</a>` : '';
  const outlookUrl = email ? `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(email)}&subject=${encodeURIComponent('Bauer Roofing')}&login_hint=${encodeURIComponent('evebauer@bauerroofs.com')}` : '';
  const mail = email ? `<a class="btn small" href="${outlookUrl}" target="_blank" rel="noopener noreferrer">Email</a>` : '';
  const log = kind && id ? `<button class="btn small" data-log-communication="${esc(kind)}" data-contact-id="${esc(id)}">Log Communication</button>` : '';
  return `<div class="actions contact-actions">${call}${text}${mail}${log}${extraHtml}</div>`;
}

function teamPhoneSettings(){
  const account=user?.user_metadata?.bauer_team_phones||{};
  let local={};
  try{local=JSON.parse(localStorage.getItem('bauer_team_phones')||'{}');}catch(error){local={};}
  return {eve:account.eve||local.eve||'',roy:account.roy||local.roy||'',dad:account.dad||local.dad||''};
}

function currentTeamMember(){
  const saved=String(user?.user_metadata?.bauer_team_member||localStorage.getItem('bauer_team_member')||'').toLowerCase();
  if(['eve','roy','dad'].includes(saved))return saved;
  const email=String(user?.email||'').toLowerCase();
  if(email.includes('eve'))return 'eve';
  if(email==='jbauer@bauerroofs.com')return 'dad';
  return 'roy';
}

function openTeamNumbers(){
  const phones=teamPhoneSettings();
  $('teamAccountMember').value=currentTeamMember();
  $('eveTextPhone').value=phones.eve||'';
  $('royTextPhone').value=phones.roy||'';
  $('dadTextPhone').value=phones.dad||'';
  $('teamNumbersDialog').showModal();
}

async function saveTeamNumbers(){
  try{
    const member=$('teamAccountMember').value;
    const phones={eve:$('eveTextPhone').value.trim(),roy:$('royTextPhone').value.trim(),dad:$('dadTextPhone').value.trim()};
    for(const key of ['eve','roy','dad'])if(phones[key]&&phoneDigits(phones[key]).length<10)return msg(`Enter ${key==='dad'?'Dad':key[0].toUpperCase()+key.slice(1)}’s complete mobile number.`,'error');
    const result=await db.auth.updateUser({data:{bauer_team_phones:phones,bauer_team_member:member}});
    if(result.error)throw result.error;
    if(result.data?.user)user=result.data.user;
    localStorage.setItem('bauer_team_phones',JSON.stringify(phones));
    localStorage.setItem('bauer_team_member',member);
    $('teamNumbersDialog').close();msg('Team text numbers saved.','success');
    renderProspectsLeads();renderJobs();
  }catch(error){msg('Could not save team numbers: '+(error.message||String(error)),'error');}
}

function teamTextButtons(kind,id){
  const current=currentTeamMember();
  return ['eve','roy','dad'].filter(member=>member!==current).map(member=>`<button class="btn small" data-team-text="${member}" data-team-kind="${esc(kind)}" data-team-id="${esc(id)}">Text ${member==='dad'?'Dad':member[0].toUpperCase()+member.slice(1)}</button>`).join('');
}

function openTeamText(member,kind,id){
  const person=member==='dad'?'Dad':member[0].toUpperCase()+member.slice(1);
  const number=phoneDigits(teamPhoneSettings()[member]);
  if(!number){openTeamNumbers();msg(`Add ${person}’s mobile number, then tap Text ${person} again.`,'error');return;}
  const record=kind==='lead'?state.leads.find(l=>l.id===id):state.jobs.find(j=>j.id===id);
  if(!record)return;
  const name=kind==='lead'?leadName(record):(record.customer_name||'Unnamed customer');
  const address=kind==='lead'?[record.street_address,record.city,record.state,record.zip].filter(Boolean).join(record.street_address&&record.city?', ':' '):(record.property_address||'No address entered');
  const reference=kind==='lead'?(record.lead_number?'Lead #'+record.lead_number:'Lead'):(record.job_number?'Job #'+record.job_number:'Job');
  const customerPhone=kind==='lead'?(record.phone||''):contactForJob(record).phone;
  const detailUrl=new URL(cfg.APP_URL||window.location.href);
  detailUrl.search='';detailUrl.hash='';
  detailUrl.searchParams.set('view',kind==='lead'?'leads':'jobs');
  detailUrl.searchParams.set(kind,id);
  if(kind==='job')detailUrl.searchParams.set('edit','1');
  const body=`${name}\n${address}\n${reference}${customerPhone?'\n'+customerPhone:''}\n${detailUrl.toString()}\n\n`;
  const separator=/iPhone|iPad|iPod/i.test(navigator.userAgent)?'&':'?';
  window.location.href=`sms:${number}${separator}body=${encodeURIComponent(body)}`;
}

function contactForJob(job) {
  let lead = null;
  if (job.lead_id) lead = state.leads.find(l => l.id === job.lead_id) || null;
  if (!lead && job.lead_number) lead = state.leads.find(l => String(l.lead_number || '') === String(job.lead_number || '')) || null;
  return {
    phone: lead?.phone || '',
    email: lead?.email || '',
    name: job.customer_name || (lead ? leadName(lead) : 'Customer')
  };
}

function communicationHistoryHtml(kind, id) {
  const rows = kind === 'job'
    ? state.job_communications.filter(c => c.job_id === id)
    : state.sales_communications.filter(c => kind === 'prospect' ? c.prospect_id === id : c.lead_id === id);
  const sorted = rows.slice().sort((a,b) => String(b.occurred_at || b.created_at || '').localeCompare(String(a.occurred_at || a.created_at || ''))).slice(0,8);
  if (!sorted.length) return '<div class="meta">No communication logged yet.</div>';
  return `<div class="comm-history">${sorted.map(c => `<div class="meta"><b>${esc(c.communication_type || 'Communication')}</b> • ${esc(formatWhen(c.occurred_at || c.created_at))}${c.result ? ' • ' + esc(c.result) : ''}${c.notes ? '<br>' + esc(c.notes) : ''}</div>`).join('')}</div>`;
}


// ============================================================
// ANGI WORK QUEUE
// ============================================================
let selectedAngiProspectId = '';

function angiStatusKey(p) {
  return String(p?.current_status || '').trim().toLowerCase();
}

function angiSourceStatusKind(value) {
  const s = String(value || '').trim().toLowerCase().replace(/\s+/g,' ');
  if (s === 'selling') return 'selling';
  if (s === 'initial') return 'initial';
  if (s === 'connected') return 'connected';
  if (s === 'contact & qualify' || s === 'contact and qualify' || s.includes('contact & qualify') || s.includes('contact and qualify')) return 'contact';
  return s ? 'other' : '';
}

function angiIsAppointmentOrClosed(p) {
  const s = angiStatusKey(p);
  return !!p?.converted_to_lead_at
    || angiSourceStatusKind(p?.source_status) === 'selling'
    || ['appointment set','appointment scheduled','sold','not interested','went with another company','went elsewhere','no longer needs service','unable to reach','bad / invalid lead','bad/invalid lead','closed'].includes(s)
    || !!p?.archive_flag;
}

function isAngiProspect(p) {
  if (!activeRow(p)) return false;
  const source = String(p.source || '').trim().toLowerCase();
  const account = String(p.source_account || '').trim().toLowerCase();
  const imported = String(p.import_source || '').trim().toLowerCase();
  return source === 'angi'
    || source.includes('angi')
    || account.includes('angi')
    || imported.includes('angi');
}

function isAngiCallableProspect(p) {
  if (!isAngiProspect(p) || angiIsAppointmentOrClosed(p)) return false;
  const s = angiStatusKey(p);
  if (s === 'needs initial review') return false;
  if (p.duplicate_flag && !p.duplicate_resolution) return false;

  // Match the working Bauer Roofing Angi app: when Angi provides a source
  // workflow status, only Initial, Contact & Qualify, and Connected are callable.
  const sourceKind = angiSourceStatusKind(p.source_status);
  if (sourceKind && !['initial','contact','connected'].includes(sourceKind)) return false;
  return true;
}

function angiMarketSharpItems() {
  return state.leads.filter(l => visibleLead(l) && l.source === 'Angi' && l.source_account === 'Bauer Roofing Inc - Angi Ads')
    .map(l => {
      const a = state.appointments
        .filter(x => activeRow(x) && x.lead_id === l.id)
        .sort((x,y) => String(y.appointment_at || '').localeCompare(String(x.appointment_at || '')))[0];
      return a && !['Added','Already There'].includes(a.marketsharp_status || '') ? {lead:l, appointment:a} : null;
    }).filter(Boolean);
}

function angiQueueCategory(p) {
  if (!isAngiProspect(p)) return 'excluded';
  if (angiIsAppointmentOrClosed(p)) return 'excluded';
  if (p.duplicate_flag && !p.duplicate_resolution) return 'duplicate';
  if (angiStatusKey(p) === 'needs initial review') return 'review';
  const now = new Date();
  if (!Number(p.attempts_count || 0) && angiStatusKey(p) === 'new') return 'new';
  if (p.next_follow_up_at) {
    const due = new Date(p.next_follow_up_at);
    const dueToday = due.toLocaleDateString('en-CA',{timeZone:'America/New_York'}) === todayISO();
    // Manual callbacks remain overdue because they are customer commitments.
    // Automatic cadence checkpoints should normally have been rolled forward.
    if (due < now && !(isAutomaticAngiCadence(p) && dueToday)) return 'overdue';
    if (dueToday) return 'today';
  }
  return 'active';
}

function angiPriority(p) {
  const cat = angiQueueCategory(p);
  return cat === 'new' ? 0 : cat === 'overdue' ? 1 : cat === 'today' ? 2 : cat === 'active' ? 3 : 9;
}

function activeAngiProspects() {
  return state.prospects.filter(isAngiCallableProspect).sort((a,b) => {
    const pr = angiPriority(a) - angiPriority(b);
    if (pr) return pr;
    const aKey = a.next_follow_up_at || a.received_at || '9999';
    const bKey = b.next_follow_up_at || b.received_at || '9999';
    if (angiQueueCategory(a) === 'new') return String(bKey).localeCompare(String(aKey));
    return String(aKey).localeCompare(String(bKey));
  });
}

function angiReviewProspects() {
  return state.prospects.filter(p => isAngiProspect(p) && !angiIsAppointmentOrClosed(p) && angiQueueCategory(p) === 'review')
    .sort((a,b) => String(b.received_at || '').localeCompare(String(a.received_at || '')));
}

function angiDuplicateProspects() {
  return state.prospects.filter(p => isAngiProspect(p) && !angiIsAppointmentOrClosed(p) && angiQueueCategory(p) === 'duplicate')
    .sort((a,b) => String(b.received_at || '').localeCompare(String(a.received_at || '')));
}

function angiTimeBand(p) {
  const cat = angiQueueCategory(p);
  if (cat === 'new') return {label:'CALL FIRST', cls:'call-first'};
  if (cat === 'overdue') return {label:'OVERDUE', cls:'overdue'};
  if (cat === 'review') return {label:'REVIEW', cls:'admin'};
  if (cat === 'duplicate') return {label:'DUPLICATE', cls:'duplicate'};
  if (cat === 'active' && !p.next_follow_up_at) return {label:'FOLLOW UP', cls:'later'};
  if (!p.next_follow_up_at) return {label:'LATER', cls:'later'};
  const d = new Date(p.next_follow_up_at);
  if (cat === 'active') return {label:'LATER', cls:'later'};
  const h = d.getHours() + d.getMinutes()/60;
  if (h < 11) return {label:'MORNING', cls:'morning'};
  if (h < 15) return {label:'MIDDAY', cls:'midday'};
  return {label:'FINAL CALL', cls:'final-call'};
}

function angiNextBusinessDay(date, businessDays = 1) {
  const d = new Date(date);
  let remaining = Math.max(0, Math.round(businessDays));
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) remaining--;
  }
  return d;
}

function angiAtClock(date, hour, minute = 0) {
  const d = new Date(date);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function angiNextOpenCallingBlock(now = new Date()) {
  const d = new Date(now);
  const day = d.getDay();
  if (day === 0 || day === 6) {
    return angiAtClock(angiNextBusinessDay(d, 1), 8, 0);
  }
  const morning = angiAtClock(d, 8, 0);
  const midday = angiAtClock(d, 13, 0);
  const closing = angiAtClock(d, 16, 30);
  if (d < morning) return morning;
  if (d < midday) return midday;
  if (d < closing) return closing;
  return angiAtClock(angiNextBusinessDay(d, 1), 8, 0);
}

function angiNextCheckpointAfterAttempt(now, attemptWithinDay, checkpointCount) {
  const checkpoints = [[8,0],[13,0],[16,30]].slice(0, Math.min(checkpointCount,3));
  let index = Math.max(0, attemptWithinDay);
  if (index < checkpoints.length) {
    for (let i=index; i<checkpoints.length; i++) {
      const candidate = angiAtClock(now, checkpoints[i][0], checkpoints[i][1]);
      if (candidate > now) return candidate;
    }
  }
  const nextDay = angiNextBusinessDay(now,1);
  const first = checkpoints[0] || [8,0];
  return angiAtClock(nextDay, first[0], first[1]);
}

function nextAngiFollowup(p) {
  // This matches the working Bauer Roofing Angi Lead App cadence:
  // Day 1: 8:00 / 1:00 / 4:30, Day 2: same three checkpoints,
  // then every other business day, every 3 business days, then weekly.
  const attempt = Math.max(1, Number(p?.attempts_count || 0) + 1);
  const now = new Date();
  const day1 = 3, day2 = 3, everyOtherContacts = 3, everyThreeContacts = 2, weeklyContacts = 4;
  const endDay1 = day1;
  const endDay2 = endDay1 + day2;
  const endEveryOther = endDay2 + everyOtherContacts;
  const endEveryThree = endEveryOther + everyThreeContacts;
  const endWeekly = endEveryThree + weeklyContacts;

  if (attempt < endDay1) return angiNextCheckpointAfterAttempt(now, attempt, day1);
  if (attempt === endDay1) return angiAtClock(angiNextBusinessDay(now,1),8,0);
  if (attempt < endDay2) return angiNextCheckpointAfterAttempt(now, attempt-endDay1, day2);
  if (attempt < endEveryOther) return angiAtClock(angiNextBusinessDay(now,2),8,0);
  if (attempt === endEveryOther || attempt < endEveryThree) return angiAtClock(angiNextBusinessDay(now,3),8,0);
  if (attempt === endEveryThree || attempt < endWeekly) return angiAtClock(angiNextBusinessDay(now,5),8,0);
  return null;
}

function isAutomaticAngiCadence(p) {
  if (!p || angiStatusKey(p) !== 'attempting contact') return false;
  if (p.manual_next_follow_up_at) return false;
  return !!p.cadence_next_follow_up_at;
}

async function rollForwardMissedAngiCadence() {
  // Missed automatic cadence checkpoints are windows, not promises. Roll them
  // forward to the NEXT open call block. Manual callbacks are never moved.
  const now = new Date();
  const nextBlock = angiNextOpenCallingBlock(now);
  const updates = [];
  for (const p of state.prospects || []) {
    if (!isAngiProspect(p) || angiIsAppointmentOrClosed(p) || !isAutomaticAngiCadence(p)) continue;
    const due = new Date(p.cadence_next_follow_up_at || p.next_follow_up_at || '');
    if (Number.isNaN(due.getTime()) || due >= now) continue;
    const iso = nextBlock.toISOString();
    p.cadence_next_follow_up_at = iso;
    p.next_follow_up_at = iso;
    p.next_action = 'Continue Angi cadence';
    updates.push(db.from('prospects').update({
      cadence_next_follow_up_at: iso,
      next_follow_up_at: iso,
      next_action: 'Continue Angi cadence',
      updated_at: new Date().toISOString()
    }).eq('id', p.id));
  }
  if (!updates.length) return 0;
  const results = await Promise.all(updates);
  const failure = results.find(r => r.error);
  if (failure) throw failure.error;
  return updates.length;
}

function angiQueueBadge(p) {
  const cat = angiQueueCategory(p);
  if (cat === 'new') return 'NEW';
  if (cat === 'overdue') return 'OVERDUE';
  if (cat === 'today') return 'DUE TODAY';
  if (cat === 'review') return 'REVIEW';
  if (cat === 'duplicate') return 'DUPLICATE';
  return 'FOLLOW UP';
}

function angiQueueRowHtml(p) {
  const band = angiTimeBand(p);
  const selected = p.id === selectedAngiProspectId ? ' selected' : '';
  const due = p.next_follow_up_at ? `<div class="angi-row-due">${esc(formatWhen(p.next_follow_up_at))}</div>` : '';
  return `<button type="button" class="angi-queue-row tone-${esc(band.cls)}${selected}" data-angi-select="${esc(p.id)}">
    <div class="angi-row-top"><b>${esc(prospectName(p))}</b><span class="angi-time-pill ${esc(band.cls)}">${esc(band.label)}</span></div>
    <div class="meta">Lead: ${esc(formatDate(p.received_at) || '—')}</div>
    <div class="meta">${esc(p.work_category || p.source_description || 'Angi inquiry')} • ${esc(p.source_account || '')}</div>
    <div class="angi-row-next">${esc(p.next_action || (angiQueueCategory(p)==='new' ? 'Call now' : 'Follow up'))}</div>
    ${due}
  </button>`;
}

function renderAngiQueue() {
  if (!$('angiQueueList')) return;
  const calls = activeAngiProspects();
  const reviews = angiReviewProspects();
  const duplicates = angiDuplicateProspects();
  const handoffs = angiMarketSharpItems();
  const filter = $('angiFilter')?.value || 'all';
  const search = String($('angiSearch')?.value || '').trim().toLowerCase();

  $('angiKpiNew').textContent = calls.filter(p => angiQueueCategory(p) === 'new').length;
  $('angiKpiOverdue').textContent = calls.filter(p => angiQueueCategory(p) === 'overdue').length;
  $('angiKpiDue').textContent = calls.filter(p => angiQueueCategory(p) === 'today').length;
  $('angiKpiMarketSharp').textContent = handoffs.length;
  if ($('angiKpiReview')) $('angiKpiReview').textContent = reviews.length;
  if ($('angiKpiDuplicates')) $('angiKpiDuplicates').textContent = duplicates.length;

  if (filter === 'marketsharp') {
    $('angiQueueList').innerHTML = handoffs.map(({lead,appointment}) => `
      <div class="angi-queue-row tone-admin">
        <div class="angi-row-top"><b>${esc(leadName(lead))}</b><span class="angi-time-pill admin">ADMIN</span></div>
        <div class="meta">${esc(lead.source_account || '')}${lead.source_reference ? ' • Angi ' + esc(lead.source_reference) : ''}</div>
        <div class="angi-row-next">Appointment ${esc(formatWhen(appointment.appointment_at))}</div>
        <div class="actions"><button class="btn primary small" data-angi-marketsharp="${esc(appointment.id)}">✓ Added to MarketSharp</button><button class="btn small" data-edit-lead="${esc(lead.id)}">View Lead</button></div>
      </div>`).join('') || empty('No Angi Ads appointments are waiting for MarketSharp.');
    $('angiDetail').innerHTML = '<p class="empty">MarketSharp handoffs are administrative items, not call-queue prospects.</p>';
    return;
  }

  let rows = filter === 'review' ? reviews : filter === 'duplicate' ? duplicates : calls.filter(p => filter === 'all' || angiQueueCategory(p) === filter);
  if (search) rows = rows.filter(p => [prospectName(p),p.phone,p.email,p.street_address,p.city,p.source_reference].some(v => String(v||'').toLowerCase().includes(search)));

  $('angiQueueList').innerHTML = rows.map(angiQueueRowHtml).join('') || empty('Nothing in this Angi view.');
  if (!rows.some(p => p.id === selectedAngiProspectId)) selectedAngiProspectId = rows[0]?.id || '';
  renderAngiDetail();
}

function telHref(phone) {
  return 'tel:' + String(phone || '').replace(/[^0-9+]/g,'');
}

function angiOriginalDetailsHtml(record){
  const entries=Object.entries(angiSnapshot(record)).filter(([,value])=>value!==null&&value!==undefined&&String(value).trim()!=='');
  if(!entries.length)return '';
  return `<details class="angi-original"><summary>All information supplied by Angi</summary><div class="source-data-grid">${entries.map(([label,value])=>`<div class="source-label">${esc(label)}</div><div class="source-value">${esc(typeof value==='object'?JSON.stringify(value):value)}</div>`).join('')}</div></details>`;
}

function renderAngiDetail() {
  if (!$('angiDetail')) return;
  const p = state.prospects.find(x => x.id === selectedAngiProspectId && isAngiProspect(x));
  if (!p) { $('angiDetail').innerHTML = '<p class="empty">Select an Angi prospect.</p>'; return; }
  const band = angiTimeBand(p);
  const canCall = !!p.phone && p.call_usable !== false;
  const callButton = canCall ? `<a class="angi-call-main" href="${esc(telHref(p.phone))}">☎ CALL ${esc((p.first_name || prospectName(p)).toUpperCase())}</a>` : '';
  $('angiDetail').innerHTML = `
    <div class="angi-detail-head">
      <span class="angi-time-pill ${esc(band.cls)}">${esc(band.label)}</span>
      <h2>${esc(prospectName(p))}</h2>
      <div class="meta">Lead Date: ${esc(formatDate(p.received_at) || '—')}</div>
      <div class="meta">${esc(p.work_category || p.source_description || 'Angi inquiry')} • ${esc(p.source_account || '')}${p.source_reference ? ' • Lead ' + esc(p.source_reference) : ''}</div>
    </div>
    ${callButton}
    ${p.call_usable === false ? '<div class="notice warning"><b>Phone disconnected / not working.</b> Keep this prospect active and use Text or Email if available.</div>' : ''}
    <div class="angi-result-label">RECORD CALL RESULT</div>
    <div class="angi-result-actions">
      <button class="btn outcome" data-angi-outcome="No Answer" data-angi-id="${esc(p.id)}">No Answer</button>
      <button class="btn outcome" data-angi-outcome="Left Voicemail" data-angi-id="${esc(p.id)}">Left Voicemail</button>
      <button class="btn outcome success" data-angi-outcome="Spoke With Customer" data-angi-id="${esc(p.id)}">Spoke With Customer</button>
      <button class="btn outcome warning" data-angi-outcome="Phone Disconnected / Not Working" data-angi-id="${esc(p.id)}">Phone Disconnected / Not Working</button>
    </div>
    <div class="angi-notes-block">
      <label>Lead Notes</label>
      <textarea id="angiWorkingNotes" placeholder="Notes about this prospect…">${esc(p.notes || '')}</textarea>
      <div class="actions"><button class="btn primary small" data-angi-save-notes="${esc(p.id)}">Save Notes</button><button class="btn small" data-angi-save-notes-next="${esc(p.id)}">Save Notes & Next</button></div>
    </div>
    <div class="angi-contact-grid">
      <div class="info-tile"><span>PHONE</span><b>${esc(p.phone || '—')}</b></div>
      <div class="info-tile"><span>EMAIL</span><b>${esc(p.email || '—')}</b></div>
      <div class="info-tile wide"><span>PROPERTY</span><b>${esc(p.street_address || '—')}${p.city ? '<br>' + esc([p.city,p.state,p.zip].filter(Boolean).join(', ').replace(', '+p.zip,' '+p.zip)) : ''}</b></div>
      <div class="info-tile wide"><span>PROJECT</span><b>${esc(p.source_description || p.work_category || '—')}</b></div>
    </div>
    ${angiOriginalDetailsHtml(p)}
    <div class="followup-grid">
      <div class="info-tile"><span>STATUS</span><b>${esc(p.current_status || 'New')}</b></div>
      <div class="info-tile"><span>CALL ATTEMPTS</span><b>${esc(String(p.attempts_count || 0))}</b></div>
      <div class="info-tile"><span>CADENCE PHASE</span><b>${esc(p.cadence_phase || '—')}</b></div>
      <div class="info-tile"><span>NEXT ACTION</span><b>${esc(p.next_action || '—')}</b></div>
      <div class="info-tile"><span>LAST RESULT</span><b>${esc(p.last_result || '—')}</b></div>
      <div class="info-tile"><span>NEXT FOLLOW-UP</span><b>${esc(p.next_follow_up_at ? formatWhen(p.next_follow_up_at) : '—')}</b></div>
    </div>
    <h3 class="more-actions-title">More Actions</h3>
    <div class="actions">
      ${contactActionHtml({phone:p.phone,email:p.email,kind:'prospect',id:p.id,name:prospectName(p),callUsable:p.call_usable !== false})}
      <button class="btn small" data-angi-callback="${esc(p.id)}">Call Back Later</button>
      <button class="btn primary small" data-angi-appointment="${esc(p.id)}">Set Appointment</button>
      <button class="btn small" data-angi-close="${esc(p.id)}">Close Prospect…</button>
      <button class="btn small" data-edit-prospect="${esc(p.id)}">View / Edit Full Prospect</button>
    </div>
    <details class="comm-history-details"><summary>Communication History</summary>${communicationHistoryHtml('prospect',p.id)}</details>`;
}

async function saveAngiWorkingNotes(id, advance=false) {
  try {
    const notes = String($('angiWorkingNotes')?.value || '').trim();
    await updateRecord('prospects', id, {notes}, 'Angi notes edit undone.');
    await loadAll();
    if (advance) {
      const next = activeAngiProspects().find(p => p.id !== id);
      selectedAngiProspectId = next?.id || id;
    }
    renderAngiQueue();
    msg(advance ? 'Notes saved. Moved to the next prospect.' : 'Notes saved.', 'success');
  } catch(error) { msg('Could not save Angi notes: ' + (error.message || String(error)), 'error'); }
}

async function recordAngiOutcome(id, outcome, nextFollowUp = null, notes = '', autoAdvance = true) {
  try {
    const { error } = await db.rpc('angi_record_prospect_outcome', {
      p_prospect_id:id,
      p_outcome:outcome,
      p_next_follow_up_at:nextFollowUp,
      p_notes:notes || null
    });
    if (error) throw error;
    await loadAll();

    if (autoAdvance) {
      // Preserve the Angi app behavior Eve likes: after recording a normal call
      // result, immediately move to the next prospect without requiring Work Next.
      const next = activeAngiProspects().find(p => p.id !== id);
      selectedAngiProspectId = next?.id || '';
    } else {
      // For a disconnected/non-working phone, stay on this prospect so Eve can
      // immediately use Text or Email. The prospect remains in the queue.
      selectedAngiProspectId = id;
    }

    renderAngiQueue();
    msg(`${outcome} saved. Undo is available.`, 'success');
  } catch(error) { msg('Could not save Angi result: ' + (error.message || String(error)), 'error'); }
}

function openAngiAppointment(id) {
  const p = state.prospects.find(x => x.id === id);
  if (!p) return;
  openLeadDialog(p);
  $('leadStatus').value = 'Appointment Scheduled';
  $('leadMarketSharpStatus').value = p.source_account === 'Bauer Roofing - PPL' ? 'Automatic' : 'Needs Entry';
  setTimeout(() => $('leadAppointmentDate')?.focus(), 0);
}

function parseCsvText(text) {
  const rows=[]; let row=[], field='', quoted=false;
  for (let i=0;i<text.length;i++) {
    const c=text[i];
    if (quoted) {
      if (c==='"' && text[i+1]==='"') { field+='"'; i++; }
      else if (c==='"') quoted=false;
      else field+=c;
    } else {
      if (c==='"') quoted=true;
      else if (c===',') { row.push(field); field=''; }
      else if (c==='\n') { row.push(field.replace(/\r$/,'')); rows.push(row); row=[]; field=''; }
      else field+=c;
    }
  }
  if (field || row.length) { row.push(field.replace(/\r$/,'')); rows.push(row); }
  return rows.filter(r => r.some(v => String(v).trim() !== ''));
}

function normalizeAngiHeader(value) {
  return String(value ?? '').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
}

function angiOriginalData(headers,row) {
  const data={};
  headers.forEach((header,index)=>{
    const label=String(header||'').trim();
    const value=row[index];
    if(label&&value!==null&&value!==undefined&&String(value).trim()!=='')data[label]=String(value).trim();
  });
  return data;
}

function angiHeaderIndex(headers) {
  const normalized = headers.map(normalizeAngiHeader);
  const aliases = {
    leadNumber: ['lead number','lead #','lead id','lead number / id'],
    firstName: ['customer first name','first name','customer firstname'],
    lastName: ['customer last name','last name','customer lastname'],
    phone: ['phone','phone number','customer phone','customer phone number'],
    email: ['email','email address','customer email','customer email address'],
    address: ['customer address','address','street address','property address'],
    city: ['city','customer city'],
    state: ['state','customer state'],
    zip: ['zip code','zip','postal code','customer zip'],
    description: ['lead description','project description','description','service request'],
    fee: ['lead fee','fee','lead cost'],
    leadDate: ['lead date','date','received date','date received'],
    leadStatus: ['lead status','status'],
    leadType: ['lead type','type']
  };
  const out={};
  for (const [key,names] of Object.entries(aliases)) {
    const i=normalized.findIndex(h => names.includes(h));
    out[key]=i;
  }
  return out;
}

async function readAngiExportRows(file) {
  const name=String(file?.name||'').toLowerCase();
  if (!name.endsWith('.xls') && !name.endsWith('.xlsx') && !name.endsWith('.csv')) {
    throw new Error('Choose the .xls file downloaded from Angi.');
  }

  // Angi currently names its downloads .xls, but the actual file contents are
  // UTF-8 CSV text. Read that format first so the importer matches the real exports.
  const text = (await file.text()).replace(/^\uFEFF/,'').trim();
  if (text && /(^|[\r\n])\s*"?Lead Number"?\s*,/i.test(text)) {
    return parseCsvText(text);
  }

  // Fallback for a true Excel workbook if Angi changes its export format later.
  if ((name.endsWith('.xls') || name.endsWith('.xlsx')) && typeof XLSX !== 'undefined') {
    const buffer=await file.arrayBuffer();
    const workbook=XLSX.read(buffer,{type:'array',cellDates:true});
    const sheetName=workbook.SheetNames[0];
    if (!sheetName) throw new Error('The Angi workbook does not contain a worksheet.');
    const sheet=workbook.Sheets[sheetName];
    const rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false,dateNF:'m/d/yyyy h:mm AM/PM'});
    return rows.filter(r => Array.isArray(r) && r.some(v => String(v).trim() !== ''));
  }

  throw new Error('I could not read this Angi export. Please download a fresh .xls file from Angi and try again.');
}

function detectAngiAccount(headers) {
  const normalized = headers.map(normalizeAngiHeader);
  return normalized.includes('lead fee') ? 'Bauer Roofing - PPL' : 'Bauer Roofing Inc - Angi Ads';
}

function angiImportWorkflow(leadStatus, account) {
  const kind = angiSourceStatusKind(leadStatus);
  if (kind === 'selling') return {
    current_status:'Appointment Set', attempts_count:1, historical_attempts:'1', cadence_phase:'Paused',
    next_action:null, marketsharp_status:account === 'Bauer Roofing - PPL' ? 'Automatic' : 'Needs Entry',
    initial_contact_eligible:false, initial_contact_suppressed_reason:'Angi status Selling - appointment already set'
  };
  if (kind === 'contact' || kind === 'connected') return {
    current_status:kind === 'connected' ? 'Connected' : 'Attempting Contact', attempts_count:1, historical_attempts:'1', cadence_phase:'Paused',
    next_action:'Review prior Angi contact and follow up', marketsharp_status:account === 'Bauer Roofing - PPL' ? 'Automatic' : 'Not Needed Yet',
    initial_contact_eligible:false, initial_contact_suppressed_reason:'Angi shows prior contact'
  };
  return {
    current_status:'New', attempts_count:0, historical_attempts:'0', cadence_phase:'Day 1',
    next_action:'Call now', marketsharp_status:account === 'Bauer Roofing - PPL' ? 'Automatic' : 'Not Needed Yet',
    initial_contact_eligible:true, initial_contact_suppressed_reason:null
  };
}

function angiWorkCategory(description) {
  const s=String(description||'').toLowerCase();
  if (s.includes('window')) return 'Windows';
  if (s.includes('siding')) return 'Siding';
  if (s.includes('gutter')) return 'Gutters';
  if (s.includes('roof')) return 'Roofing';
  return 'Not Sure';
}

function angiDateValue(value) {
  const s=String(value||'').trim();
  if (!s) return new Date().toISOString();
  const d=new Date(s);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function normPhone(v){ let d=String(v||'').replace(/\D/g,''); if(d.length===11&&d.startsWith('1'))d=d.slice(1); return d; }
function normEmail(v){ return String(v||'').trim().toLowerCase(); }
function normAddress(v){ return String(v||'').toLowerCase().replace(/[^a-z0-9]/g,''); }


function normalizedAngiRef(v) {
  return String(v || '').trim().replace(/\.0+$/, '');
}

function prospectHasMissionControlHistory(p) {
  if (!p) return false;
  const id = p.id;

  // Communication rows are the reliable evidence that a contact attempt was
  // actually recorded. Do not treat imported summary counters such as
  // attempts_count or last_result as user activity; the one-time historical
  // migration populated some of those fields even for untouched current leads.
  const logged = (state.sales_communications || []).some(c => c.prospect_id === id);
  const manualCallback = !!p.manual_next_follow_up_at;

  // A real conversion/appointment is also authoritative. Historical tracker
  // lead/appointment rows count too because they represent work that really
  // happened and must never be reset by a later Angi Initial status.
  const converted = !!p.converted_to_lead_at ||
    (state.leads || []).some(l => l.prospect_id === id && !l.deleted_at) ||
    (state.appointments || []).some(a => a.prospect_id === id && !a.deleted_at);

  return logged || manualCallback || converted;
}

function prospectHasGenuineDuplicate(p, phone, email, address, sourceRef) {
  const phoneKey = normPhone(phone);
  const emailKey = normEmail(email);
  const addressKey = normAddress(address);
  const refKey = normalizedAngiRef(sourceRef);

  return (state.prospects || []).some(other => {
    if (!other || other.id === p.id || other.deleted_at) return false;

    // Multiple rows created by an older migration for the SAME Angi lead are
    // not a genuine duplicate and should not keep a current untouched lead out
    // of the calling queue.
    const otherRef = normalizedAngiRef(other.source_reference);
    if (refKey && otherRef && refKey === otherRef) return false;

    return Boolean(
      (phoneKey && normPhone(other.phone) === phoneKey) ||
      (emailKey && normEmail(other.email) === emailKey) ||
      (addressKey && normAddress(other.street_address) === addressKey)
    );
  });
}

async function importAngiExport() {
  const file=$('angiImportFile').files?.[0];
  const status=$('angiImportStatus');
  if (!file) return msg('Choose the Angi .xls export.','error');
  try {
    status.textContent='Reading Angi export…';
    const rows=await readAngiExportRows(file);
    if (rows.length < 2) throw new Error('The file does not contain lead rows.');
    const headers=rows[0].map(h => String(h||'').replace(/^\uFEFF/,'').trim());
    const idx=angiHeaderIndex(headers);
    const required=[['Lead Number',idx.leadNumber],['Lead Date',idx.leadDate],['Lead Status',idx.leadStatus],['Lead Description',idx.description],['Lead Type',idx.leadType],['Customer First Name',idx.firstName],['Customer Last Name',idx.lastName],['Customer Address',idx.address],['City',idx.city],['State',idx.state],['Zip Code',idx.zip],['Phone',idx.phone],['Email',idx.email]];
    const missing=required.filter(([,i])=>i<0).map(([name])=>name);
    if (missing.length) throw new Error('This Angi export is missing expected columns: '+missing.join(', '));

    const account=detectAngiAccount(headers);
    if ($('angiImportAccount')) $('angiImportAccount').value=account;

    // Lead Number is the permanent Angi external key. Match across all Angi
    // prospects, not only within one account, so a later export cannot duplicate it.
    const existingByRef=new Map();
    state.prospects.filter(isAngiProspect).forEach(p=>{
      const ref=normalizedAngiRef(p.source_reference);
      if(ref) existingByRef.set(ref,p);
    });
    const phoneKeys=new Set(state.prospects.map(p=>normPhone(p.phone)).filter(Boolean));
    const emailKeys=new Set(state.prospects.map(p=>normEmail(p.email)).filter(Boolean));
    const addrKeys=new Set(state.prospects.map(p=>normAddress(p.street_address)).filter(Boolean));

    const inserts=[];
    const updates=[];
    let existing=0, statusAdvanced=0, sellingRemovedFromQueue=0, reactivatedCurrentInitial=0;

    for (const r of rows.slice(1)) {
      const ref=normalizedAngiRef(r[idx.leadNumber]);
      if (!ref) continue;
      const leadStatus=String(r[idx.leadStatus]||'').trim();
      const desc=String(r[idx.description]||'').trim();
      const leadType=String(r[idx.leadType]||'').trim();
      const feeRaw=idx.fee>=0?String(r[idx.fee]||'').replace(/[$,]/g,'').trim():'';
      const workflow=angiImportWorkflow(leadStatus,account);
      const existingProspect=existingByRef.get(ref);
      const originalData=angiOriginalData(headers,r);

      if (existingProspect) {
        existing++;
        const first=String(r[idx.firstName]||'').trim();
        const last=String(r[idx.lastName]||'').trim();
        const phone=String(r[idx.phone]||'').trim();
        const email=String(r[idx.email]||'').trim();
        const address=String(r[idx.address]||'').trim();
        const patch={
          source:'Angi', source_account:account, source_status:leadStatus,
          received_at:angiDateValue(r[idx.leadDate]) || existingProspect.received_at,
          source_description:desc || existingProspect.source_description,
          source_lead_type:leadType || existingProspect.source_lead_type,
          source_fee:feeRaw && !Number.isNaN(Number(feeRaw)) ? Number(feeRaw) : existingProspect.source_fee,
          first_name:first || existingProspect.first_name,
          last_name:last || existingProspect.last_name,
          customer_name:[first,last].filter(Boolean).join(' ') || existingProspect.customer_name,
          street_address:address || existingProspect.street_address,
          city:String(r[idx.city]||'').trim() || existingProspect.city,
          state:String(r[idx.state]||'').trim() || existingProspect.state || 'SC',
          zip:String(r[idx.zip]||'').trim() || existingProspect.zip,
          phone:phone || existingProspect.phone,
          email:email || existingProspect.email,
          work_category:angiWorkCategory(desc) || existingProspect.work_category,
          phone_key:normPhone(phone || existingProspect.phone)||null,
          email_key:normEmail(email || existingProspect.email)||null,
          address_key:normAddress(address || existingProspect.street_address)||null,
          angi_original_data:{...(existingProspect.angi_original_data||{}),...originalData},
          updated_at:new Date().toISOString()
        };
        const sourceKind=angiSourceStatusKind(leadStatus);
        const current=angiStatusKey(existingProspect);
        const closed=angiIsAppointmentOrClosed(existingProspect);

        // If a CURRENT export says Initial, and this row only exists because of
        // the one-time historical migration, treat it as a real current untouched
        // prospect when Bauer Roofing Operations has no actual contact history for it.
        // This is what lets newly-arrived Angi people move from the historical
        // store into the live Angi Queue without creating a duplicate row.
        if (
          sourceKind === 'initial' &&
          !existingProspect.deleted_at &&
          !prospectHasMissionControlHistory(existingProspect)
        ) {
          const genuineDuplicate = prospectHasGenuineDuplicate(
            existingProspect,
            phone || existingProspect.phone,
            email || existingProspect.email,
            address || existingProspect.street_address,
            ref
          );

          Object.assign(patch, {
            historical_import:false,
            current_status:'New',
            attempts_count:0,
            historical_attempts:'0',
            last_attempt_at:null,
            last_result:null,
            cadence_phase:'Day 1',
            cadence_started_at:null,
            manual_next_follow_up_at:null,
            cadence_next_follow_up_at:null,
            next_follow_up_at:null,
            next_action:'Call now',
            archive_flag:false,
            archived_at:null,
            duplicate_flag:genuineDuplicate,
            initial_contact_eligible:true,
            initial_contact_suppressed_reason:null
          });
          reactivatedCurrentInitial++;
        }

        // Match the old importer: Angi may move a record FORWARD, but never
        // erase Bauer Roofing Operations calls, notes, callbacks, or later workflow.
        if (sourceKind === 'selling' && !closed) {
          Object.assign(patch,{
            current_status:'Appointment Set', cadence_phase:'Paused',
            manual_next_follow_up_at:null, cadence_next_follow_up_at:null, next_follow_up_at:null,
            next_action:null, marketsharp_status:account === 'Bauer Roofing - PPL' ? 'Automatic' : 'Needs Entry',
            initial_contact_eligible:false,
            initial_contact_suppressed_reason:'Angi status Selling - appointment already set'
          });
          statusAdvanced++;
          sellingRemovedFromQueue++;
        } else if ((sourceKind === 'contact' || sourceKind === 'connected') && !closed && (!current || current === 'new' || current === 'needs initial review') && Number(existingProspect.attempts_count||0)===0) {
          Object.assign(patch,{
            current_status:sourceKind === 'connected' ? 'Connected' : 'Attempting Contact',
            attempts_count:Math.max(1,Number(existingProspect.attempts_count||0)),
            historical_attempts:existingProspect.historical_attempts || '1',
            cadence_phase:'Paused', next_action:'Review prior Angi contact and follow up',
            initial_contact_eligible:false, initial_contact_suppressed_reason:'Angi shows prior contact'
          });
          statusAdvanced++;
        }
        updates.push({id:existingProspect.id,patch});
        continue;
      }

      const first=String(r[idx.firstName]||'').trim();
      const last=String(r[idx.lastName]||'').trim();
      const phone=String(r[idx.phone]||'').trim();
      const email=String(r[idx.email]||'').trim();
      const address=String(r[idx.address]||'').trim();
      const duplicate=(normPhone(phone)&&phoneKeys.has(normPhone(phone)))||(normEmail(email)&&emailKeys.has(normEmail(email)))||(normAddress(address)&&addrKeys.has(normAddress(address)));

      inserts.push({
        source:'Angi',source_account:account,source_reference:ref,import_source:'Angi Export',
        received_at:angiDateValue(r[idx.leadDate]), source_status:leadStatus,
        source_description:desc,source_lead_type:leadType,
        source_fee:feeRaw && !Number.isNaN(Number(feeRaw)) ? Number(feeRaw) : null,
        first_name:first,last_name:last,customer_name:[first,last].filter(Boolean).join(' '),
        street_address:address,city:String(r[idx.city]||'').trim(),state:String(r[idx.state]||'').trim()||'SC',zip:String(r[idx.zip]||'').trim(),
        phone,email,work_category:angiWorkCategory(desc),assigned_to:'Eve',
        prior_handling:workflow.attempts_count ? 'Unknown' : 'No Contact',
        current_status:workflow.current_status,attempts_count:workflow.attempts_count,historical_attempts:workflow.historical_attempts,
        cadence_phase:workflow.cadence_phase,manual_next_follow_up_at:null,cadence_next_follow_up_at:null,next_follow_up_at:null,
        next_action:workflow.next_action,marketsharp_status:workflow.marketsharp_status,
        initial_contact_eligible:workflow.initial_contact_eligible,
        initial_contact_suppressed_reason:workflow.initial_contact_suppressed_reason,
        duplicate_flag:!!duplicate,
        angi_original_data:originalData,
        phone_key:normPhone(phone)||null,email_key:normEmail(email)||null,address_key:normAddress(address)||null
      });
      existingByRef.set(ref,{source_reference:ref});
      if (normPhone(phone)) phoneKeys.add(normPhone(phone));
      if (normEmail(email)) emailKeys.add(normEmail(email));
      if (normAddress(address)) addrKeys.add(normAddress(address));
    }

    for (let i=0;i<updates.length;i+=50) {
      const batch=updates.slice(i,i+50);
      const results=await Promise.all(batch.map(u=>db.from('prospects').update(u.patch).eq('id',u.id)));
      const failed=results.find(x=>x.error); if(failed) throw failed.error;
    }
    if (inserts.length) {
      for (let i=0;i<inserts.length;i+=100) {
        const r=await db.from('prospects').insert(inserts.slice(i,i+100));
        if (r.error) throw r.error;
      }
    }

    await loadAll();
    $('angiImportFile').value='';
    status.textContent=`${account} detected. Imported ${inserts.length} new prospect${inserts.length===1?'':'s'}; reviewed ${existing} existing Angi record${existing===1?'':'s'}; moved ${reactivatedCurrentInitial} current untouched prospect${reactivatedCurrentInitial===1?'':'s'} into the Angi Queue; advanced ${statusAdvanced} workflow status${statusAdvanced===1?'':'es'}.`;
    renderAngiQueue();
    msg(`Angi import complete. ${sellingRemovedFromQueue ? sellingRemovedFromQueue+' Selling record'+(sellingRemovedFromQueue===1?' was':'s were')+' removed from the call queue. ' : ''}Existing Bauer Roofing Operations history was preserved.`,'success');
  } catch(error) { status.textContent=''; msg('Could not import Angi export: '+(error.message||String(error)),'error'); }
}

function leadMatchesSearch(lead, query) {
  if (!query) return true;
  const q = String(query).trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    leadName(lead),
    lead.first_name,
    lead.last_name,
    lead.street_address,
    lead.city,
    lead.state,
    lead.zip,
    lead.phone,
    lead.email,
    lead.lead_number,
    lead.source,
    lead.source_reference
  ].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(q);
}

function leadStatusTone(status) {
  const s = String(status || '').toLowerCase();
  if (s.includes('appointment')) return 'tone-appointment';
  if (s.includes('estimate') || s.includes('proposal')) return 'tone-estimate';
  if (s.includes('sold') || s.includes('signed')) return 'tone-sold';
  if (s.includes('not moving') || s.includes('rejected')) return 'tone-closed';
  return 'tone-active';
}

function leadDateLabel(lead) {
  const source = String(lead?.source || '').toLowerCase();
  return source.includes('angi') || source.includes('homeadvisor')
    ? 'ANGI LEAD DATE'
    : 'FIRST APPOINTMENT DATE';
}

function leadUpcomingAppointments(leadId) {
  const now = new Date();
  return state.appointments
    .filter(a => activeRow(a) && a.lead_id === leadId && a.appointment_at && new Date(a.appointment_at) >= now && !['Cancelled','Completed'].includes(a.appointment_status))
    .sort((a,b) => new Date(a.appointment_at) - new Date(b.appointment_at));
}

function leadAppointments(leadId) {
  return state.appointments
    .filter(a => activeRow(a) && a.lead_id === leadId && a.appointment_at)
    .sort((a,b) => new Date(b.appointment_at) - new Date(a.appointment_at));
}

function duplicateAppointmentsFor(appointment) {
  if (!appointment?.lead_id || !appointment.appointment_at) return [];
  const targetMinute = Math.floor(new Date(appointment.appointment_at).getTime()/60000);
  return state.appointments.filter(other =>
    activeRow(other) &&
    other.lead_id === appointment.lead_id &&
    other.appointment_at &&
    Math.floor(new Date(other.appointment_at).getTime()/60000) === targetMinute
  );
}

function preferredAppointment(group) {
  return group.slice().sort((a,b) => {
    const score = item =>
      (item.external_import_key ? 8 : 0) +
      (item.appointment_result ? 4 : 0) +
      (item.appointment_type && item.appointment_type !== 'Measure & Presentation' ? 2 : 0) +
      (item.google_calendar_status === 'Added' ? 1 : 0);
    return score(b) - score(a);
  })[0];
}

function mergeTextValues(values, separator='\n\n') {
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))].join(separator) || null;
}

async function mergeDuplicateAppointments(appointmentId) {
  const selected = state.appointments.find(item => item.id === appointmentId);
  const group = duplicateAppointmentsFor(selected);
  if (group.length < 2) return msg('No duplicate appointment remains at that time.','error');

  const lead = state.leads.find(item => item.id === selected.lead_id);
  const when = formatWhen(selected.appointment_at);
  if (!confirm(`Merge ${group.length} appointments for ${lead ? leadName(lead) : 'this lead'} at ${when}? The combined appointment will keep the calendar link, result, and notes.`)) return;

  const keep = preferredAppointment(group);
  const specificType = group.find(item => item.appointment_type && item.appointment_type !== 'Measure & Presentation')?.appointment_type;
  const resultSource = group.filter(item => item.appointment_result).sort((a,b) => String(b.appointment_result_at || '').localeCompare(String(a.appointment_result_at || '')))[0];
  const patch = {
    appointment_type: specificType || keep.appointment_type || 'Measure & Presentation',
    appointment_status: resultSource ? 'Completed' : (keep.appointment_status || group.find(item => item.appointment_status)?.appointment_status || 'Scheduled'),
    assigned_to: keep.assigned_to || group.find(item => item.assigned_to)?.assigned_to || 'Roy',
    appointment_result: resultSource?.appointment_result || null,
    appointment_result_note: mergeTextValues(group.map(item => item.appointment_result_note)),
    appointment_result_at: resultSource?.appointment_result_at || null,
    appointment_result_by: resultSource?.appointment_result_by || null,
    notes: mergeTextValues(group.map(item => item.notes)),
    marketsharp_status: group.find(item => item.marketsharp_status === 'Added' || item.marketsharp_status === 'Already There')?.marketsharp_status || keep.marketsharp_status || 'Not Needed Yet',
    google_calendar_status: group.some(item => item.google_calendar_status === 'Added') ? 'Added' : (keep.google_calendar_status || 'Not Added'),
    external_import_key: keep.external_import_key || group.find(item => item.external_import_key)?.external_import_key || null,
    import_source: keep.import_source || group.find(item => item.import_source)?.import_source || null
  };
  const removeIds = group.filter(item => item.id !== keep.id).map(item => item.id);
  const {error} = await db.rpc('merge_duplicate_appointments',{
    p_keep_id: keep.id,
    p_remove_ids: removeIds,
    p_patch: patch
  });
  if(error) throw error;
  await loadAll();
  msg(`${group.length} duplicate appointments merged into one.`,'success');
}

function appointmentTypeLabel(appointment) {
  if (appointment.appointment_type) return appointment.appointment_type;
  const match = String(appointment.notes || '').match(/Appointment type:\s*([^\n]+)/i);
  return match ? match[1].trim() : 'Measure & Presentation';
}

function leadPatchForAppointmentResult(result) {
  if(result==='Estimate needed'||result==='Another professional needs to look at the work') return {lead_status:'Estimate Pending',estimate_status:'Expected'};
  if(result==='Estimate sent / given') return {lead_status:'Estimate Sent',estimate_status:'Sent'};
  if(result==='Another appointment needed'||result==='Reschedule') return {lead_status:'Scheduling'};
  if(result==='Contract signed') return {lead_status:'Sold'};
  if(result==='Not interested') return {lead_status:'Not Moving Forward'};
  return {};
}

function renderLeadDetail() {
  const detail = $('leadDetail');
  if (!detail) return;

  const activeLeads = state.leads.filter(l => visibleLead(l) && !['Sold','Not Moving Forward'].includes(l.lead_status));
  const selectedVisibleLead = state.leads.find(l => visibleLead(l) && l.id === selectedLeadId);
  const query = $('leadSearch') ? $('leadSearch').value : '';
  const matching = activeLeads.filter(l => leadMatchesSearch(l, query));
  let lead = matching.find(l => l.id === selectedLeadId) || selectedVisibleLead || activeLeads.find(l => l.id === selectedLeadId);

  if (!lead && matching.length) {
    selectedLeadId = matching[0].id;
    lead = matching[0];
  }

  if (!lead) {
    selectedLeadId = '';
    detail.innerHTML = empty(query ? 'No leads match that search.' : 'Select a lead.');
    return;
  }

  const appts = leadAppointments(lead.id);
  const sourceLine = [lead.lead_number ? 'Lead # ' + lead.lead_number : 'Lead # not entered', lead.source, lead.assigned_to].filter(Boolean).join(' • ');
  const address = [lead.street_address, lead.city, lead.state, lead.zip].filter(Boolean).join(lead.street_address && lead.city ? ', ' : ' ');
  const apptHtml = appts.length ? `
    <div class="lead-detail-appt header"><span>Date / Time</span><span>Type</span><span>Salesperson</span><span>Result / Reason</span><span></span></div>
    ${appts.map(a => { const duplicates=duplicateAppointmentsFor(a); return `<div class="lead-detail-appt">
      <b>${esc(formatWhen(a.appointment_at))}</b>
      <span>${esc(appointmentTypeLabel(a))}</span>
      <span>${esc(a.assigned_to || '—')}</span>
      <span>${a.appointment_result ? `<b>${esc(a.appointment_result)}</b>${a.appointment_result_note ? `<small class="appointment-result-note">${esc(a.appointment_result_note)}</small>` : ''}` : '<span class="appointment-result-empty">—</span>'}</span>
      <div class="appointment-row-actions"><button class="btn small" data-edit-appointment="${esc(a.id)}">Edit</button><button class="btn small" data-record-action="delete" data-record-table="appointments" data-record-id="${esc(a.id)}">Delete</button>${duplicates.length>1?`<button class="btn primary small" data-merge-appointment="${esc(a.id)}">Merge ${duplicates.length}</button>`:''}</div>
    </div>`; }).join('')}` : '<div class="meta">No appointments entered yet.</div>';

  detail.innerHTML = `
    <div class="lead-detail-head">
      <span class="lead-status-pill ${leadStatusTone(lead.lead_status)}">${esc(lead.lead_status || 'Appointment Wanted')}</span>
      <h2>${esc(leadName(lead))}</h2>
      <div class="meta">${esc(sourceLine)}</div>
    </div>

    ${contactActionHtml({phone:lead.phone,email:lead.email,kind:'lead',id:lead.id,name:leadName(lead),extraHtml:`${teamTextButtons('lead',lead.id)}<button class="btn primary" data-edit-lead="${esc(lead.id)}">View / Edit</button>`})}

    <div class="lead-info-grid">
      <div class="info-tile"><span>PHONE</span><b>${esc(lead.phone || '—')}</b></div>
      <div class="info-tile"><span>OTHER PHONE</span><b>${esc(lead.phone_secondary || '—')}</b></div>
      <div class="info-tile"><span>EMAIL</span><b>${esc(lead.email || '—')}</b></div>
      <div class="info-tile"><span>${leadDateLabel(lead)}</span><b>${esc(lead.lead_date || '—')}</b></div>
      <div class="info-tile wide"><span>PROPERTY</span><b>${esc(address || '—')}</b></div>
      <div class="info-tile"><span>ESTIMATE</span><b>${esc(lead.estimate_status || 'Not Known')}</b></div>
      <div class="info-tile"><span>SOURCE</span><b>${esc(lead.source || '—')}</b></div>
    </div>

    ${lead.spouse_name ? `<div class="lead-detail-note"><span>SPOUSE</span>${esc(lead.spouse_name)}</div>` : ''}

    ${lead.estimate_note ? `<div class="lead-detail-note"><span>ESTIMATE NOTE</span>${esc(lead.estimate_note)}</div>` : ''}
    ${lead.notes ? `<div class="lead-detail-note"><span>LEAD NOTES</span>${esc(lead.notes)}</div>` : ''}

    <div class="lead-detail-section-title">Appointments</div>
    <div class="lead-detail-appointments">${apptHtml}</div>

    <details class="comm-history-details" open>
      <summary>Communication History</summary>
      ${communicationHistoryHtml('lead',lead.id)}
    </details>

    <div class="actions lead-detail-actions">
      <button class="btn" data-record-action="archive" data-record-table="leads" data-record-id="${esc(lead.id)}">Archive</button>
      <button class="btn" data-record-action="delete" data-record-table="leads" data-record-id="${esc(lead.id)}">Delete</button>
    </div>`;
}

function renderProspectsLeads() {
  if (!$('leadList')) return;
  const now = new Date();
  const activeLeads = state.leads.filter(l => visibleLead(l) && !['Sold','Not Moving Forward'].includes(l.lead_status));
  const upcomingAppointments = state.appointments
    .filter(a => activeRow(a) && a.appointment_at && new Date(a.appointment_at) >= now && !['Cancelled','Completed'].includes(a.appointment_status))
    .sort((a,b) => new Date(a.appointment_at) - new Date(b.appointment_at));

  $('kpiLeads').textContent = activeLeads.length;
  $('kpiAppointments').textContent = upcomingAppointments.length;

  const query = $('leadSearch') ? $('leadSearch').value : '';
  const leadSort=$('leadSort')?.value||'newest';
  const matchingLeads = activeLeads.filter(l => leadMatchesSearch(l, query)).slice().sort((a,b) => {
    if(leadSort==='oldest')return String(a.created_at||a.lead_date||'').localeCompare(String(b.created_at||b.lead_date||''));
    if(leadSort==='appointment'){
      const aa=leadUpcomingAppointments(a.id)[0]?.appointment_at||'9999';
      const ba=leadUpcomingAppointments(b.id)[0]?.appointment_at||'9999';
      return String(aa).localeCompare(String(ba));
    }
    if(leadSort==='zip')return reportZip(a).localeCompare(reportZip(b),undefined,{numeric:true})||leadName(a).localeCompare(leadName(b));
    if(leadSort==='source')return String(a.source||'').localeCompare(String(b.source||''))||leadName(a).localeCompare(leadName(b));
    if(leadSort==='type')return String(a.work_category||a.lead_type||'').localeCompare(String(b.work_category||b.lead_type||''))||leadName(a).localeCompare(leadName(b));
    if(leadSort==='name')return leadName(a).localeCompare(leadName(b));
    return String(b.created_at||b.lead_date||'').localeCompare(String(a.created_at||a.lead_date||''));
  });

  if (!selectedLeadId || !state.leads.some(l => visibleLead(l) && l.id === selectedLeadId)) {
    selectedLeadId = matchingLeads.length ? matchingLeads[0].id : '';
  }

  $('leadList').innerHTML = matchingLeads.map(l => {
    const nextAppt = leadUpcomingAppointments(l.id)[0];
    const tone = leadStatusTone(l.lead_status);
    return `<button class="lead-queue-row ${tone}${l.id === selectedLeadId ? ' selected' : ''}" data-lead-select="${esc(l.id)}" type="button">
      <div class="lead-row-top"><strong>${esc(leadName(l))}</strong><span class="lead-status-pill ${tone}">${esc(l.lead_status || 'Appointment Wanted')}</span></div>
      <div class="meta">${l.lead_number ? 'Lead # ' + esc(l.lead_number) : 'Lead # not entered'}${l.source ? ' • ' + esc(l.source) : ''}</div>
      ${l.street_address ? `<div class="lead-row-address">${esc(l.street_address)}${l.city ? ', ' + esc(l.city) : ''}</div>` : ''}
      <div class="lead-row-next">${nextAppt ? 'Next appointment: ' + esc(formatWhen(nextAppt.appointment_at)) : 'Estimate: ' + esc(l.estimate_status || 'Not Known')}</div>
    </button>`;
  }).join('') || empty(query ? 'No leads match that search.' : 'No leads yet.');

  renderLeadDetail();

  $('appointmentList').innerHTML = upcomingAppointments.slice(0,20).map(a => {
    const lead = state.leads.find(l => l.id === a.lead_id);
    return `<div class="task"><b>${esc(lead ? leadName(lead) : 'Lead')}</b><div class="meta">${esc(formatWhen(a.appointment_at))} • ${esc(a.appointment_status || 'Scheduled')}${a.assigned_to ? ' • ' + esc(a.assigned_to) : ''} • MarketSharp: ${esc(a.marketsharp_status || 'Not Needed Yet')}</div><div class="actions"><button class="btn small" data-edit-appointment="${esc(a.id)}">Edit</button><button class="btn small" data-record-action="delete" data-record-table="appointments" data-record-id="${esc(a.id)}">Delete</button></div></div>`;
  }).join('') || empty('No upcoming appointments entered yet.');

  const archivedLeads = state.leads.filter(l => !l.deleted_at && l.archived_at);
  $('archivedSalesList').innerHTML = archivedLeads.map(l => `<div class="task"><b>${esc(leadName(l))}</b><div class="meta">${l.lead_number ? 'Lead # ' + esc(l.lead_number) : ''}${l.street_address ? ' • ' + esc(l.street_address) : ''}</div><div class="actions"><button class="btn small" data-record-action="restore" data-record-table="leads" data-record-id="${esc(l.id)}">Restore</button><button class="btn small" data-record-action="delete" data-record-table="leads" data-record-id="${esc(l.id)}">Delete</button></div></div>`).join('') || empty('No archived leads.');
}

function renderJobs() {
  const jobSort=$('jobSort')?.value||'updated';
  const query=String($('jobSearch')?.value||'').trim().toLowerCase();
  const matchesSearch=j=>!query||[
    j.customer_name,j.job_number,j.lead_number,j.property_address,reportZip(j),j.salesperson,
    j.primary_job_type,j.job_type,j.stage,j.material_type,j.material_color,j.production_blocker
  ].some(value=>String(value||'').toLowerCase().includes(query));
  const allActiveJobs=state.jobs.filter(activeRow).filter(j=>!jobIsCancelled(j));
  const activeJobs = allActiveJobs.filter(matchesSearch).slice().sort((a,b)=>{
    if(jobSort==='contract')return String(b.contract_date||'').localeCompare(String(a.contract_date||''));
    if(jobSort==='start')return String(a.confirmed_start_date||a.target_start_date||'9999').localeCompare(String(b.confirmed_start_date||b.target_start_date||'9999'));
    if(jobSort==='zip')return reportZip(a).localeCompare(reportZip(b),undefined,{numeric:true})||String(a.customer_name||'').localeCompare(String(b.customer_name||''));
    if(jobSort==='type')return String(a.primary_job_type||a.job_type||'').localeCompare(String(b.primary_job_type||b.job_type||''))||String(a.customer_name||'').localeCompare(String(b.customer_name||''));
    if(jobSort==='stage')return String(a.stage||'').localeCompare(String(b.stage||''))||String(a.customer_name||'').localeCompare(String(b.customer_name||''));
    if(jobSort==='name')return String(a.customer_name||'').localeCompare(String(b.customer_name||''));
    return String(b.updated_at||b.created_at||'').localeCompare(String(a.updated_at||a.created_at||''));
  });
  const today=todayISO();
  const needsUpdate=allActiveJobs.filter(j=>!['Final / Closed','Closed'].includes(j.stage||'') && (!j.dad_acknowledged_at || !j.production_next_update_date || j.production_next_update_date<=today));
  const needsContact=allActiveJobs.filter(j=>!['Final / Closed','Closed'].includes(j.stage||'') && (j.client_communication_needed || (j.client_communication_due_date && j.client_communication_due_date<=today)));
  if($('productionActiveKpi')) $('productionActiveKpi').textContent=allActiveJobs.filter(j=>!['Final / Closed','Closed'].includes(j.stage||'')).length;
  if($('productionUpdateKpi')) $('productionUpdateKpi').textContent=needsUpdate.length;
  if($('productionContactKpi')) $('productionContactKpi').textContent=needsContact.length;
  const rows = activeJobs.map(j => {
    const contact = contactForJob(j);
    const updateDue=!j.dad_acknowledged_at || !j.production_next_update_date || j.production_next_update_date<=today;
    const contactDue=j.client_communication_needed || (j.client_communication_due_date && j.client_communication_due_date<=today);
    return `<div class="production-job-card ${updateDue?'needs-update':''} ${contactDue?'needs-contact':''}">
      <div class="production-job-head"><div><b>${esc(j.customer_name || 'Unnamed customer')}</b><div class="meta">${j.job_number ? 'Job # '+esc(j.job_number)+' • ' : ''}${esc(j.property_address || 'No address')}</div></div><span class="production-stage">${esc(j.stage || 'Needs Production Review')}</span></div>
      <div class="production-job-grid">
        <div><span>START</span><b>${esc(j.confirmed_start_date || j.target_start_date || 'Not scheduled')}</b></div>
        <div><span>MATERIALS</span><b>${esc([j.material_type,j.material_color].filter(Boolean).join(' • ') || 'Not entered')}</b></div>
        <div><span>DELIVERY</span><b>${esc(j.material_delivery_date || 'Not scheduled')}</b></div>
        <div><span>NEXT UPDATE</span><b>${esc(j.production_next_update_date || 'Due now')}</b></div>
      </div>
      ${j.production_blocker ? `<div class="production-alert"><b>Waiting on:</b> ${esc(j.production_blocker)}</div>` : ''}
      ${contactDue ? `<div class="production-alert customer"><b>Customer contact:</b> ${esc(j.client_communication_reason || 'Weekly production check-in is due')}</div>` : ''}
      <div class="actions">${contactActionHtml({phone:contact.phone,email:contact.email,kind:'job',id:j.id,name:contact.name})}${teamTextButtons('job',j.id)}${contactDue?`<button class="btn success small" data-job-contacted="${esc(j.id)}">Mark Customer Contacted</button>`:''}<button class="btn small" data-edit-job="${esc(j.id)}">View / Edit</button><button class="btn danger small" data-cancel-job="${esc(j.id)}">Cancel Job</button><button class="btn small" data-record-action="archive" data-record-table="jobs" data-record-id="${esc(j.id)}">Archive</button><button class="btn small" data-record-action="delete" data-record-table="jobs" data-record-id="${esc(j.id)}">Delete</button></div>
      <details><summary>Communication history</summary>${communicationHistoryHtml('job',j.id)}</details>
    </div>`;
  }).join('');
  $('jobsTable').innerHTML = rows || empty(query?'No active jobs match your search.':'No active jobs entered yet.');
  $('allComms').innerHTML = state.communications.map(c => `<div class="task"><b>${esc(c.purpose)}</b><div class="meta ${c.due_date && c.due_date < todayISO() && c.status !== 'Completed' ? 'comm-overdue' : ''}">${esc(c.type)} • ${esc(c.status)} • Due ${esc(c.due_date || '')} ${esc(c.due_time || '')}</div></div>`).join('') || empty('No communication responsibilities yet.');
  const cancelled=state.jobs.filter(j=>activeRow(j)&&jobIsCancelled(j)&&matchesSearch(j)).slice().sort((a,b)=>String(b.updated_at||b.created_at||'').localeCompare(String(a.updated_at||a.created_at||'')));
  $('cancelledJobsList').innerHTML=cancelled.map(j=>{
    const reason=String(j.production_blocker||'').replace(/^cancelled:\s*/i,'')||'No reason entered';
    return `<div class="task"><b>${esc(j.customer_name||'Unnamed customer')}</b><div class="meta">${j.job_number?'Job # '+esc(j.job_number):''}${j.property_address?' • '+esc(j.property_address):''}</div><div class="meta"><b>Reason:</b> ${esc(reason)}</div><div class="actions">${teamTextButtons('job',j.id)}<button class="btn small" data-reopen-job="${esc(j.id)}">Reopen Job</button><button class="btn small" data-edit-job="${esc(j.id)}">View / Edit</button><button class="btn small" data-record-action="archive" data-record-table="jobs" data-record-id="${esc(j.id)}">Archive</button></div></div>`;
  }).join('')||empty(query?'No canceled jobs match your search.':'No canceled jobs.');
  const archived = state.jobs.filter(j => !j.deleted_at && j.archived_at && matchesSearch(j));
  $('archivedJobsList').innerHTML = archived.map(j => `<div class="task"><b>${esc(j.customer_name || 'Unnamed customer')}</b><div class="meta">${j.job_number ? 'Job # ' + esc(j.job_number) : ''}${j.property_address ? ' • ' + esc(j.property_address) : ''}</div><div class="actions"><button class="btn small" data-record-action="restore" data-record-table="jobs" data-record-id="${esc(j.id)}">Restore</button><button class="btn small" data-record-action="delete" data-record-table="jobs" data-record-id="${esc(j.id)}">Delete</button></div></div>`).join('') || empty(query?'No archived jobs match your search.':'No archived jobs.');
}

function clearPhoneForm() {
  ['pmEditId','pmName','pmStreet','pmPhone','pmEmail','pmReason','pmNotes','pmRelatedNumber'].forEach(id => { if ($(id)) $(id).value = ''; });
  $('pmFor').value = ''; $('pmFollow').value = 'No';
  $('phoneFormTitle').textContent = 'Phone Message'; $('savePhoneBtn').textContent = 'Save Message'; $('cancelPhoneEditBtn').classList.add('hidden');
}

function openPhoneEdit(id) {
  const p = state.phone.find(x => x.id === id); if (!p) return;
  $('pmEditId').value = p.id; $('pmName').value = p.caller_name || ''; $('pmStreet').value = p.street_address || ''; $('pmPhone').value = p.phone || ''; $('pmEmail').value = p.email || ''; $('pmFor').value = p.called_for || ''; $('pmReason').value = p.reason_message || ''; $('pmFollow').value = p.follow_up_needed ? 'Yes' : 'No'; $('pmNotes').value = p.follow_up_notes || ''; $('pmRelatedNumber').value = p.related_number || p.job_number || p.lead_number || '';
  $('phoneFormTitle').textContent = 'Edit Phone Message'; $('savePhoneBtn').textContent = 'Save Changes'; $('cancelPhoneEditBtn').classList.remove('hidden'); setView('phone'); window.scrollTo({top:0,behavior:'smooth'});
}

async function savePhone() {
  try {
    const id = $('pmEditId')?.value || '';
    const related = resolveRelatedNumber($('pmRelatedNumber').value);
    const row = { caller_name:$('pmName').value.trim(), street_address:$('pmStreet').value.trim(), phone:$('pmPhone').value.trim(), email:$('pmEmail').value.trim(), called_for:$('pmFor').value.trim(), reason_message:$('pmReason').value.trim(), follow_up_needed:$('pmFollow').value === 'Yes', follow_up_status:$('pmFollow').value === 'Yes' ? 'Open' : 'None', follow_up_notes:$('pmNotes').value.trim(), related_number:related.related_number, lead_number:related.lead_number, job_number:related.job_number, related_job_id:null };
    if (!row.caller_name && !row.phone && !row.reason_message) return msg('Enter at least a caller name, phone number, or message.','error');
    if (id) { await updateRecord('phone_messages', id, row, 'Phone message changes undone.'); }
    else { const r = await db.from('phone_messages').insert(row).select().single(); if (r.error) throw r.error; await db.from('undo_history').insert({action_type:'create',entity_type:'phone_messages',entity_id:r.data.id,description:'New phone message removed.',payload:{}}); }
    clearPhoneForm(); await loadAll(); msg(id ? 'Phone message updated.' : 'Phone message saved.','success');
  } catch(error) { msg(error.message || String(error),'error'); }
}

function clearIncomingForm() { $('incomingEditId').value=''; $('incomingDesc').value=''; $('incomingSource').value=''; $('incomingFormTitle').textContent='Capture Incoming Work'; $('saveIncomingBtn').textContent='Capture'; $('cancelIncomingEditBtn').classList.add('hidden'); }
function openIncomingEdit(id) { const x=state.incoming.find(i=>i.id===id); if(!x)return; $('incomingEditId').value=x.id; $('incomingDesc').value=x.description||''; $('incomingSource').value=x.source||''; $('incomingFormTitle').textContent='Edit Incoming Work'; $('saveIncomingBtn').textContent='Save Changes'; $('cancelIncomingEditBtn').classList.remove('hidden'); setView('incoming'); window.scrollTo({top:0,behavior:'smooth'}); }
async function saveIncoming() { try { const id=$('incomingEditId').value; const description=$('incomingDesc').value.trim(); if(!description)return msg('Enter what came in first.','error'); const patch={description,source:$('incomingSource').value.trim(),status:id?(state.incoming.find(x=>x.id===id)?.status||'Open'):'Open'}; if(id){await updateRecord('incoming',id,patch,'Incoming work changes undone.');} else {const r=await db.from('incoming').insert(patch).select().single(); if(r.error)throw r.error; await db.from('undo_history').insert({action_type:'create',entity_type:'incoming',entity_id:r.data.id,description:'New incoming item removed.',payload:{}});} clearIncomingForm(); await loadAll(); msg(id?'Incoming work updated.':'Incoming work captured.','success'); } catch(error){msg(error.message||String(error),'error');} }

function taskPlacement(t){
  if(['Needs Your Attention','Communication Due','Financial / QuickBooks'].includes(t?.category)) return t.category;
  if(isCommunicationTask(t)) return 'Communication Due';
  if(isFinancialTask(t)) return 'Financial / QuickBooks';
  return 'Needs Your Attention';
}

function taskSubtaskLines(){
  return [...new Set(String($('taskSubtasks')?.value||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean))];
}

async function syncTaskSubtasks(taskId,titles){
  const existing=(state.task_subtasks||[]).filter(s=>s.task_id===taskId&&!s.deleted_at);
  const wanted=new Set(titles.map(x=>x.toLowerCase()));
  for(const old of existing){
    if(!wanted.has(String(old.title||'').toLowerCase())){
      const removed=await db.from('task_subtasks').update({deleted_at:new Date().toISOString()}).eq('id',old.id);
      if(removed.error) throw removed.error;
    }
  }
  const additions=[];
  for(let i=0;i<titles.length;i++){
    const found=existing.find(s=>String(s.title||'').toLowerCase()===titles[i].toLowerCase());
    if(found){
      const updated=await db.from('task_subtasks').update({title:titles[i],sort_order:i,deleted_at:null}).eq('id',found.id);
      if(updated.error) throw updated.error;
    }else additions.push({task_id:taskId,title:titles[i],sort_order:i});
  }
  if(additions.length){const inserted=await db.from('task_subtasks').insert(additions);if(inserted.error)throw inserted.error;}
}

function clearTaskForm() {
  ['taskEditId','taskName','taskDueDate','taskDueTime','taskRelatedNumber','taskDescription','taskNext','taskNotes','taskSubtasks'].forEach(id=>{if($(id))$(id).value='';});
  $('taskCategory').value='Needs Your Attention'; $('taskPriority').value='Normal'; $('taskRepeat').value='None'; $('taskDialogTitle').textContent='New Task'; $('saveTaskBtn').textContent='Save';
}
function openTaskEdit(id) {
  const t=state.tasks.find(x=>x.id===id); if(!t)return; clearTaskForm();
  $('taskEditId').value=t.id; $('taskName').value=t.task||''; $('taskCategory').value=taskPlacement(t); $('taskPriority').value=t.base_priority||'Normal'; $('taskDueDate').value=t.due_date||''; $('taskDueTime').value=t.due_time||''; $('taskRepeat').value=t.repeat_pattern||'None'; $('taskRelatedNumber').value=t.related_number||t.job_number||t.lead_number||''; $('taskDescription').value=t.description||''; $('taskNext').value=t.next_action||''; $('taskNotes').value=t.notes||''; $('taskSubtasks').value=(state.task_subtasks||[]).filter(s=>s.task_id===t.id&&!s.deleted_at).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)).map(s=>s.title).join('\n'); $('taskDialogTitle').textContent='Edit Task'; $('saveTaskBtn').textContent='Save Changes'; $('taskDialog').showModal();
}
function duplicateTask(id) {
  const t=state.tasks.find(x=>x.id===id); if(!t)return; clearTaskForm();
  $('taskName').value=t.task||''; $('taskCategory').value=taskPlacement(t); $('taskPriority').value=t.base_priority||'Normal'; $('taskDueDate').value=t.due_date||''; $('taskDueTime').value=t.due_time||''; $('taskRepeat').value=t.repeat_pattern||'None'; $('taskRelatedNumber').value=t.related_number||t.job_number||t.lead_number||''; $('taskDescription').value=t.description||''; $('taskNext').value=t.next_action||''; $('taskNotes').value=t.notes||''; $('taskSubtasks').value=(state.task_subtasks||[]).filter(s=>s.task_id===t.id&&!s.deleted_at).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)).map(s=>s.title).join('\n'); $('taskDialogTitle').textContent='Duplicate Task'; $('saveTaskBtn').textContent='Create Duplicate'; $('taskDialog').showModal();
}

function clearSopForm() {
  ['sopEditId','sopTitle','sopPurpose','sopWhen','sopPrerequisites','sopInstructions','sopVerify'].forEach(id=>{if($(id))$(id).value='';});
  $('sopDialogTitle').textContent='Add SOP';
  $('saveSopBtn').textContent='Save SOP';
}

function openSopEditor(id='') {
  clearSopForm();
  const s=id?state.sops.find(x=>String(x.id)===String(id)):null;
  if(s){
    $('sopEditId').value=s.id; $('sopTitle').value=s.title||''; $('sopPurpose').value=s.purpose||''; $('sopWhen').value=s.when_to_use||''; $('sopPrerequisites').value=s.prerequisites||''; $('sopInstructions').value=s.instructions||''; $('sopVerify').value=s.how_to_verify||''; $('sopDialogTitle').textContent='Edit SOP'; $('saveSopBtn').textContent='Save Changes';
  }
  $('sopDialog').showModal();
}

async function saveSop() {
  try{
    const id=$('sopEditId').value;
    const row={title:$('sopTitle').value.trim(),purpose:$('sopPurpose').value.trim(),when_to_use:$('sopWhen').value.trim(),prerequisites:$('sopPrerequisites').value.trim(),instructions:$('sopInstructions').value.trim(),how_to_verify:$('sopVerify').value.trim()};
    if(!row.title)return msg('SOP title is required.','error');
    if(id){const result=await db.from('sops').update(row).eq('id',id).select().single();if(result.error)throw result.error;}
    else{
      const createRow={...row,owner_id:user?.id||undefined};
      let result=await db.from('sops').insert(createRow).select().single();
      if(result.error&&/owner_id|schema cache/i.test(result.error.message||'')){delete createRow.owner_id;result=await db.from('sops').insert(createRow).select().single();}
      if(result.error)throw result.error;
    }
    $('sopDialog').close(); clearSopForm(); await loadAll(); setView('playbook'); msg(id?'SOP updated.':'SOP created.','success');
  }catch(error){msg('Could not save SOP: '+(error.message||String(error)),'error');}
}

function openInstructionsForTask(id) {
  const task=state.tasks.find(x=>x.id===id); if(!task)return;
  setView('playbook');
  if(!state.sops.length)return msg('Add an SOP to the Playbook first.','error');
  const ignored=new Set(['the','and','for','with','from','into','your','this','that','task','complete','check']);
  const words=value=>new Set(String(value||'').toLowerCase().match(/[a-z0-9]+/g)?.filter(w=>w.length>2&&!ignored.has(w))||[]);
  const taskSteps=(state.task_subtasks||[]).filter(s=>s.task_id===id&&!s.deleted_at).map(s=>s.title).join(' ');
  const taskWords=words([task.task,task.description,task.next_action,taskSteps].filter(Boolean).join(' '));
  const ranked=state.sops.map(s=>{const titleWords=words(s.title);const detailWords=words([s.purpose,s.when_to_use].join(' '));let score=0;taskWords.forEach(w=>{if(titleWords.has(w))score+=3;else if(detailWords.has(w))score+=1;});return {s,score};}).sort((a,b)=>b.score-a.score);
  const best=ranked[0];
  if(best){$('sopSelect').value=best.s.id;$('sopSelect').dispatchEvent(new Event('change'));if(!best.score)msg('Choose the SOP that applies to this task.','success');}
}

async function saveTask() {
  try {
    const id=$('taskEditId').value,task=$('taskName').value.trim(),repeat=$('taskRepeat').value;
    if(!task)return msg('Task name is required.','error');
    if(repeat!=='None'&&!$('taskDueDate').value)return msg('Choose the first due date for a repeating task.','error');
    const related=resolveRelatedNumber($('taskRelatedNumber').value);
    const current=id?state.tasks.find(x=>x.id===id):null;
    const chosenDate=$('taskDueDate').value||null;
    const patch={task,description:$('taskDescription').value.trim(),category:$('taskCategory').value,base_priority:$('taskPriority').value,due_date:chosenDate,due_time:$('taskDueTime').value||null,next_action:$('taskNext').value.trim(),notes:$('taskNotes').value.trim(),related_number:related.related_number,lead_number:related.lead_number,job_number:related.job_number,repeat_pattern:repeat,repeat_weekdays_only:true,recurrence_series_id:repeat==='None'?null:(current?.recurrence_series_id||crypto.randomUUID()),recurrence_anchor_date:repeat==='None'?null:(chosenDate!==current?.due_date?chosenDate:(current?.recurrence_anchor_date||chosenDate))};
    let taskId=id;
    if(id){await updateRecord('tasks',id,patch,'Task changes undone.');}
    else{const r=await db.from('tasks').insert({...patch,owner_id:user?.id||undefined,task_type:repeat==='None'?'One-Time':'Recurring',status:'Not Started'}).select().single();if(r.error)throw r.error;taskId=r.data.id;await db.from('undo_history').insert({action_type:'create',entity_type:'tasks',entity_id:r.data.id,description:'New task removed.',payload:{}});}
    await syncTaskSubtasks(taskId,taskSubtaskLines());
    $('taskDialog').close();clearTaskForm();await loadAll();msg(id?'Task updated.':'Task created.','success');
  }catch(error){msg('Could not save task: '+(error.message||String(error)),'error');}
}

function clearProspectForm() { ['prospectEditId','prospectSourceRef','prospectFirstName','prospectLastName','prospectStreet','prospectCity','prospectZip','prospectPhone','prospectEmail','prospectNextFollow','prospectNextAction','prospectNotes'].forEach(id=>{if($(id))$(id).value='';}); $('prospectState').value='SC'; $('prospectWorkCategory').value='Roofing'; $('prospectDialogTitle').textContent='New Prospect'; $('saveProspectBtn').textContent='Save Prospect'; setupLeadProspectSelects(); }
function openProspectDialog(prospect=null) { clearProspectForm(); if(prospect){$('prospectEditId').value=prospect.id; $('prospectDialogTitle').textContent='Prospect Details'; $('saveProspectBtn').textContent='Save Changes'; $('prospectSource').value=prospect.source||'Other'; toggleAngiFields('prospect'); $('prospectSourceAccount').value=prospect.source_account||''; $('prospectSourceRef').value=prospect.source_reference||''; $('prospectStatus').value=prospect.current_status||'New'; $('prospectFirstName').value=prospect.first_name||''; $('prospectLastName').value=prospect.last_name||''; $('prospectStreet').value=prospect.street_address||''; $('prospectCity').value=prospect.city||''; $('prospectState').value=prospect.state||'SC'; $('prospectZip').value=prospect.zip||''; $('prospectPhone').value=prospect.phone||''; $('prospectEmail').value=prospect.email||''; $('prospectWorkCategory').value=prospect.work_category||'Roofing'; $('prospectAssignedTo').value=prospect.assigned_to||'Roy'; $('prospectNextFollow').value=dateTimeLocalValue(prospect.next_follow_up_at); $('prospectNextAction').value=prospect.next_action||''; $('prospectNotes').value=prospect.notes||'';} $('prospectDialog').showModal(); }
async function saveProspect() { try { const id=$('prospectEditId').value; const first=$('prospectFirstName').value.trim(), last=$('prospectLastName').value.trim(), phone=$('prospectPhone').value.trim(), email=$('prospectEmail').value.trim(); if(!first&&!last&&!phone&&!email)return msg('Enter at least a name, phone number, or email for the prospect.','error'); const row={source:$('prospectSource').value,source_account:$('prospectSource').value==='Angi'?($('prospectSourceAccount').value||null):null,source_reference:$('prospectSourceRef').value.trim()||null,first_name:first,last_name:last,customer_name:[first,last].filter(Boolean).join(' '),street_address:$('prospectStreet').value.trim(),city:$('prospectCity').value.trim(),state:$('prospectState').value.trim(),zip:$('prospectZip').value.trim(),phone,email,work_category:$('prospectWorkCategory').value,current_status:$('prospectStatus').value,assigned_to:$('prospectAssignedTo').value,next_follow_up_at:$('prospectNextFollow').value?new Date($('prospectNextFollow').value).toISOString():null,next_action:$('prospectNextAction').value.trim(),notes:$('prospectNotes').value.trim()}; if(id){await updateRecord('prospects',id,row,'Prospect changes undone.');} else {const r=await db.from('prospects').insert({...row,import_source:'Manual'}).select().single(); if(r.error)throw r.error; await db.from('undo_history').insert({action_type:'create',entity_type:'prospects',entity_id:r.data.id,description:'New prospect removed.',payload:{}});} $('prospectDialog').close(); await loadAll(); msg(id?'Prospect updated.':'Prospect saved.','success'); } catch(error){msg('Could not save prospect: '+(error.message||String(error)),'error');} }

const LEAD_INTAKE_IDS=['leadTakenBy','leadSubdivision','leadMailingStreet','leadMailingCity','leadMailingState','leadMailingZip','leadDirections','leadInsuranceRelated','leadInsuranceCompany','leadShingleAge','leadWorkTiming','leadRoofLayers','leadCurrentLeak','leadCurrentLeakLocation','leadPriorLeak','leadPriorLeakLocation','leadHomeType','leadRoofPitch','leadPaymentPlan','leadReferralCategory','leadReferralDetail'];
function formNullableBoolean(id){const value=$(id)?.value||'';return value===''?null:value==='true';}
function leadIntakePatch(){return {
  taken_by:$('leadTakenBy').value.trim()||null,subdivision:$('leadSubdivision').value.trim()||null,
  mailing_street_address:$('leadMailingStreet').value.trim()||null,mailing_city:$('leadMailingCity').value.trim()||null,
  mailing_state:$('leadMailingState').value.trim()||null,mailing_zip:$('leadMailingZip').value.trim()||null,
  directions:$('leadDirections').value.trim()||null,insurance_related:formNullableBoolean('leadInsuranceRelated'),
  insurance_company:$('leadInsuranceCompany').value.trim()||null,shingle_age:$('leadShingleAge').value.trim()||null,
  desired_work_timing:$('leadWorkTiming').value.trim()||null,roof_layers:$('leadRoofLayers').value||null,
  current_leak:formNullableBoolean('leadCurrentLeak'),current_leak_location:$('leadCurrentLeakLocation').value.trim()||null,
  prior_leak:formNullableBoolean('leadPriorLeak'),prior_leak_location:$('leadPriorLeakLocation').value.trim()||null,
  home_type:$('leadHomeType').value||null,roof_pitch:$('leadRoofPitch').value||null,payment_plan:$('leadPaymentPlan').value||null,
  referral_category:$('leadReferralCategory').value||null,referral_detail:$('leadReferralDetail').value.trim()||null
};}
function angiSnapshot(record){
  const raw=record?.angi_original_data&&typeof record.angi_original_data==='object'?record.angi_original_data:{};
  if(Object.keys(raw).length)return raw;
  if(!record||!isAngiProspect(record)&&String(record.source||'').toLowerCase()!=='angi')return {};
  return {'Angi lead number':record.source_reference||'','Angi account':record.source_account||'','Lead date':record.received_at||record.lead_date||'','Lead status':record.source_status||'','Lead type':record.source_lead_type||'','Project description':record.source_description||'','Lead fee':record.source_fee??'','Name':record.customer_name||record.homeowner_name||'','Address':record.street_address||'','City':record.city||'','State':record.state||'','ZIP':record.zip||'','Phone':record.phone||'','Email':record.email||''};
}
function renderAngiOriginal(record){
  const wrap=$('leadAngiOriginalWrap'),target=$('leadAngiOriginal');if(!wrap||!target)return;
  const entries=Object.entries(angiSnapshot(record)).filter(([,value])=>value!==null&&value!==undefined&&String(value).trim()!=='');
  wrap.classList.toggle('hidden',!entries.length);
  target.innerHTML=entries.map(([label,value])=>`<div class="source-label">${esc(label)}</div><div class="source-value">${esc(typeof value==='object'?JSON.stringify(value):value)}</div>`).join('');
}
function fillLeadIntake(record){
  const set=(id,value)=>{if($(id))$(id).value=value??'';};
  set('leadTakenBy',record?.taken_by||'Eve');set('leadSubdivision',record?.subdivision);set('leadMailingStreet',record?.mailing_street_address);
  set('leadMailingCity',record?.mailing_city);set('leadMailingState',record?.mailing_state||'SC');set('leadMailingZip',record?.mailing_zip);
  set('leadDirections',record?.directions);set('leadInsuranceRelated',record?.insurance_related===true?'true':record?.insurance_related===false?'false':'');
  set('leadInsuranceCompany',record?.insurance_company);set('leadShingleAge',record?.shingle_age);set('leadWorkTiming',record?.desired_work_timing);
  set('leadRoofLayers',record?.roof_layers);set('leadCurrentLeak',record?.current_leak===true?'true':record?.current_leak===false?'false':'');
  set('leadCurrentLeakLocation',record?.current_leak_location);set('leadPriorLeak',record?.prior_leak===true?'true':record?.prior_leak===false?'false':'');
  set('leadPriorLeakLocation',record?.prior_leak_location);set('leadHomeType',record?.home_type);set('leadRoofPitch',record?.roof_pitch);
  set('leadPaymentPlan',record?.payment_plan);set('leadReferralCategory',record?.referral_category);set('leadReferralDetail',record?.referral_detail);
  renderAngiOriginal(record);
}
function clearLeadForm() { ['leadEditId','leadProspectId','leadNumber','leadDate','leadSourceRef','leadFirstName','leadLastName','leadSpouse','leadStreet','leadCity','leadZip','leadPhone','leadPhone2','leadEmail','leadAppointmentDate','leadAppointmentTime','leadEstimateNote','leadNotes',...LEAD_INTAKE_IDS].forEach(id=>{if($(id))$(id).value='';}); clearLeadAddressSuggestions(); leadAddressSessionToken=null; $('leadState').value='SC'; $('leadMailingState').value='SC'; $('leadTakenBy').value='Eve'; $('leadWorkCategory').value='Roofing'; $('leadStatus').value='Appointment Wanted'; $('leadDialogTitle').textContent='New Lead'; $('saveLeadBtn').textContent='Save Lead'; renderAngiOriginal(null); setupLeadProspectSelects(); }
function openLeadEdit(id) { const l=state.leads.find(x=>x.id===id); if(!l)return; clearLeadForm(); $('leadEditId').value=l.id; $('leadProspectId').value=l.prospect_id||''; $('leadDialogTitle').textContent='Lead Details'; $('saveLeadBtn').textContent='Save Changes'; $('leadNumber').value=l.lead_number||''; $('leadDate').value=l.lead_date||''; $('leadSource').value=l.source||'Other'; toggleAngiFields('lead'); $('leadSourceAccount').value=l.source_account||''; $('leadSourceRef').value=l.source_reference||''; $('leadFirstName').value=l.first_name||''; $('leadLastName').value=l.last_name||''; $('leadSpouse').value=l.spouse_name||''; $('leadStreet').value=l.street_address||''; $('leadCity').value=l.city||''; $('leadState').value=l.state||'SC'; $('leadZip').value=l.zip||''; $('leadPhone').value=l.phone||''; $('leadPhone2').value=l.phone_secondary||''; $('leadEmail').value=l.email||''; $('leadWorkCategory').value=l.work_category||'Roofing'; $('leadAssignedTo').value=l.assigned_to||'Roy'; $('leadStatus').value=l.lead_status||'Appointment Wanted'; $('leadEstimateStatus').value=l.estimate_status||'Not Known'; $('leadEstimateNote').value=l.estimate_issue_note||''; $('leadNotes').value=l.notes||''; fillLeadIntake(l); const a=state.appointments.filter(a=>activeRow(a)&&a.lead_id===l.id).sort((a,b)=>String(b.appointment_at||'').localeCompare(String(a.appointment_at||'')))[0]; if(a){$('leadAppointmentDate').value=datePart(a.appointment_at); $('leadAppointmentTime').value=timePart(a.appointment_at); $('leadMarketSharpStatus').value=a.marketsharp_status||'Not Needed Yet';} $('leadDialog').showModal(); }
async function saveLead() {
  try {
    const editId=$('leadEditId').value;
    if(editId){
      const first=$('leadFirstName').value.trim(), last=$('leadLastName').value.trim();
      const patch={lead_number:$('leadNumber').value.trim()||null,lead_date:$('leadDate').value||null,source:$('leadSource').value,source_account:$('leadSource').value==='Angi'?($('leadSourceAccount').value||null):null,source_reference:$('leadSourceRef').value.trim()||null,homeowner_name:[first,last].filter(Boolean).join(' '),first_name:first,last_name:last,spouse_name:$('leadSpouse').value.trim()||null,street_address:$('leadStreet').value.trim(),city:$('leadCity').value.trim(),state:$('leadState').value.trim(),zip:$('leadZip').value.trim(),phone:$('leadPhone').value.trim(),phone_secondary:$('leadPhone2').value.trim()||null,email:$('leadEmail').value.trim(),work_category:$('leadWorkCategory').value,lead_status:$('leadStatus').value,assigned_to:$('leadAssignedTo').value,estimate_status:$('leadEstimateStatus').value,estimate_issue_note:$('leadEstimateNote').value.trim(),notes:$('leadNotes').value.trim(),...leadIntakePatch()};
      await updateRecord('leads',editId,patch,'Lead changes undone.');
      const appointment=state.appointments.filter(a=>activeRow(a)&&a.lead_id===editId).sort((a,b)=>String(b.appointment_at||'').localeCompare(String(a.appointment_at||'')))[0];
      if(appointment && $('leadAppointmentDate').value){ const at=new Date(`${$('leadAppointmentDate').value}T${$('leadAppointmentTime').value||'12:00'}`).toISOString(); await updateRecord('appointments',appointment.id,{appointment_at:at,marketsharp_status:$('leadMarketSharpStatus').value,assigned_to:$('leadAssignedTo').value},'Appointment changes undone.'); }
      $('leadDialog').close(); await loadAll(); msg('Lead updated.','success'); return;
    }
    // Existing Phase 1 create/promote behavior follows for new leads.
    const first=$('leadFirstName').value.trim(), last=$('leadLastName').value.trim(), leadNumber=$('leadNumber').value.trim(), prospectId=$('leadProspectId').value||null;
    if(!first&&!last&&!$('leadPhone').value.trim())return msg('Enter at least a homeowner name or phone number.','error');
    const sourceProspect=prospectId?state.prospects.find(p=>p.id===prospectId):null;
    const row={prospect_id:prospectId,lead_number:leadNumber||null,lead_date:$('leadDate').value||todayISO(),source:$('leadSource').value,source_account:$('leadSource').value==='Angi'?($('leadSourceAccount').value||null):null,source_reference:$('leadSourceRef').value.trim()||null,import_source:'Manual',homeowner_name:[first,last].filter(Boolean).join(' '),first_name:first,last_name:last,spouse_name:$('leadSpouse').value.trim()||null,street_address:$('leadStreet').value.trim(),city:$('leadCity').value.trim(),state:$('leadState').value.trim(),zip:$('leadZip').value.trim(),phone:$('leadPhone').value.trim(),phone_secondary:$('leadPhone2').value.trim()||null,email:$('leadEmail').value.trim(),work_category:$('leadWorkCategory').value,lead_status:$('leadStatus').value,assigned_to:$('leadAssignedTo').value,estimate_status:$('leadEstimateStatus').value,estimate_issue_note:$('leadEstimateNote').value.trim(),notes:$('leadNotes').value.trim(),...leadIntakePatch(),angi_original_data:angiSnapshot(sourceProspect)};
    const r=await db.from('leads').insert(row).select().single(); if(r.error)throw r.error; let appointmentId=null; let prospectBefore=null;
    if(prospectId){ prospectBefore=state.prospects.find(p=>p.id===prospectId)||null; const u=await db.from('prospects').update({converted_to_lead_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',prospectId).select().single(); if(u.error)throw u.error; }
    if($('leadAppointmentDate').value){ const at=new Date(`${$('leadAppointmentDate').value}T${$('leadAppointmentTime').value||'12:00'}`).toISOString(); const a=await db.from('appointments').insert({lead_id:r.data.id,prospect_id:prospectId,appointment_at:at,appointment_type:'Measure & Presentation',appointment_status:'Scheduled',assigned_to:$('leadAssignedTo').value,marketsharp_status:$('leadMarketSharpStatus').value,google_calendar_status:'Not Added'}).select().single(); if(a.error)throw a.error; appointmentId=a.data.id; }
    if(prospectId){ await db.from('undo_history').insert({action_type:'promote_prospect',entity_type:'prospects',entity_id:prospectId,description:'Prospect promotion undone.',payload:{prospect_before:prospectBefore,lead_id:r.data.id,appointment_id:appointmentId}}); } else { await db.from('undo_history').insert({action_type:'create',entity_type:'leads',entity_id:r.data.id,description:'New lead removed.',payload:{}}); }
    $('leadDialog').close(); await loadAll(); msg('Lead saved.','success');
  } catch(error){msg('Could not save lead: '+(error.message||String(error)),'error');}
}

function dateDaysFromToday(days){ const d=new Date(); d.setDate(d.getDate()+days); return d.toLocaleDateString('en-CA',{timeZone:'America/New_York'}); }
function normalizedProductionStage(stage){ return ({'Sold':'Needs Production Review','Pre-Production':'Production Queue','Complete':'Production Complete'})[stage]||stage||'Needs Production Review'; }
function clearJobForm(){ ['jobEditId','jobCustomer','jobLead','jobNumber','jobAddress','jobSalesperson','jobContractDate','jobType','jobMaterialType','jobMaterialColor','jobMaterialDelivery','jobExpectedCompletion','jobProductionBlocker','jobTarget','jobConfirmed','jobNotes'].forEach(id=>{if($(id))$(id).value='';}); $('jobStage').value='Needs Production Review'; $('jobNextProductionUpdate').value=dateDaysFromToday(7); $('jobDialogTitle').textContent='New Job'; $('saveJobBtn').textContent='Save'; }
function openJobEdit(id){ const j=state.jobs.find(x=>x.id===id); if(!j)return; clearJobForm(); $('jobEditId').value=j.id; $('jobCustomer').value=j.customer_name||''; $('jobLead').value=j.lead_number||''; $('jobNumber').value=j.job_number||''; $('jobAddress').value=j.property_address||''; $('jobSalesperson').value=j.salesperson||''; $('jobContractDate').value=j.contract_date||''; $('jobType').value=j.job_type||''; $('jobStage').value=normalizedProductionStage(j.stage); $('jobMaterialType').value=j.material_type||''; $('jobMaterialColor').value=j.material_color||''; $('jobMaterialDelivery').value=j.material_delivery_date||''; $('jobExpectedCompletion').value=j.expected_completion_date||''; $('jobProductionBlocker').value=j.production_blocker||''; $('jobNextProductionUpdate').value=j.production_next_update_date||dateDaysFromToday(7); $('jobTarget').value=j.target_start_date||''; $('jobConfirmed').value=j.confirmed_start_date||''; $('jobNotes').value=j.production_notes||''; $('jobDialogTitle').textContent='Job Details'; $('saveJobBtn').textContent='Save Changes'; $('jobDialog').showModal(); }
function openCancelJob(id){
  const job=state.jobs.find(j=>j.id===id);if(!job)return;
  $('cancelJobId').value=job.id;
  $('cancelJobName').textContent=`${job.customer_name||'Unnamed customer'}${job.job_number?' • Job #'+job.job_number:''}`;
  $('cancelJobReason').value='';
  $('cancelJobReason').setCustomValidity('');
  $('cancelJobDialog').showModal();
  $('cancelJobReason').focus();
}
async function cancelJob(){
  try{
    const id=$('cancelJobId').value,job=state.jobs.find(j=>j.id===id),reasonInput=$('cancelJobReason'),reason=reasonInput.value.trim();
    if(!job)return;
    reasonInput.setCustomValidity(reason?'':'Enter the reason the job was canceled.');
    if(!reason){reasonInput.reportValidity();reasonInput.focus();return;}
    const when=new Date().toLocaleString('en-US',{timeZone:'America/New_York',month:'2-digit',day:'2-digit',year:'numeric',hour:'numeric',minute:'2-digit'});
    const history=`Job canceled ${when}${user?.email?' by '+user.email:''}. Previous stage: ${job.stage||'Not entered'}. Reason: ${reason}`;
    await updateRecord('jobs',id,{stage:'Cancelled',production_blocker:'Cancelled: '+reason,production_next_update_date:null,client_communication_needed:false,client_communication_reason:null,client_communication_due_date:null,production_notes:[job.production_notes,history].filter(Boolean).join('\n')},'Job cancellation undone.');
    $('cancelJobDialog').close();await loadAll();msg('Job canceled and removed from active production. Undo is available.','success');
  }catch(error){msg('Could not cancel job: '+(error.message||String(error)),'error');}
}
async function reopenJob(id){
  const job=state.jobs.find(j=>j.id===id);if(!job)return;
  if(!confirm(`Reopen ${job.customer_name||'this job'} and return it to production review?`))return;
  const when=new Date().toLocaleString('en-US',{timeZone:'America/New_York',month:'2-digit',day:'2-digit',year:'numeric',hour:'numeric',minute:'2-digit'});
  const history=`Job reopened ${when}${user?.email?' by '+user.email:''}.`;
  await updateRecord('jobs',id,{stage:'Needs Production Review',production_blocker:null,production_next_update_date:dateDaysFromToday(7),production_notes:[job.production_notes,history].filter(Boolean).join('\n')},'Job reopening undone.');
  await loadAll();msg('Job reopened and returned to production review.','success');
}
async function saveJob(){
  try{
    const id=$('jobEditId').value;
    const original=id?state.jobs.find(j=>j.id===id):null;
    const customer=$('jobCustomer').value.trim();
    if(!customer)return msg('Customer name is required.','error');
    const materialDelivery=$('jobMaterialDelivery').value||null;
    const confirmedStart=$('jobConfirmed').value||null;
    const scheduleChanged=Boolean(original) && (
      materialDelivery!==(original.material_delivery_date||null) ||
      confirmedStart!==(original.confirmed_start_date||null)
    );
    const changeReason=materialDelivery!==(original?.material_delivery_date||null)
      ? (materialDelivery?'Materials delivery scheduled or changed for '+materialDelivery:'Materials delivery date removed')
      : (confirmedStart?'Crew start scheduled or changed for '+confirmedStart:'Crew start date removed');
    const row={
      customer_name:customer,lead_number:$('jobLead').value.trim(),job_number:$('jobNumber').value.trim(),
      property_address:$('jobAddress').value.trim(),salesperson:$('jobSalesperson').value.trim(),
      contract_date:$('jobContractDate').value||null,job_type:$('jobType').value.trim()||null,
      stage:$('jobStage').value,material_type:$('jobMaterialType').value.trim()||null,
      material_color:$('jobMaterialColor').value.trim()||null,material_delivery_date:materialDelivery,
      expected_completion_date:$('jobExpectedCompletion').value||null,
      production_blocker:$('jobProductionBlocker').value.trim()||null,
      production_next_update_date:$('jobNextProductionUpdate').value||dateDaysFromToday(7),
      target_start_date:$('jobTarget').value||null,confirmed_start_date:confirmedStart,
      production_notes:$('jobNotes').value.trim(),
      client_communication_needed:scheduleChanged?true:Boolean(original?.client_communication_needed),
      client_communication_reason:scheduleChanged?changeReason:(original?.client_communication_reason||null),
      client_communication_due_date:scheduleChanged?todayISO():(original?.client_communication_due_date||dateDaysFromToday(7))
    };
    if(id){
      await updateRecord('jobs',id,row,'Job changes undone.');
    }else{
      const r=await db.from('jobs').insert(row).select().single();
      if(r.error)throw r.error;
      await db.from('undo_history').insert({action_type:'create',entity_type:'jobs',entity_id:r.data.id,description:'New job removed.',payload:{}});
    }
    $('jobDialog').close();clearJobForm();await loadAll();
    msg(id?(scheduleChanged?'Job updated; customer notification was added to Communication Due.':'Job updated.'):'Job created and added to Dad’s production check-off.','success');
  }catch(error){msg(error.message||String(error),'error');}
}

function openAppointmentEdit(id){ const a=state.appointments.find(x=>x.id===id); if(!a)return; $('appointmentEditId').value=a.id; $('appointmentEditDate').value=datePart(a.appointment_at); $('appointmentEditTime').value=timePart(a.appointment_at); $('appointmentEditStatus').value=a.appointment_status||'Scheduled'; $('appointmentEditAssigned').value=a.assigned_to||''; $('appointmentEditType').value=appointmentTypeLabel(a); $('appointmentEditResult').value=a.appointment_result||''; $('appointmentEditResultNote').value=a.appointment_result_note||''; $('appointmentEditMarketSharp').value=a.marketsharp_status||'Not Needed Yet'; $('appointmentEditCalendar').value=a.google_calendar_status||'Not Added'; $('appointmentEditNotes').value=a.notes||''; $('appointmentDialog').showModal(); }
async function saveAppointmentEdit(){ try{ const id=$('appointmentEditId').value; if(!id)return; const original=state.appointments.find(x=>x.id===id); const at=$('appointmentEditDate').value?new Date(`${$('appointmentEditDate').value}T${$('appointmentEditTime').value||'12:00'}`).toISOString():null; const result=$('appointmentEditResult').value; const resultChanged=result!==(original?.appointment_result||'')||$('appointmentEditResultNote').value.trim()!==(original?.appointment_result_note||''); const patch={appointment_at:at,appointment_type:$('appointmentEditType').value.trim()||'Measure & Presentation',appointment_status:result?'Completed':$('appointmentEditStatus').value,assigned_to:$('appointmentEditAssigned').value.trim(),appointment_result:result||null,appointment_result_note:$('appointmentEditResultNote').value.trim()||null,appointment_result_at:result?(resultChanged?new Date().toISOString():(original?.appointment_result_at||new Date().toISOString())):null,appointment_result_by:result?(resultChanged?'Eve':(original?.appointment_result_by||'Eve')):null,marketsharp_status:$('appointmentEditMarketSharp').value,google_calendar_status:$('appointmentEditCalendar').value,notes:$('appointmentEditNotes').value.trim()}; await updateRecord('appointments',id,patch,'Appointment changes undone.'); if(result&&original?.lead_id){const leadPatch=leadPatchForAppointmentResult(result);if(Object.keys(leadPatch).length){const leadUpdate=await db.from('leads').update(leadPatch).eq('id',original.lead_id);if(leadUpdate.error)throw leadUpdate.error;}} $('appointmentDialog').close(); await loadAll(); msg('Appointment updated.','success'); }catch(error){msg(error.message||String(error),'error');} }

function openCommunicationDialog(kind, id) {
  let record = null, name = '';
  if (kind === 'prospect') { record = state.prospects.find(x => x.id === id); name = record ? prospectName(record) : ''; }
  if (kind === 'lead') { record = state.leads.find(x => x.id === id); name = record ? leadName(record) : ''; }
  if (kind === 'job') { record = state.jobs.find(x => x.id === id); name = record?.customer_name || ''; }
  if (!record) return;
  $('commKind').value = kind;
  $('commContactId').value = id;
  $('commDialogTitle').textContent = `Log Communication — ${name || 'Customer'}`;
  $('commType').value = 'Call';
  $('commDirection').value = 'Outbound';
  $('commResult').value = '';
  $('commNotes').value = '';
  $('commFollowNeeded').value = 'No';
  $('commFollowDue').value = '';
  $('communicationDialog').showModal();
}

async function saveCommunication() {
  try {
    const kind = $('commKind').value;
    const id = $('commContactId').value;
    const type = $('commType').value;
    const direction = $('commDirection').value;
    const result = $('commResult').value.trim();
    const notes = $('commNotes').value.trim();
    const followNeeded = $('commFollowNeeded').value === 'Yes';
    const followDue = $('commFollowDue').value ? new Date($('commFollowDue').value).toISOString() : null;
    let query;
    if (kind === 'job') {
      query = db.from('job_communications').insert({
        job_id:id, occurred_at:new Date().toISOString(), communication_type:type,
        direction, result, notes, follow_up_needed:followNeeded, follow_up_due_at:followDue
      }).select().single();
    } else {
      query = db.from('sales_communications').insert({
        prospect_id:kind === 'prospect' ? id : null,
        lead_id:kind === 'lead' ? id : null,
        occurred_at:new Date().toISOString(), communication_type:type,
        direction, result, notes, next_follow_up_at:followDue
      }).select().single();
    }
    const r = await query;
    if (r.error) throw r.error;
    $('communicationDialog').close();
    await loadAll();
    msg('Communication logged.','success');
  } catch(error) {
    msg('Could not log communication: ' + (error.message || String(error)),'error');
  }
}

function nextRecurringDueDate(task){
  const pattern=task.repeat_pattern||'None';
  if(pattern==='None')return null;
  const today=todayISO();
  const base=(pattern==='Weekly'||pattern==='Monthly')?(task.recurrence_anchor_date||task.due_date||today):(task.due_date&&task.due_date>today?task.due_date:today);
  const d=new Date(`${base}T12:00:00`);
  if(pattern==='Monthly')d.setMonth(d.getMonth()+1);
  else if(pattern==='Weekly')d.setDate(d.getDate()+7);
  else d.setDate(d.getDate()+1);
  while([0,6].includes(d.getDay()))d.setDate(d.getDate()+1);
  if(pattern==='Weekly'||pattern==='Monthly'){
    while(d.toLocaleDateString('en-CA',{timeZone:'America/New_York'})<=today){
      if(pattern==='Monthly')d.setMonth(d.getMonth()+1);else d.setDate(d.getDate()+7);
      while([0,6].includes(d.getDay()))d.setDate(d.getDate()+1);
    }
  }
  return d.toLocaleDateString('en-CA',{timeZone:'America/New_York'});
}

async function createNextRecurringTask(task){
  const nextDate=nextRecurringDueDate(task);if(!nextDate)return;
  const series=task.recurrence_series_id||crypto.randomUUID();
  const duplicate=await db.from('tasks').select('id').eq('recurrence_series_id',series).eq('due_date',nextDate).is('deleted_at',null).limit(1);
  if(duplicate.error)throw duplicate.error;if(duplicate.data?.length)return;
  const row={task:task.task,description:task.description||'',category:taskPlacement(task),task_type:'Recurring',status:'Not Started',base_priority:task.base_priority||'Normal',due_date:nextDate,due_time:task.due_time||null,next_action:task.next_action||'',notes:task.notes||'',related_number:task.related_number||null,lead_number:task.lead_number||null,job_number:task.job_number||null,prospect_id:task.prospect_id||null,lead_id:task.lead_id||null,job_id:task.job_id||null,repeat_pattern:task.repeat_pattern,repeat_weekdays_only:true,recurrence_series_id:series,recurrence_anchor_date:nextDate};
  const created=await db.from('tasks').insert(row).select().single();if(created.error)throw created.error;
  const subtasks=(state.task_subtasks||[]).filter(s=>s.task_id===task.id&&!s.deleted_at).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
  if(subtasks.length){const copied=await db.from('task_subtasks').insert(subtasks.map((s,i)=>({task_id:created.data.id,title:s.title,sort_order:i})));if(copied.error)throw copied.error;}
}

async function toggleTaskSubtask(id){
  const subtask=(state.task_subtasks||[]).find(s=>s.id===id);if(!subtask)return;
  const completed_at=subtask.completed_at?null:new Date().toISOString();
  const result=await db.from('task_subtasks').update({completed_at}).eq('id',id);if(result.error)throw result.error;
  subtask.completed_at=completed_at;renderDashboard();
}

function nextBusinessDateOnOrAfter(value){
  const d=new Date(`${value}T12:00:00`);while([0,6].includes(d.getDay()))d.setDate(d.getDate()+1);return d.toLocaleDateString('en-CA',{timeZone:'America/New_York'});
}

async function rollForwardGroupedTasks(){
  const today=todayISO(),target=nextBusinessDateOnOrAfter(today);
  const open=(state.tasks||[]).filter(t=>activeRow(t)&&!['Completed','Cancelled','Skipped'].includes(t.status)&&t.due_date&&t.due_date<today&&t.repeat_pattern&&t.repeat_pattern!=='None');
  for(const task of open){
    if(task.repeat_pattern==='Weekdays'){
      const skipped=await db.from('tasks').update({status:'Skipped'}).eq('id',task.id);if(skipped.error)throw skipped.error;
      const series=task.recurrence_series_id||crypto.randomUUID();
      const duplicate=await db.from('tasks').select('id').eq('recurrence_series_id',series).eq('due_date',target).is('deleted_at',null).limit(1);if(duplicate.error)throw duplicate.error;
      if(!duplicate.data?.length){
        const row={task:task.task,description:task.description||'',category:taskPlacement(task),task_type:'Recurring',status:'Not Started',base_priority:task.base_priority||'Normal',due_date:target,due_time:task.due_time||null,next_action:task.next_action||'',notes:task.notes||'',related_number:task.related_number||null,lead_number:task.lead_number||null,job_number:task.job_number||null,prospect_id:task.prospect_id||null,lead_id:task.lead_id||null,job_id:task.job_id||null,repeat_pattern:'Weekdays',repeat_weekdays_only:true,recurrence_series_id:series,recurrence_anchor_date:target};
        const made=await db.from('tasks').insert(row).select().single();if(made.error)throw made.error;
        const subtasks=(state.task_subtasks||[]).filter(s=>s.task_id===task.id&&!s.deleted_at).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
        if(subtasks.length){const copied=await db.from('task_subtasks').insert(subtasks.map((s,i)=>({task_id:made.data.id,title:s.title,sort_order:i})));if(copied.error)throw copied.error;}
      }
    }else{
      const carried=await db.from('tasks').update({due_date:target}).eq('id',task.id);if(carried.error)throw carried.error;
    }
  }
  return open.length>0;
}

async function taskAction(id,action){
  const task=state.tasks.find(x=>x.id===id); if(!task)return; let note='';
  if(action==='block') note=prompt('Why is this task blocked?')||'';
  const newRepeat=task.repeat_pattern&&task.repeat_pattern!=='None';
  if(action==='skip'){ if(!task.recurring_rule_id&&task.repeat_pattern!=='Weekdays'){msg('Weekly and monthly tasks carry forward until completed.','error');return;} note=prompt('Optional: why are you skipping this occurrence?')||''; }
  const other=currentTask();
  const snapshot={...task}; const otherSnapshot=(other&&other.id!==id&&(action==='start'||action==='resume'))?{...other}:null;
  let error=null;
  if(action==='skip'&&newRepeat&&!task.recurring_rule_id){
    const result=await db.from('tasks').update({status:'Skipped',notes:[task.notes,note].filter(Boolean).join('\n')}).eq('id',id);error=result.error;
  }else{
    const result=await db.rpc('task_action',{p_task_id:id,p_action:action,p_note:note});error=result.error;
  }
  if(error){msg('Could not save task change: '+error.message,'error');await loadAll();return;}
  await db.from('undo_history').insert({action_type:'task_action',entity_type:'tasks',entity_id:id,description:`Task ${action} undone.`,payload:{before:snapshot,other_task_before:otherSnapshot}});
  if(newRepeat&&['complete','skip'].includes(action))await createNextRecurringTask(task);
  await loadAll();
}

async function createDadProductionLink(){
  const button=$('createDadProductionLinkBtn');
  if(!button) return;
  button.disabled=true;
  button.textContent='Creating…';
  try{
    const {data,error}=await db.rpc('create_dad_production_session');
    if(error) throw error;
    const token=Array.isArray(data)?data[0]?.token:(data?.token||data);
    if(!token) throw new Error('Bauer Roofing Operations did not receive a production check-off token.');
    const url=new URL('dad-production.html',window.location.href);
    url.searchParams.set('token',token);
    try{
      await navigator.clipboard.writeText(url.toString());
      alert("Dad's production check-off link was copied.\n\nText it to him whenever you want a production update. The link works for 8 days.");
    }catch(copyError){
      prompt('Copy this link and text it to Dad:',url.toString());
    }
  }catch(error){
    msg('Could not create Dad’s production link: '+(error.message||String(error)),'error');
  }finally{
    button.disabled=false;
    button.textContent='Create Dad Production Check-Off';
  }
}

async function markJobCustomerContacted(jobId){
  const job=state.jobs.find(j=>j.id===jobId);
  if(!job) return;
  const note=prompt('Optional note about what you told '+(job.customer_name||'the customer')+':','')||'';
  const {error}=await db.rpc('mark_job_customer_contacted',{p_job_id:jobId,p_note:note});
  if(error) throw error;
  await loadAll();
  msg('Customer contact saved. The next weekly check-in is scheduled.','success');
}

async function loadAll(){
  const calls=[['tasks','created_at',false],['jobs','updated_at',false],['communications','due_date',true],['phone_messages','created_at',false],['prospects','created_at',false],['leads','created_at',false],['appointments','appointment_at',true],['sales_communications','occurred_at',false],['job_communications','occurred_at',false],['lookup_options','sort_order',true],['sops','title',true],['suggestions','created_at',false],['quick_notes','updated_at',false]];
  const results=await Promise.all(calls.map(([table,order,ascending])=>db.from(table).select('*').order(order,{ascending}).limit(500)));
  for(let i=0;i<results.length;i++){ if(results[i].error)throw results[i].error; let stateName=calls[i][0]==='phone_messages'?'phone':calls[i][0]; if(stateName==='lookup_options')stateName='lookups'; state[stateName]=results[i].data||[]; }
  const subtaskResult=await db.from('task_subtasks').select('*').order('sort_order',{ascending:true}).limit(2000);
  if(subtaskResult.error){state.task_subtasks=[];console.warn('Task subtasks are not available until the task-group SQL is installed:',subtaskResult.error.message);}else state.task_subtasks=subtaskResult.data||[];
  if(!subtaskResult.error){
    try{
      const moved=await rollForwardGroupedTasks();
      const normalized=await db.rpc('normalize_recurring_tasks_to_weekdays');
      if(moved||!normalized.error){
        const refreshedTasks=await db.from('tasks').select('*').order('created_at',{ascending:false}).limit(500);
        const refreshedSubtasks=await db.from('task_subtasks').select('*').order('sort_order',{ascending:true}).limit(2000);
        if(!refreshedTasks.error)state.tasks=refreshedTasks.data||[];
        if(!refreshedSubtasks.error)state.task_subtasks=refreshedSubtasks.data||[];
      }
    }catch(error){console.warn('Could not roll repeating tasks forward:',error.message||error);}
  }
  const royResult=await db.rpc('get_recent_roy_updates',{p_days:7});
  if(royResult.error){
    state.roy_updates=[];
    console.warn('Roy update history is not available yet:',royResult.error.message);
  }else{
    state.roy_updates=royResult.data||[];
  }
  const dadResult=await db.rpc('get_recent_dad_production_updates',{p_days:14});
  if(dadResult.error){
    state.dad_updates=[];
    console.warn('Dad production history is not available yet:',dadResult.error.message);
  }else{
    state.dad_updates=dadResult.data||[];
  }
  try { await rollForwardMissedAngiCadence(); } catch (error) { console.warn('Could not roll forward missed Angi cadence windows:', error); }
  setupLeadProspectSelects(); renderDashboard(); renderProspectsLeads(); renderAngiQueue(); applyUrlNavigation();
}

// Additional click handling for editing and record safety actions.
document.body.addEventListener('click', async event => {
  try {
    const subtaskToggle=event.target.closest('[data-subtask-toggle]');if(subtaskToggle){await toggleTaskSubtask(subtaskToggle.dataset.subtaskToggle);return;}
    const editNote=event.target.closest('[data-edit-quick-note]'); if(editNote){const n=(state.quick_notes||[]).find(x=>x.id===editNote.dataset.editQuickNote);if(n){$('quickNoteEditId').value=n.id;$('quickNoteText').value=n.note||'';$('saveQuickNoteBtn').textContent='Save Changes';$('cancelQuickNoteEditBtn').classList.remove('hidden');$('quickNoteText').focus();}return;}
    const deleteNote=event.target.closest('[data-delete-quick-note]'); if(deleteNote){await deleteQuickNote(deleteNote.dataset.deleteQuickNote);return;}
    const noteToTask=event.target.closest('[data-note-to-task]'); if(noteToTask){convertQuickNoteToTask(noteToTask.dataset.noteToTask);return;}
    const openSopTask=event.target.closest('[data-open-sop-task]'); if(openSopTask){openInstructionsForTask(openSopTask.dataset.openSopTask);return;}
    const duplicateTaskButton=event.target.closest('[data-duplicate-task]'); if(duplicateTaskButton){duplicateTask(duplicateTaskButton.dataset.duplicateTask);return;}
    const editTask=event.target.closest('[data-edit-task]'); if(editTask){openTaskEdit(editTask.dataset.editTask);return;}
    const editPhone=event.target.closest('[data-edit-phone]'); if(editPhone){openPhoneEdit(editPhone.dataset.editPhone);return;}
    const editProspect=event.target.closest('[data-edit-prospect]'); if(editProspect){openProspectDialog(state.prospects.find(p=>p.id===editProspect.dataset.editProspect));return;}
    const selectLead=event.target.closest('[data-lead-select]'); if(selectLead){selectedLeadId=selectLead.dataset.leadSelect;renderProspectsLeads();return;}
    const editLead=event.target.closest('[data-edit-lead]'); if(editLead){openLeadEdit(editLead.dataset.editLead);return;}
    const editJob=event.target.closest('[data-edit-job]'); if(editJob){openJobEdit(editJob.dataset.editJob);return;}
    const cancelJobButton=event.target.closest('[data-cancel-job]');if(cancelJobButton){openCancelJob(cancelJobButton.dataset.cancelJob);return;}
    const reopenJobButton=event.target.closest('[data-reopen-job]');if(reopenJobButton){await reopenJob(reopenJobButton.dataset.reopenJob);return;}
    const teamText=event.target.closest('[data-team-text]');if(teamText){openTeamText(teamText.dataset.teamText,teamText.dataset.teamKind,teamText.dataset.teamId);return;}
    const jobContacted=event.target.closest('[data-job-contacted]'); if(jobContacted){await markJobCustomerContacted(jobContacted.dataset.jobContacted);return;}
    const editAppt=event.target.closest('[data-edit-appointment]'); if(editAppt){openAppointmentEdit(editAppt.dataset.editAppointment);return;}
    const mergeAppt=event.target.closest('[data-merge-appointment]'); if(mergeAppt){await mergeDuplicateAppointments(mergeAppt.dataset.mergeAppointment);return;}
    const logComm=event.target.closest('[data-log-communication]'); if(logComm){openCommunicationDialog(logComm.dataset.logCommunication,logComm.dataset.contactId);return;}
    const action=event.target.closest('[data-record-action]');
    if(action){ const table=action.dataset.recordTable,id=action.dataset.recordId,verb=action.dataset.recordAction; const result=await recordAction(table,id,verb,`${verb.charAt(0).toUpperCase()+verb.slice(1)} ${table.replace('_',' ')} undone.`); if(result){await loadAll();msg(verb==='delete'?'Deleted. Undo is available.':verb==='archive'?'Archived.':'Restored.','success');} return;}
  } catch(error){msg(error.message||String(error),'error');}
});

$('undoBtn').onclick=undoLastAction;
$('cancelPhoneEditBtn').onclick=clearPhoneForm;
$('saveAppointmentEditBtn').onclick=saveAppointmentEdit;
$('saveCommunicationBtn').onclick=saveCommunication;
$('newTaskBtn').onclick=()=>{clearTaskForm();$('taskDialog').showModal();};
if($('newSopBtn')) $('newSopBtn').onclick=()=>openSopEditor();
if($('editSopBtn')) $('editSopBtn').onclick=()=>openSopEditor($('sopSelect').value);
if($('saveSopBtn')) $('saveSopBtn').onclick=saveSop;
if($('cancelSopBtn')) $('cancelSopBtn').onclick=()=>{$('sopDialog').close();clearSopForm();};
if ($('newProspectBtn')) $('newProspectBtn').onclick=()=>openProspectDialog();
$('newLeadBtn').onclick=()=>{clearLeadForm();openLeadDialog();};
if ($('leadSearch')) $('leadSearch').oninput=()=>{ selectedLeadId=''; renderProspectsLeads(); };
if($('leadSort'))$('leadSort').onchange=()=>{selectedLeadId='';renderProspectsLeads();};
if($('jobSort'))$('jobSort').onchange=renderJobs;
if($('jobSearch'))$('jobSearch').oninput=renderJobs;
$('leadReportsBtn').onclick=()=>openReports('leads');
$('jobReportsBtn').onclick=()=>openReports('jobs');
$('reportType').onchange=configureReportControls;
$('previewReportBtn').onclick=previewCurrentReport;
$('exportReportBtn').onclick=exportCurrentReport;
$('reportSelectAllBtn').onclick=()=>{document.querySelectorAll('#reportColumns input').forEach(input=>{input.checked=true;});};
$('reportClearColumnsBtn').onclick=()=>{document.querySelectorAll('#reportColumns input').forEach(input=>{input.checked=false;});};
$('newJobBtn').onclick=()=>{clearJobForm();$('jobDialog').showModal();};
if($('confirmCancelJobBtn'))$('confirmCancelJobBtn').onclick=cancelJob;
if($('teamNumbersBtn'))$('teamNumbersBtn').onclick=openTeamNumbers;
if($('saveTeamNumbersBtn'))$('saveTeamNumbersBtn').onclick=saveTeamNumbers;
if($('createDadProductionLinkBtn')) $('createDadProductionLinkBtn').onclick=createDadProductionLink;


// Angi queue interactions.
$('angiFilter').onchange=()=>{ selectedAngiProspectId=''; renderAngiQueue(); };
$('angiSearch').oninput=()=>renderAngiQueue();
$('angiWorkNextBtn').onclick=()=>{ const p=activeAngiProspects()[0]; if(p){selectedAngiProspectId=p.id;renderAngiQueue();} else msg('Nothing in the active Angi prospect queue.','success'); };
$('angiImportBtn').onclick=importAngiExport;
$('angiHistoricalImportBtn').onclick=importAngiHistoricalPackage;
$('saveQuickNoteBtn').onclick=saveQuickNote;
$('cancelQuickNoteEditBtn').onclick=clearQuickNoteForm;
$('angiCallbackSaveBtn').onclick=async()=>{ const id=$('angiCallbackProspectId').value; const dt=$('angiCallbackAt').value; if(!dt)return msg('Choose a callback date and time.','error'); $('angiCallbackDialog').close(); await recordAngiOutcome(id,'Call Back Later',new Date(dt).toISOString(),$('angiCallbackNotes').value.trim()); };
$('angiCloseSaveBtn').onclick=async()=>{ const id=$('angiCloseProspectId').value; const outcome=$('angiCloseOutcome').value; $('angiCloseDialog').close(); await recordAngiOutcome(id,outcome,null,$('angiCloseNotes').value.trim()); };

document.body.addEventListener('click', async event=>{
  const select=event.target.closest('[data-angi-select]'); if(select){selectedAngiProspectId=select.dataset.angiSelect;renderAngiDetail();return;}
  const outcome=event.target.closest('[data-angi-outcome]'); if(outcome){const p=state.prospects.find(x=>x.id===outcome.dataset.angiId);const result=outcome.dataset.angiOutcome;const follow=['No Answer','Left Voicemail'].includes(result)?nextAngiFollowup(p):null;const autoAdvance=result !== 'Phone Disconnected / Not Working';await recordAngiOutcome(outcome.dataset.angiId,result,follow?follow.toISOString():null,'',autoAdvance);return;}
  const saveNotes=event.target.closest('[data-angi-save-notes]'); if(saveNotes){await saveAngiWorkingNotes(saveNotes.dataset.angiSaveNotes,false);return;}
  const saveNotesNext=event.target.closest('[data-angi-save-notes-next]'); if(saveNotesNext){await saveAngiWorkingNotes(saveNotesNext.dataset.angiSaveNotesNext,true);return;}
  const callback=event.target.closest('[data-angi-callback]'); if(callback){$('angiCallbackProspectId').value=callback.dataset.angiCallback;$('angiCallbackAt').value='';$('angiCallbackNotes').value='';$('angiCallbackDialog').showModal();return;}
  const appointment=event.target.closest('[data-angi-appointment]'); if(appointment){openAngiAppointment(appointment.dataset.angiAppointment);return;}
  const close=event.target.closest('[data-angi-close]'); if(close){$('angiCloseProspectId').value=close.dataset.angiClose;$('angiCloseNotes').value='';$('angiCloseDialog').showModal();return;}
  const ms=event.target.closest('[data-angi-marketsharp]'); if(ms){try{await updateRecord('appointments',ms.dataset.angiMarketsharp,{marketsharp_status:'Added'},'MarketSharp status change undone.');await loadAll();renderAngiQueue();msg('Marked Added to MarketSharp.','success');}catch(error){msg(error.message||String(error),'error');}return;}
});


setupLeadAddressAutocomplete();
ensureLatestRelease().then(reloading=>{if(!reloading)init();});
