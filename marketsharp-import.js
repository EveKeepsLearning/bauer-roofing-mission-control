'use strict';

const cfg = window.BAUER_CONFIG || {};
const REQUIRED_FILES = [
  'PRODUCT_TYPE.xml',
  'LEAD_PRODUCT_INTERESTS.xml',
  'CONTACT.xml',
  'ADDRESS.xml',
  'PHONE_NUMBER.xml',
  'LEAD.xml',
  'APPOINTMENT.xml',
  'JOB.xml'
];
const TABLE_LIMIT = 500;
const $ = id => document.getElementById(id);

let db = null;
let selectedFiles = new Map();
let migrationRows = [];
let activeFilter = 'all';
let existingLeads = [];

function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}

function showNotice(text, type = '') {
  const node = $('authNotice');
  node.textContent = text;
  node.className = `notice ${type}`.trim();
}

function fieldName(tagName) {
  return String(tagName || '').replace(/_x0020_/gi, ' ');
}

async function xmlRows(fileName) {
  const file = selectedFiles.get(fileName.toUpperCase());
  if (!file) throw new Error(`${fileName} was not selected.`);
  const text = await file.text();
  const documentNode = new DOMParser().parseFromString(text, 'application/xml');
  const parseError = documentNode.querySelector('parsererror');
  if (parseError) throw new Error(`${fileName} could not be read as XML.`);
  const recordName = fileName.replace(/\.xml$/i, '');
  const records = [...documentNode.getElementsByTagName(recordName)];
  return records.map(record => {
    const row = {};
    [...record.children].forEach(child => { row[fieldName(child.tagName)] = String(child.textContent || '').trim(); });
    return row;
  });
}

function normalizedPhone(row) {
  const digits = `${row['PHONE CTY CODE'] || ''}${row['PHONE AREA CODE'] || ''}${row['PHONE NUMBER'] || ''}`.replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function displayPhone(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(-10);
  return digits.length === 10 ? `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}` : value || '';
}

function normalizedNumber(value) {
  const cleaned = String(value || '').replace(/[$,\s]/g, '');
  if (!/^\d+(?:\.0+)?$/.test(cleaned)) return null;
  const number = Number(cleaned);
  return Number.isSafeInteger(number) ? number : null;
}

function fullName(contact) {
  return [contact?.['CONTACT FIRST NAME'], contact?.['CONTACT LAST NAME']].filter(Boolean).join(' ') || 'Unnamed contact';
}

function leadAddress(lead, contactAddress) {
  return {
    street: lead['LEAD JOB SITE ADDRESS'] || contactAddress?.['ADDR LINEONE'] || '',
    line2: lead['LEAD JOB SITE ADDRESS LINE2'] || contactAddress?.['ADDR LINETWO'] || '',
    city: lead['LEAD JOB SITE CITY'] || contactAddress?.['ADDR CITY'] || '',
    state: lead['LEAD JOB SITE STATE'] || contactAddress?.['ADDR STATE'] || '',
    zip: lead['LEAD JOB SITE ZIP'] || contactAddress?.['ADDR ZIP'] || ''
  };
}

function addressLine(address) {
  const street = [address.street, address.line2].filter(Boolean).join(' ');
  const locality = [address.city, address.state, address.zip].filter(Boolean).join(' ');
  return [street, locality].filter(Boolean).join(', ');
}

async function fetchAll(table, columns, orderColumn = 'created_at') {
  const rows = [];
  const pageSize = 1000;
  for (let start = 0; start < 100000; start += pageSize) {
    const result = await db.from(table).select(columns).order(orderColumn, {ascending:true}).range(start, start + pageSize - 1);
    if (result.error) throw result.error;
    rows.push(...(result.data || []));
    if ((result.data || []).length < pageSize) break;
  }
  return rows;
}

function updateFileChecklist() {
  const ready = REQUIRED_FILES.filter(name => selectedFiles.has(name)).length;
  $('requiredFiles').innerHTML = REQUIRED_FILES.map(name => `<span class="${selectedFiles.has(name) ? 'ready' : ''}">${esc(name)}</span>`).join('');
  $('analyzeMarketSharpBtn').disabled = ready !== REQUIRED_FILES.length || !db;
  $('migrationStatus').textContent = `${ready} of ${REQUIRED_FILES.length} required files selected.`;
}

function updateProgress(percent, text) {
  $('migrationProgress').classList.remove('hidden');
  $('migrationProgressBar').style.width = `${percent}%`;
  $('migrationStatus').textContent = text;
}

function rowSearchText(row) {
  return [row.bauerLeadNumber, row.name, row.phone, row.addressText, row.source, row.marketsharpLeadId].join(' ').toLowerCase();
}

function filteredRows() {
  const query = String($('migrationSearch').value || '').trim().toLowerCase();
  return migrationRows.filter(row => (activeFilter === 'all' || row.kind === activeFilter) && (!query || rowSearchText(row).includes(query)));
}

function kindLabel(kind) {
  return {exact:'Exact match',new:'New inquiry',conflict:'Conflict',review:'Questionable',unlinked:'No lead #'}[kind] || kind;
}

function renderTable() {
  const rows = filteredRows();
  $('migrationTableBody').innerHTML = rows.slice(0, TABLE_LIMIT).map(row => `
    <tr>
      <td><span class="match-pill match-${esc(row.kind)}">${esc(kindLabel(row.kind))}</span></td>
      <td><b>${row.bauerLeadNumber ?? '—'}</b><small>MS ID ${esc(row.marketsharpLeadId)}</small></td>
      <td><b>${esc(row.name)}</b>${row.phone ? `<small>${esc(displayPhone(row.phone))}</small>` : ''}</td>
      <td>${esc(row.addressText || 'Not entered')}</td>
      <td>${esc(row.source || 'Not entered')}</td>
      <td>${esc(row.appointmentCount)}</td>
      <td>${esc(row.jobCount)}</td>
      <td>${esc(row.reason)}</td>
    </tr>`).join('') || '<tr><td colspan="8" class="empty">No records match this view.</td></tr>';
  $('migrationTableNote').textContent = rows.length > TABLE_LIMIT
    ? `Showing the first ${TABLE_LIMIT.toLocaleString()} of ${rows.length.toLocaleString()} matching records. The downloaded crosswalk includes all records.`
    : `${rows.length.toLocaleString()} record${rows.length === 1 ? '' : 's'} shown.`;
}

function renderSummary() {
  const counts = migrationRows.reduce((out, row) => { out[row.kind] = (out[row.kind] || 0) + 1; return out; }, {});
  $('migrationTotal').textContent = migrationRows.length.toLocaleString();
  $('migrationExact').textContent = (counts.exact || 0).toLocaleString();
  $('migrationNew').textContent = (counts.new || 0).toLocaleString();
  $('migrationConflict').textContent = ((counts.conflict || 0) + (counts.review || 0)).toLocaleString();
  $('migrationUnlinked').textContent = (counts.unlinked || 0).toLocaleString();
  renderTable();
}

async function analyzeBackup() {
  const button = $('analyzeMarketSharpBtn');
  button.disabled = true;
  $('downloadCrosswalkBtn').disabled = true;
  $('migrationWarning').classList.add('hidden');
  migrationRows = [];
  try {
    updateProgress(4, 'Reading MarketSharp product types…');
    const productTypes = await xmlRows('PRODUCT_TYPE.xml');
    const leadNumberType = productTypes.find(row => String(row['PRODUCT TYPE NAME'] || '').trim().toLowerCase() === 'lead number');
    if (!leadNumberType) throw new Error('The Product Type named “Lead Number” was not found.');

    updateProgress(12, 'Reading Bauer lead numbers from Product Interest…');
    const interests = await xmlRows('LEAD_PRODUCT_INTERESTS.xml');
    const numberByLead = new Map();
    const numberFrequency = new Map();
    interests.forEach(row => {
      if (String(row['PRODUCT TYPE ID'] || '').toLowerCase() !== String(leadNumberType.ID || '').toLowerCase()) return;
      const number = normalizedNumber(row['PRICE QUOTED']);
      numberByLead.set(row['LEAD ID'], number);
      if (number !== null) numberFrequency.set(number, (numberFrequency.get(number) || 0) + 1);
    });

    updateProgress(24, 'Reading contacts…');
    const contacts = new Map((await xmlRows('CONTACT.xml')).map(row => [row.ID, row]));

    updateProgress(36, 'Reading properties…');
    const addresses = new Map();
    (await xmlRows('ADDRESS.xml')).forEach(row => {
      const current = addresses.get(row['CONTACT ID']);
      if (!current || row['PRIMARY ADDR TYPE'] === '1') addresses.set(row['CONTACT ID'], row);
    });

    updateProgress(47, 'Reading phone numbers…');
    const phones = new Map();
    (await xmlRows('PHONE_NUMBER.xml')).forEach(row => {
      const contact = contacts.get(row['CONTACT ID']);
      const current = phones.get(row['CONTACT ID']);
      if (!current || contact?.['PRIMARY PHONE ID'] === row.ID) phones.set(row['CONTACT ID'], normalizedPhone(row));
    });

    updateProgress(58, 'Reading appointments…');
    const appointmentCounts = new Map();
    (await xmlRows('APPOINTMENT.xml')).forEach(row => appointmentCounts.set(row['LEAD ID'], (appointmentCounts.get(row['LEAD ID']) || 0) + 1));

    updateProgress(68, 'Reading jobs…');
    const jobCounts = new Map();
    (await xmlRows('JOB.xml')).forEach(row => jobCounts.set(row['LEAD ID'], (jobCounts.get(row['LEAD ID']) || 0) + 1));

    updateProgress(78, 'Reading MarketSharp inquiries…');
    const marketSharpLeads = await xmlRows('LEAD.xml');

    updateProgress(87, 'Comparing with Bauer Roofing Operations…');
    existingLeads = await fetchAll('leads', 'id,lead_number,first_name,last_name,homeowner_name,street_address,city,state,zip,phone,email,created_at');
    const existingByNumber = new Map();
    existingLeads.forEach(lead => {
      const number = normalizedNumber(lead.lead_number);
      if (number === null) return;
      if (!existingByNumber.has(number)) existingByNumber.set(number, []);
      existingByNumber.get(number).push(lead);
    });
    const existingNumbers = [...existingByNumber.keys()].filter(number => number > 0);
    const currentMaximum = Math.max(0, ...existingNumbers);
    const reviewCeiling = currentMaximum ? currentMaximum + 500 : 9999;

    migrationRows = marketSharpLeads.map(lead => {
      const marketsharpLeadId = lead.ID;
      const contact = contacts.get(lead['CONTACT ID']) || {};
      const address = leadAddress(lead, addresses.get(lead['CONTACT ID']));
      const bauerLeadNumber = numberByLead.has(marketsharpLeadId) ? numberByLead.get(marketsharpLeadId) : null;
      const existing = bauerLeadNumber === null ? [] : (existingByNumber.get(bauerLeadNumber) || []);
      let kind = 'unlinked';
      let reason = 'No Lead Number Product Interest was entered in MarketSharp.';
      if (bauerLeadNumber !== null) {
        if (bauerLeadNumber <= 0) {
          kind = 'review'; reason = 'The stored lead number is zero and cannot identify an inquiry.';
        } else if ((numberFrequency.get(bauerLeadNumber) || 0) > 1) {
          kind = 'conflict'; reason = `Lead #${bauerLeadNumber} is used by more than one MarketSharp inquiry.`;
        } else if (existing.length > 1) {
          kind = 'conflict'; reason = `More than one Operations inquiry uses Lead #${bauerLeadNumber}.`;
        } else if (existing.length === 1) {
          kind = 'exact'; reason = 'One exact Bauer lead-number match.';
        } else if (bauerLeadNumber > reviewCeiling) {
          kind = 'review'; reason = `Lead #${bauerLeadNumber} is well above the current Operations range.`;
        } else {
          kind = 'new'; reason = 'Valid Bauer lead number not currently in Operations.';
        }
      }
      return {
        kind,
        bauerLeadNumber,
        marketsharpLeadId,
        marketsharpContactId: lead['CONTACT ID'] || '',
        operationsLeadId: existing[0]?.id || '',
        name: fullName(contact),
        phone: phones.get(lead['CONTACT ID']) || '',
        addressText: addressLine(address),
        street: address.street,
        city: address.city,
        state: address.state,
        zip: address.zip,
        source: lead['LEAD SOURCE PRIMARY DESCRIPTION'] || '',
        inquiryDate: lead['LEAD INQUIRY DATETIME'] || lead['LEAD CREATION DATE'] || '',
        appointmentCount: appointmentCounts.get(marketsharpLeadId) || 0,
        jobCount: jobCounts.get(marketsharpLeadId) || 0,
        reason
      };
    }).sort((a,b) => (a.bauerLeadNumber ?? Number.MAX_SAFE_INTEGER) - (b.bauerLeadNumber ?? Number.MAX_SAFE_INTEGER));

    updateProgress(100, `Comparison complete: ${migrationRows.length.toLocaleString()} MarketSharp inquiries reviewed.`);
    $('downloadCrosswalkBtn').disabled = false;
    const duplicated = migrationRows.filter(row => row.kind === 'conflict').length;
    const questionable = migrationRows.filter(row => row.kind === 'review').length;
    if (duplicated || questionable) {
      $('migrationWarning').textContent = `${(duplicated + questionable).toLocaleString()} records need a decision before import. They will never be merged automatically.`;
      $('migrationWarning').classList.remove('hidden');
    }
    renderSummary();
  } catch (error) {
    $('migrationStatus').textContent = error.message || String(error);
    $('migrationWarning').textContent = 'The comparison stopped without changing Bauer Roofing Operations.';
    $('migrationWarning').className = 'migration-warning migration-error';
  } finally {
    button.disabled = REQUIRED_FILES.some(name => !selectedFiles.has(name)) || !db;
  }
}

function csvValue(value) {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCrosswalk() {
  const columns = [
    ['kind','Result'],['bauerLeadNumber','Bauer Lead Number'],['marketsharpLeadId','MarketSharp Lead ID'],
    ['marketsharpContactId','MarketSharp Contact ID'],['operationsLeadId','Operations Lead ID'],['name','Contact'],
    ['phone','Phone'],['addressText','Property'],['source','Source'],['inquiryDate','Inquiry Date'],
    ['appointmentCount','Appointments'],['jobCount','Jobs'],['reason','Reason']
  ];
  const csv = [columns.map(([,label]) => csvValue(label)).join(','), ...migrationRows.map(row => columns.map(([key]) => csvValue(row[key])).join(','))].join('\r\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'}));
  link.download = `Bauer-MarketSharp-Crosswalk-${new Date().toISOString().slice(0,10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function start() {
  $('requiredFiles').innerHTML = REQUIRED_FILES.map(name => `<span>${esc(name)}</span>`).join('');
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
    showNotice('Bauer Roofing Operations is missing its database configuration.', 'error');
    return;
  }
  db = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const session = await db.auth.getSession();
  if (!session.data.session) {
    db = null;
    showNotice('Sign in to Bauer Roofing Operations first, then return to this migration screen.', 'error');
    $('authNotice').insertAdjacentHTML('beforeend', ' <a href="index.html">Open sign in</a>');
  } else {
    showNotice(`Signed in as ${session.data.session.user.email}. This screen is read only.`, 'success');
  }
  updateFileChecklist();
}

$('marketsharpFiles').addEventListener('change', event => {
  selectedFiles = new Map([...event.target.files].map(file => [file.name.toUpperCase(), file]));
  updateFileChecklist();
});
$('analyzeMarketSharpBtn').addEventListener('click', analyzeBackup);
$('downloadCrosswalkBtn').addEventListener('click', downloadCrosswalk);
$('migrationSearch').addEventListener('input', renderTable);
$('migrationFilters').addEventListener('click', event => {
  const button = event.target.closest('[data-migration-filter]');
  if (!button) return;
  activeFilter = button.dataset.migrationFilter;
  document.querySelectorAll('[data-migration-filter]').forEach(item => item.classList.toggle('active', item === button));
  renderTable();
});

start();
