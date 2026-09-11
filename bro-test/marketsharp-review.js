'use strict';

const cfg = window.BAUER_CONFIG || {};
const $ = id => document.getElementById(id);
const TABLE_LIMIT = 500;

let db = null;
let inquiries = [];
let contacts = new Map();
let selected = new Set();
let activeFilter = 'current';
let schemaReady = false;
let migrationRunning = false;

function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}

function showNotice(text, type = '') {
  const node = $('authNotice');
  node.textContent = text;
  node.className = `notice ${type}`.trim();
}

async function fetchAll(table, columns, orderColumn) {
  const rows = [];
  const pageSize = 1000;
  for (let start = 0; start < 100000; start += pageSize) {
    let query = db.from(table).select(columns).range(start, start + pageSize - 1);
    if (orderColumn) query = query.order(orderColumn, {ascending:true});
    const result = await query;
    if (result.error) throw result.error;
    rows.push(...(result.data || []));
    if ((result.data || []).length < pageSize) break;
  }
  return rows;
}

function contactDisplay(contact) {
  if (!contact) return 'Unnamed contact';
  const business = String(contact.business_name || '').trim();
  if (business) return business;
  return [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim() || 'Unnamed contact';
}

function addressParts(row, contact) {
  return {
    street: [row.property_address, row.property_address_line_two].filter(Boolean).join(' ').trim() || [contact?.address_line_one, contact?.address_line_two].filter(Boolean).join(' ').trim(),
    city: String(row.city || contact?.city || '').trim(),
    state: String(row.state || contact?.state || '').trim(),
    zip: String(row.zip || contact?.zip || '').trim()
  };
}

function addressText(row, contact) {
  const {street, city, state, zip} = addressParts(row, contact);
  const locality = [city, state, zip].filter(Boolean).join(' ').trim();
  return [street, locality].filter(Boolean).join(', ');
}

function inquiryDate(row) {
  const raw = String(row.inquiry_date_text || '').trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function inquiryDateLabel(row) {
  const date = inquiryDate(row);
  return date ? date.toLocaleDateString(undefined, {year:'numeric', month:'short', day:'numeric'}) : (row.inquiry_date_text || 'Not entered');
}

function isRecentCandidate(row) {
  if (row.migration_class !== 'new' || Number(row.job_count || 0) > 0) return false;
  const date = inquiryDate(row);
  if (!date) return false;
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  return date >= cutoff;
}

function canAddAsActiveLead(row) {
  return row.migration_class === 'new' && !row.operations_lead_id && row.promotion_status !== 'Migrated' && row.promotion_status !== 'Archive Only' && Number(row.job_count || 0) === 0;
}

function rowState(row) {
  if (row.operations_lead_id || row.promotion_status === 'Migrated') return 'linked';
  if (row.promotion_status === 'Archive Only') return 'archived';
  if (row.migration_class === 'conflict' || row.migration_class === 'review') return 'decision';
  if (row.migration_class !== 'new') return 'historical';
  if (Number(row.job_count || 0) > 0) return 'job';
  if (isRecentCandidate(row)) return 'current';
  return 'ready';
}

function statusLabel(row) {
  const state = rowState(row);
  if (state === 'linked') return row.promotion_status === 'Migrated' ? 'Migrated' : 'Already linked';
  if (state === 'archived') return 'Archive only';
  if (state === 'current') return 'Recent candidate';
  if (state === 'ready') return 'Numbered / older';
  if (state === 'job') return 'Has MS job';
  if (state === 'decision') return row.migration_class === 'conflict' ? 'Conflict' : 'Questionable';
  return 'Historical';
}

function statusClass(row) {
  const state = rowState(row);
  if (state === 'decision') return row.migration_class === 'conflict' ? 'conflict' : 'review';
  if (state === 'linked') return row.promotion_status === 'Migrated' ? 'migrated' : 'linked';
  if (state === 'archived') return 'archived';
  return state;
}

function rowSearchText(row) {
  const contact = contacts.get(row.marketsharp_contact_id);
  return [row.bauer_lead_number, contactDisplay(contact), contact?.business_name, contact?.first_name, contact?.last_name, contact?.phone, addressText(row, contact), row.source, row.marketsharp_lead_id, row.inquiry_date_text].join(' ').toLowerCase();
}

function filteredRows() {
  const query = String($('reviewSearch').value || '').trim().toLowerCase();
  return inquiries.filter(row => {
    const state = rowState(row);
    const matchesFilter = activeFilter === 'all' || state === activeFilter || (activeFilter === 'historical' && state === 'archived');
    return matchesFilter && (!query || rowSearchText(row).includes(query));
  }).sort((a,b) => (inquiryDate(b)?.getTime() || 0) - (inquiryDate(a)?.getTime() || 0));
}

function updateSelection() {
  inquiries.forEach(row => {
    if (!canAddAsActiveLead(row)) selected.delete(row.marketsharp_lead_id);
  });
  $('selectedCount').textContent = selected.size.toLocaleString();
  $('migrateSelectedBtn').disabled = !schemaReady || migrationRunning || selected.size === 0;
}

function renderSummary() {
  const counts = inquiries.reduce((out, row) => {
    const state = rowState(row);
    out[state] = (out[state] || 0) + 1;
    return out;
  }, {});
  $('reviewTotal').textContent = inquiries.length.toLocaleString();
  $('reviewCurrent').textContent = (counts.current || 0).toLocaleString();
  $('reviewReady').textContent = ((counts.current || 0) + (counts.ready || 0) + (counts.job || 0)).toLocaleString();
  $('reviewNeedsDecision').textContent = (counts.decision || 0).toLocaleString();
  $('reviewHistorical').textContent = ((counts.historical || 0) + (counts.archived || 0)).toLocaleString();
}

function decisionText(row) {
  const state = rowState(row);
  if (state === 'job') return 'Keep here for job migration; do not create as an active lead.';
  if (state === 'decision') return row.migration_class === 'conflict' ? 'Duplicate lead number. Needs manual matching.' : 'Lead number needs a manual decision.';
  if (state === 'historical') return 'No Bauer lead number. Preserved as history.';
  if (state === 'archived') return row.promotion_note || 'Reviewed and kept in the archive only.';
  if (state === 'linked') return 'Already connected to Bauer Roofing Operations.';
  if (state === 'current') return 'Recent numbered inquiry with no MarketSharp job. Review before adding.';
  return 'Older numbered inquiry with no MarketSharp job. Add only if it is still a working lead.';
}

function renderTable() {
  const rows = filteredRows();
  $('reviewTableBody').innerHTML = rows.slice(0, TABLE_LIMIT).map(row => {
    const contact = contacts.get(row.marketsharp_contact_id);
    const selectable = canAddAsActiveLead(row);
    const isCompany = !!String(contact?.business_name || '').trim();
    const archiveButton = selectable ? `<button type="button" data-archive-id="${esc(row.marketsharp_lead_id)}">Keep archive only</button>` : '';
    return `<tr>
      <td class="checkbox-cell">${selectable ? `<input type="checkbox" aria-label="Add Lead ${esc(row.bauer_lead_number || '')} to Operations" data-review-id="${esc(row.marketsharp_lead_id)}" ${selected.has(row.marketsharp_lead_id) ? 'checked' : ''}>` : ''}</td>
      <td><span class="status-pill status-${statusClass(row)}">${esc(statusLabel(row))}</span></td>
      <td><b>${esc(row.bauer_lead_number || '—')}</b><small>MS ID ${esc(row.marketsharp_lead_id)}</small></td>
      <td><b>${esc(inquiryDateLabel(row))}</b></td>
      <td><b>${esc(contactDisplay(contact))}</b>${isCompany ? '<span class="company-tag">Company</span>' : ''}${contact?.phone ? `<small>${esc(contact.phone)}</small>` : ''}${contact?.primary_email ? `<small>${esc(contact.primary_email)}</small>` : ''}</td>
      <td>${esc(addressText(row, contact) || 'Not entered')}</td>
      <td>${esc(row.source || 'Not entered')}</td>
      <td>${Number(row.appointment_count || 0).toLocaleString()}</td>
      <td>${Number(row.job_count || 0).toLocaleString()}</td>
      <td><div>${esc(decisionText(row))}</div>${archiveButton ? `<div class="row-actions" style="margin-top:6px">${archiveButton}</div>` : ''}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="10" class="empty">No records match this view.</td></tr>';
  $('reviewTableNote').textContent = rows.length > TABLE_LIMIT
    ? `Showing the first ${TABLE_LIMIT.toLocaleString()} of ${rows.length.toLocaleString()} matching records. Narrow the search to review a specific record.`
    : `${rows.length.toLocaleString()} record${rows.length === 1 ? '' : 's'} shown.`;
  updateSelection();
}

async function ensureOperationsContact(msContact, row) {
  if (!msContact) return null;
  if (msContact.operations_contact_id) return msContact.operations_contact_id;

  const name = contactDisplay(msContact);
  const {street, city, state, zip} = addressParts(row, msContact);
  const insert = await db.from('contacts').insert({
    name,
    phone: msContact.phone || null,
    email: msContact.primary_email || null,
    street_address: street || null,
    city: city || null,
    state: state || null,
    zip: zip || null,
    notes: `Migrated from MarketSharp contact ${msContact.marketsharp_contact_id}.`
  }).select('id').single();
  if (insert.error) throw new Error(`Could not create contact ${name}: ${insert.error.message}`);

  const link = await db.from('marketsharp_contacts')
    .update({operations_contact_id:insert.data.id, updated_at:new Date().toISOString()})
    .eq('marketsharp_contact_id', msContact.marketsharp_contact_id);
  if (link.error) throw new Error(`Contact ${name} was created, but its MarketSharp link could not be saved: ${link.error.message}`);

  msContact.operations_contact_id = insert.data.id;
  return insert.data.id;
}

function inferredWorkCategory(row) {
  const text = `${row.description || ''} ${row.notes || ''}`.toLowerCase();
  return /repair|leak|patch/.test(text) ? 'Repair' : 'Roofing';
}

async function migrateOne(row) {
  if (!canAddAsActiveLead(row)) return false;

  const existing = await db.from('leads').select('id').eq('lead_number', String(row.bauer_lead_number)).limit(1);
  if (existing.error) throw new Error(`Could not check Lead #${row.bauer_lead_number}: ${existing.error.message}`);
  if (existing.data?.length) {
    const link = await db.from('marketsharp_inquiries').update({
      operations_lead_id: existing.data[0].id,
      promotion_status: 'Migrated',
      promoted_at: new Date().toISOString(),
      promotion_note: 'Linked to an Operations inquiry that already existed at migration time.',
      updated_at: new Date().toISOString()
    }).eq('marketsharp_lead_id', row.marketsharp_lead_id);
    if (link.error) throw new Error(`Lead #${row.bauer_lead_number} exists, but the MarketSharp link could not be saved: ${link.error.message}`);
    row.operations_lead_id = existing.data[0].id;
    row.promotion_status = 'Migrated';
    return true;
  }

  const msContact = contacts.get(row.marketsharp_contact_id) || null;
  await ensureOperationsContact(msContact, row);

  const displayName = contactDisplay(msContact);
  const isBusiness = !!String(msContact?.business_name || '').trim();
  const {street, city, state, zip} = addressParts(row, msContact);
  const leadDate = inquiryDate(row);

  const leadInsert = await db.from('leads').insert({
    lead_number: String(row.bauer_lead_number),
    source: row.source || 'MarketSharp',
    import_source: 'MarketSharp Migration',
    homeowner_name: displayName,
    first_name: isBusiness ? '' : (msContact?.first_name || ''),
    last_name: isBusiness ? '' : (msContact?.last_name || ''),
    street_address: street,
    city,
    state,
    zip,
    phone: msContact?.phone || '',
    phone_secondary: msContact?.phone_secondary || '',
    email: msContact?.primary_email || '',
    work_category: inferredWorkCategory(row),
    lead_status: 'Active',
    assigned_to: 'Roy',
    lead_date: leadDate ? leadDate.toISOString().slice(0,10) : null,
    received_at: leadDate ? leadDate.toISOString() : null,
    source_reference: `MarketSharp inquiry ${row.marketsharp_lead_id}`,
    notes: [`Migrated from preserved MarketSharp inquiry ${row.marketsharp_lead_id}.`, `Original inquiry date: ${row.inquiry_date_text || 'not entered'}.`, row.notes || row.description || ''].filter(Boolean).join('\n')
  }).select('id').single();
  if (leadInsert.error) throw new Error(`Could not migrate Lead #${row.bauer_lead_number}: ${leadInsert.error.message}`);

  const archiveUpdate = await db.from('marketsharp_inquiries').update({
    operations_lead_id: leadInsert.data.id,
    promotion_status: 'Migrated',
    promoted_at: new Date().toISOString(),
    promotion_note: 'Created as an Active lead in Bauer Roofing Operations after review.',
    updated_at: new Date().toISOString()
  }).eq('marketsharp_lead_id', row.marketsharp_lead_id);
  if (archiveUpdate.error) throw new Error(`Lead #${row.bauer_lead_number} was created, but the MarketSharp link could not be saved: ${archiveUpdate.error.message}`);

  row.operations_lead_id = leadInsert.data.id;
  row.promotion_status = 'Migrated';
  return true;
}

async function keepArchiveOnly(row) {
  if (!canAddAsActiveLead(row)) return;
  const name = contactDisplay(contacts.get(row.marketsharp_contact_id));
  if (!confirm(`Keep Lead #${row.bauer_lead_number} (${name}) in the MarketSharp archive only? This will not add it to Operations.`)) return;
  const update = await db.from('marketsharp_inquiries').update({
    promotion_status: 'Archive Only',
    promoted_at: new Date().toISOString(),
    promotion_note: 'Reviewed and intentionally kept in the MarketSharp archive only.',
    updated_at: new Date().toISOString()
  }).eq('marketsharp_lead_id', row.marketsharp_lead_id);
  if (update.error) throw new Error(update.error.message);
  row.promotion_status = 'Archive Only';
  selected.delete(row.marketsharp_lead_id);
  renderSummary();
  renderTable();
  $('migrationStatus').textContent = `Lead #${row.bauer_lead_number} was reviewed and left in the MarketSharp archive only.`;
}

function setProgress(done, total, text) {
  $('migrationProgress').classList.remove('hidden');
  $('migrationProgressBar').style.width = `${total ? Math.round((done / total) * 100) : 0}%`;
  $('migrationStatus').textContent = text;
}

async function migrateSelected() {
  if (!schemaReady || migrationRunning || !selected.size) return;
  const rows = inquiries.filter(row => selected.has(row.marketsharp_lead_id) && canAddAsActiveLead(row));
  if (!rows.length) return;
  if (!confirm(`Add ${rows.length.toLocaleString()} selected MarketSharp inquir${rows.length === 1 ? 'y' : 'ies'} to Bauer Roofing Operations as ACTIVE leads? Records with MarketSharp jobs are excluded.`)) return;

  migrationRunning = true;
  $('migrationWarning').classList.add('hidden');
  updateSelection();
  let completed = 0;
  try {
    for (const row of rows) {
      setProgress(completed, rows.length, `Adding Lead #${row.bauer_lead_number}… ${completed.toLocaleString()} of ${rows.length.toLocaleString()} completed.`);
      await migrateOne(row);
      completed += 1;
      selected.delete(row.marketsharp_lead_id);
      setProgress(completed, rows.length, `${completed.toLocaleString()} of ${rows.length.toLocaleString()} selected inquiries added.`);
    }
    $('migrationStatus').textContent = `${completed.toLocaleString()} selected inquir${completed === 1 ? 'y was' : 'ies were'} added successfully. MarketSharp jobs remain preserved for the later job-migration stage.`;
  } catch (error) {
    $('migrationWarning').textContent = `${error.message || String(error)} Completed records are already linked, so you can safely fix the issue and run the remaining selection again.`;
    $('migrationWarning').classList.remove('hidden');
  } finally {
    migrationRunning = false;
    renderSummary();
    renderTable();
  }
}

async function checkSchema() {
  const archiveTest = await db.from('marketsharp_inquiries').select('marketsharp_lead_id,promotion_status,promoted_at').limit(1);
  const contactsTest = await db.from('contacts').select('id,name,street_address').limit(1);
  const leadsTest = await db.from('leads').select('id,lead_number,lead_status').limit(1);
  schemaReady = !archiveTest.error && !contactsTest.error && !leadsTest.error;
  if (!schemaReady) {
    const error = archiveTest.error || contactsTest.error || leadsTest.error;
    showNotice(`The review screen cannot safely migrate yet: ${error?.message || 'database structure check failed'}`, 'error');
  }
  updateSelection();
}

async function loadReview() {
  $('reviewTableBody').innerHTML = '<tr><td colspan="10" class="empty">Loading preserved MarketSharp records…</td></tr>';
  $('migrationStatus').textContent = 'Loading the preserved MarketSharp archive…';
  selected.clear();
  try {
    const [contactRows, inquiryRows] = await Promise.all([
      fetchAll('marketsharp_contacts', 'marketsharp_contact_id,first_name,last_name,business_name,primary_email,phone,phone_secondary,address_line_one,address_line_two,city,state,zip,operations_contact_id', 'marketsharp_contact_id'),
      fetchAll('marketsharp_inquiries', 'marketsharp_lead_id,marketsharp_contact_id,bauer_lead_number,operations_lead_id,migration_class,source,description,notes,inquiry_date_text,property_address,property_address_line_two,city,state,zip,appointment_count,job_count,promotion_status,promoted_at,promotion_note', 'marketsharp_lead_id')
    ]);
    contacts = new Map(contactRows.map(row => [row.marketsharp_contact_id, row]));
    inquiries = inquiryRows;
    renderSummary();
    renderTable();
    $('migrationStatus').textContent = 'Ready. Start with Recent candidates. Check only records that should still be working leads.';
  } catch (error) {
    inquiries = [];
    contacts = new Map();
    $('reviewTableBody').innerHTML = `<tr><td colspan="10" class="empty">${esc(error.message || String(error))}</td></tr>`;
    $('migrationStatus').textContent = 'The preserved archive could not be loaded.';
  }
}

async function start() {
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
    showNotice('Bauer Roofing Operations is missing its database configuration.', 'error');
    return;
  }
  db = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const session = await db.auth.getSession();
  if (!session.data.session) {
    db = null;
    showNotice('Sign in to Bauer Roofing Operations first, then return to this review screen.', 'error');
    $('authNotice').insertAdjacentHTML('beforeend', ' <a href="index.html">Open sign in</a>');
    return;
  }
  showNotice(`Signed in as ${session.data.session.user.email}. Nothing moves until you select it.`, 'success');
  await checkSchema();
  if (schemaReady) await loadReview();
}

$('refreshReviewBtn').addEventListener('click', loadReview);
$('reviewSearch').addEventListener('input', renderTable);
$('reviewFilters').addEventListener('click', event => {
  const button = event.target.closest('[data-review-filter]');
  if (!button) return;
  activeFilter = button.dataset.reviewFilter;
  document.querySelectorAll('[data-review-filter]').forEach(item => item.classList.toggle('active', item === button));
  renderTable();
});
$('reviewTableBody').addEventListener('change', event => {
  const checkbox = event.target.closest('[data-review-id]');
  if (!checkbox) return;
  if (checkbox.checked) selected.add(checkbox.dataset.reviewId); else selected.delete(checkbox.dataset.reviewId);
  updateSelection();
});
$('reviewTableBody').addEventListener('click', async event => {
  const button = event.target.closest('[data-archive-id]');
  if (!button) return;
  const row = inquiries.find(item => item.marketsharp_lead_id === button.dataset.archiveId);
  if (!row) return;
  try { await keepArchiveOnly(row); }
  catch (error) {
    $('migrationWarning').textContent = `Could not save that review decision: ${error.message || String(error)}`;
    $('migrationWarning').classList.remove('hidden');
  }
});
$('clearSelectionBtn').addEventListener('click', () => { selected.clear(); renderTable(); });
$('migrateSelectedBtn').addEventListener('click', migrateSelected);

start();
