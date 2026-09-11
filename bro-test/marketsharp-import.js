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
let parsedBackup = null;
let archiveSchemaReady = false;
let archiveRunning = false;

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

function marketSharpBoolean(value, fallback = false) {
  const text = String(value ?? '').trim().toLowerCase();
  if (['true','1','yes','y'].includes(text)) return true;
  if (['false','0','no','n'].includes(text)) return false;
  return fallback;
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
  const ready = REQUIRED_FILES.filter(name => selectedFiles.has(name.toUpperCase())).length;
  $('requiredFiles').innerHTML = REQUIRED_FILES.map(name => `<span class="${selectedFiles.has(name.toUpperCase()) ? 'ready' : ''}">${esc(name)}</span>`).join('');
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
  return {exact:'Exact match',new:'New inquiry',conflict:'Conflict',review:'Questionable',historical:'Historical'}[kind] || kind;
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
  $('migrationUnlinked').textContent = (counts.historical || 0).toLocaleString();
  renderTable();
}

function updateArchiveButton() {
  $('archiveCoreBtn').disabled = archiveRunning || !archiveSchemaReady || !parsedBackup || !$('archiveConfirm').checked;
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
    const contactRows = await xmlRows('CONTACT.xml');
    const contacts = new Map(contactRows.map(row => [row.ID, row]));

    updateProgress(36, 'Reading properties…');
    const addressRows = await xmlRows('ADDRESS.xml');
    const addresses = new Map();
    addressRows.forEach(row => {
      const current = addresses.get(row['CONTACT ID']);
      if (!current || row['PRIMARY ADDR TYPE'] === '1') addresses.set(row['CONTACT ID'], row);
    });

    updateProgress(47, 'Reading phone numbers…');
    const phoneRows = await xmlRows('PHONE_NUMBER.xml');
    const phoneLists = new Map();
    phoneRows.forEach(row => {
      const list = phoneLists.get(row['CONTACT ID']) || [];
      list.push(row);
      phoneLists.set(row['CONTACT ID'], list);
    });
    const phones = new Map();
    phoneRows.forEach(row => {
      const contact = contacts.get(row['CONTACT ID']);
      const current = phones.get(row['CONTACT ID']);
      if (!current || contact?.['PRIMARY PHONE ID'] === row.ID) phones.set(row['CONTACT ID'], normalizedPhone(row));
    });

    updateProgress(58, 'Reading appointments…');
    const appointmentCounts = new Map();
    const appointments = await xmlRows('APPOINTMENT.xml');
    appointments.forEach(row => appointmentCounts.set(row['LEAD ID'], (appointmentCounts.get(row['LEAD ID']) || 0) + 1));

    updateProgress(68, 'Reading jobs…');
    const jobCounts = new Map();
    const jobs = await xmlRows('JOB.xml');
    jobs.forEach(row => jobCounts.set(row['LEAD ID'], (jobCounts.get(row['LEAD ID']) || 0) + 1));

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
      let kind = 'historical';
      let reason = 'Valid MarketSharp history from before or outside Bauer lead numbering.';
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

    parsedBackup = {contactRows, contacts, addressRows, addresses, phoneRows, phoneLists, phones, marketSharpLeads, appointments, jobs};

    updateProgress(100, `Comparison complete: ${migrationRows.length.toLocaleString()} MarketSharp inquiries reviewed.`);
    $('downloadCrosswalkBtn').disabled = false;
    const duplicated = migrationRows.filter(row => row.kind === 'conflict').length;
    const questionable = migrationRows.filter(row => row.kind === 'review').length;
    if (duplicated || questionable) {
      $('migrationWarning').textContent = `${(duplicated + questionable).toLocaleString()} records need a decision before import. They will never be merged automatically.`;
      $('migrationWarning').classList.remove('hidden');
    }
    renderSummary();
    updateArchiveButton();
  } catch (error) {
    $('migrationStatus').textContent = error.message || String(error);
    $('migrationWarning').textContent = 'The comparison stopped without changing Bauer Roofing Operations.';
    $('migrationWarning').className = 'migration-warning migration-error';
  } finally {
    button.disabled = REQUIRED_FILES.some(name => !selectedFiles.has(name.toUpperCase())) || !db;
    updateArchiveButton();
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

async function checkArchiveSetup() {
  if (!db) return false;
  $('archiveSetupStatus').textContent = 'Checking database setup…';
  $('archiveSetupStatus').className = 'setup-status setup-needed';
  const result = await db.from('marketsharp_inquiries').select('marketsharp_lead_id', {count:'exact', head:true});
  archiveSchemaReady = !result.error;
  if (archiveSchemaReady) {
    $('archiveSetupStatus').textContent = `Database ready • ${(result.count || 0).toLocaleString()} inquiries preserved`;
    $('archiveSetupStatus').className = 'setup-status setup-ready';
  } else {
    $('archiveSetupStatus').textContent = 'Database setup needed';
    $('archiveSetupStatus').className = 'setup-status setup-needed';
  }
  updateArchiveButton();
  return archiveSchemaReady;
}

async function copyArchiveSetupSql() {
  try {
    const response = await fetch(`supabase-marketsharp-archive.sql?t=${Date.now()}`, {cache:'no-store'});
    if (!response.ok) throw new Error('The setup file could not be opened.');
    const sql = await response.text();
    await navigator.clipboard.writeText(sql);
    $('archiveStatus').textContent = 'Database setup SQL copied. Paste it into the Supabase SQL Editor and click Run.';
  } catch (error) {
    const link = document.createElement('a');
    link.href = 'supabase-marketsharp-archive.sql';
    link.download = 'supabase-marketsharp-archive.sql';
    link.click();
    $('archiveStatus').textContent = 'The setup SQL was downloaded. Open it, copy everything, and run it in the Supabase SQL Editor.';
  }
}

function setArchiveProgress(percent, text) {
  $('archiveProgress').classList.remove('hidden');
  $('archiveProgressBar').style.width = `${Math.max(0, Math.min(100, percent))}%`;
  $('archiveStatus').textContent = text;
}

async function upsertArchiveBatches(table, rows, conflictColumn, startPercent, endPercent, label) {
  const batchSize = 250;
  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    const result = await db.from(table).upsert(batch, {onConflict:conflictColumn});
    if (result.error) throw new Error(`${label} stopped: ${result.error.message}`);
    const completed = Math.min(start + batch.length, rows.length);
    const progress = rows.length ? completed / rows.length : 1;
    setArchiveProgress(startPercent + (endPercent - startPercent) * progress, `${label}: ${completed.toLocaleString()} of ${rows.length.toLocaleString()}`);
  }
}

function contactArchiveRows() {
  return parsedBackup.contactRows.filter(row => row.ID).map(contact => {
    const address = parsedBackup.addresses.get(contact.ID) || {};
    const phoneRows = parsedBackup.phoneLists.get(contact.ID) || [];
    const primary = phoneRows.find(row => row.ID === contact['PRIMARY PHONE ID']) || phoneRows[0] || {};
    const secondary = phoneRows.find(row => row.ID !== primary.ID) || {};
    return {
      marketsharp_contact_id: contact.ID,
      first_name: contact['CONTACT FIRST NAME'] || null,
      last_name: contact['CONTACT LAST NAME'] || null,
      business_name: contact['BUSINESS NAME'] || null,
      primary_email: contact['PRIMARY EMAIL'] || null,
      phone: normalizedPhone(primary) || null,
      phone_secondary: normalizedPhone(secondary) || null,
      address_line_one: address['ADDR LINEONE'] || null,
      address_line_two: address['ADDR LINETWO'] || null,
      city: address['ADDR CITY'] || null,
      state: address['ADDR STATE'] || null,
      zip: address['ADDR ZIP'] || null,
      do_not_mail: marketSharpBoolean(contact['CONTACT DO NOT MAIL']),
      do_not_email: marketSharpBoolean(contact['HAS DNE EMAIL']) || marketSharpBoolean(contact['PRIMARY EMAIL DNE']),
      do_not_call: phoneRows.some(row => marketSharpBoolean(row['PHONE HOUSE DO NOT CALL'])),
      do_not_text: phoneRows.some(row => marketSharpBoolean(row['PHONE DNT TEXTING OPT OUT'])),
      raw_data: contact,
      updated_at: new Date().toISOString()
    };
  });
}

function inquiryArchiveRows() {
  const crosswalk = new Map(migrationRows.map(row => [row.marketsharpLeadId, row]));
  return parsedBackup.marketSharpLeads.filter(row => row.ID).map(lead => {
    const match = crosswalk.get(lead.ID);
    return {
      marketsharp_lead_id: lead.ID,
      marketsharp_contact_id: lead['CONTACT ID'] || null,
      bauer_lead_number: match?.bauerLeadNumber === null || match?.bauerLeadNumber === undefined ? null : String(match.bauerLeadNumber),
      operations_lead_id: match?.operationsLeadId || null,
      migration_class: match?.kind || 'historical',
      source: lead['LEAD SOURCE PRIMARY DESCRIPTION'] || null,
      description: lead['LEAD DESCRIPTION'] || null,
      notes: lead['LEAD NOTES'] || null,
      inquiry_date_text: lead['LEAD INQUIRY DATETIME'] || lead['LEAD CREATION DATE'] || null,
      property_address: lead['LEAD JOB SITE ADDRESS'] || null,
      property_address_line_two: lead['LEAD JOB SITE ADDRESS LINE2'] || null,
      city: lead['LEAD JOB SITE CITY'] || null,
      state: lead['LEAD JOB SITE STATE'] || null,
      zip: lead['LEAD JOB SITE ZIP'] || null,
      appointment_count: match?.appointmentCount || 0,
      job_count: match?.jobCount || 0,
      raw_data: lead,
      updated_at: new Date().toISOString()
    };
  });
}

function appointmentArchiveRows() {
  return parsedBackup.appointments.filter(row => row.ID).map(appointment => ({
    marketsharp_appointment_id: appointment.ID,
    marketsharp_lead_id: appointment['LEAD ID'] || null,
    appointment_date_text: appointment['APPT DATE'] || null,
    appointment_set_date_text: appointment['APPT SET DATE'] || null,
    appointment_type: appointment['APPT TYPE'] || null,
    appointment_result: appointment['APPT RESULT CODE DESCRIPTION'] || null,
    salesperson_employee_id: appointment['APPT SALES1 EMP ID'] || null,
    is_active: marketSharpBoolean(appointment['IS ACTIVE'], true),
    raw_data: appointment,
    updated_at: new Date().toISOString()
  }));
}

function jobArchiveRows() {
  return parsedBackup.jobs.filter(row => row.ID).map(job => ({
    marketsharp_job_id: job.ID,
    marketsharp_lead_id: job['LEAD ID'] || null,
    marketsharp_contact_id: job['CONTACT ID'] || null,
    job_number: job['JOB NUMBER'] || null,
    job_name: job['JOB NAME'] || null,
    job_description: job['JOB DESC'] || null,
    job_type: job['JOB TYPE'] || null,
    job_status: job['JOB STATUS'] || null,
    address_line_one: job['JOB ADDRESS1'] || null,
    address_line_two: job['JOB ADDRESS2'] || null,
    city: job['JOB CITY'] || null,
    state: job['JOB STATE'] || null,
    zip: job['JOB ZIP'] || null,
    start_date_text: job['JOB START DATE'] || null,
    sale_date_text: job['SALE DATE'] || null,
    notes: job['JOB NOTE'] || null,
    is_active: marketSharpBoolean(job['IS ACTIVE'], true),
    raw_data: job,
    updated_at: new Date().toISOString()
  }));
}

async function archiveCoreRecords() {
  if (!archiveSchemaReady || !parsedBackup || archiveRunning || !$('archiveConfirm').checked) return;
  const counts = [parsedBackup.contactRows.length, parsedBackup.marketSharpLeads.length, parsedBackup.appointments.length, parsedBackup.jobs.length];
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (!confirm(`Preserve ${total.toLocaleString()} core MarketSharp records in separate archive tables? Existing Contacts and Open Jobs will not be changed.`)) return;
  archiveRunning = true;
  updateArchiveButton();
  try {
    await upsertArchiveBatches('marketsharp_contacts', contactArchiveRows(), 'marketsharp_contact_id', 0, 29, 'Preserving contacts');
    await upsertArchiveBatches('marketsharp_inquiries', inquiryArchiveRows(), 'marketsharp_lead_id', 29, 62, 'Preserving inquiries and lead-number links');
    await upsertArchiveBatches('marketsharp_appointments', appointmentArchiveRows(), 'marketsharp_appointment_id', 62, 91, 'Preserving appointments');
    await upsertArchiveBatches('marketsharp_jobs', jobArchiveRows(), 'marketsharp_job_id', 91, 100, 'Preserving jobs');
    setArchiveProgress(100, `${total.toLocaleString()} core MarketSharp records are safely preserved. Re-running this step will update the same records, not duplicate them.`);
    await checkArchiveSetup();
  } catch (error) {
    $('archiveStatus').textContent = `${error.message || String(error)} You can safely run the archive again; completed batches will be updated rather than duplicated.`;
  } finally {
    archiveRunning = false;
    updateArchiveButton();
  }
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
    showNotice(`Signed in as ${session.data.session.user.email}. Review first; archive only after confirmation.`, 'success');
    await checkArchiveSetup();
  }
  updateFileChecklist();
}

$('marketsharpFiles').addEventListener('change', event => {
  selectedFiles = new Map([...event.target.files].map(file => [file.name.toUpperCase(), file]));
  updateFileChecklist();
});
$('analyzeMarketSharpBtn').addEventListener('click', analyzeBackup);
$('downloadCrosswalkBtn').addEventListener('click', downloadCrosswalk);
$('copyArchiveSetupBtn').addEventListener('click', copyArchiveSetupSql);
$('checkArchiveSetupBtn').addEventListener('click', checkArchiveSetup);
$('archiveConfirm').addEventListener('change', updateArchiveButton);
$('archiveCoreBtn').addEventListener('click', archiveCoreRecords);
$('migrationSearch').addEventListener('input', renderTable);
$('migrationFilters').addEventListener('click', event => {
  const button = event.target.closest('[data-migration-filter]');
  if (!button) return;
  activeFilter = button.dataset.migrationFilter;
  document.querySelectorAll('[data-migration-filter]').forEach(item => item.classList.toggle('active', item === button));
  renderTable();
});

start();
