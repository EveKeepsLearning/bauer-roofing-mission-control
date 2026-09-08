'use strict';

const cfg = window.BAUER_CONFIG || {};
const $ = id => document.getElementById(id);
const TABLE_LIMIT = 500;

let db = null;
let inquiries = [];
let contacts = new Map();
let selected = new Set();
let activeFilter = 'ready';
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

function addressText(row, contact) {
  const street = [row.property_address, row.property_address_line_two].filter(Boolean).join(' ').trim() || [contact?.address_line_one, contact?.address_line_two].filter(Boolean).join(' ').trim();
  const city = row.city || contact?.city || '';
  const state = row.state || contact?.state || '';
  const zip = row.zip || contact?.zip || '';
  const locality = [city, state, zip].filter(Boolean).join(' ').trim();
  return [street, locality].filter(Boolean).join(', ');
}

function rowState(row) {
  if (row.operations_lead_id || row.promotion_status === 'Migrated') return 'linked';
  if (row.migration_class === 'new') return 'ready';
  if (row.migration_class === 'conflict' || row.migration_class === 'review') return 'decision';
  return 'historical';
}

function statusLabel(row) {
  const state = rowState(row);
  if (state === 'linked') return row.promotion_status === 'Migrated' ? 'Migrated' : 'Already linked';
  if (state === 'ready') return 'Ready';
  if (state === 'decision') return row.migration_class === 'conflict' ? 'Conflict' : 'Questionable';
  return 'Historical';
}

function statusClass(row) {
  const state = rowState(row);
  if (state === 'decision') return row.migration_class === 'conflict' ? 'conflict' : 'review';
  if (state === 'linked') return row.promotion_status === 'Migrated' ? 'migrated' : 'linked';
  return state;
}

function rowSearchText(row) {
  const contact = contacts.get(row.marketsharp_contact_id);
  return [row.bauer_lead_number, contactDisplay(contact), contact?.business_name, contact?.first_name, contact?.last_name, contact?.phone, addressText(row, contact), row.source, row.marketsharp_lead_id].join(' ').toLowerCase();
}

function filteredRows() {
  const query = String($('reviewSearch').value || '').trim().toLowerCase();
  return inquiries.filter(row => (activeFilter === 'all' || rowState(row) === activeFilter) && (!query || rowSearchText(row).includes(query)));
}

function updateSelection() {
  inquiries.forEach(row => {
    if (rowState(row) !== 'ready') selected.delete(row.marketsharp_lead_id);
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
  $('reviewReady').textContent = (counts.ready || 0).toLocaleString();
  $('reviewLinked').textContent = (counts.linked || 0).toLocaleString();
  $('reviewNeedsDecision').textContent = (counts.decision || 0).toLocaleString();
  $('reviewHistorical').textContent = (counts.historical || 0).toLocaleString();
}

function renderTable() {
  const rows = filteredRows();
  $('reviewTableBody').innerHTML = rows.slice(0, TABLE_LIMIT).map(row => {
    const contact = contacts.get(row.marketsharp_contact_id);
    const isReady = rowState(row) === 'ready';
    const isCompany = !!String(contact?.business_name || '').trim();
    const reviewNote = row.migration_class === 'conflict'
      ? 'Duplicate lead number. Do not auto-migrate.'
      : row.migration_class === 'review'
        ? 'Lead number needs a manual decision.'
        : rowState(row) === 'historical'
          ? 'No Bauer lead number. Kept in archive.'
          : row.operations_lead_id
            ? 'Already connected to an Operations inquiry.'
            : 'Valid Bauer lead number not currently in Operations.';
    return `<tr>
      <td class="checkbox-cell">${isReady ? `<input type="checkbox" data-review-id="${esc(row.marketsharp_lead_id)}" ${selected.has(row.marketsharp_lead_id) ? 'checked' : ''}>` : ''}</td>
      <td><span class="status-pill status-${statusClass(row)}">${esc(statusLabel(row))}</span></td>
      <td><b>${esc(row.bauer_lead_number || '—')}</b><small>MS ID ${esc(row.marketsharp_lead_id)}</small></td>
      <td><b>${esc(contactDisplay(contact))}</b>${isCompany ? '<span class="company-tag">Company</span>' : ''}${contact?.phone ? `<small>${esc(contact.phone)}</small>` : ''}${contact?.primary_email ? `<small>${esc(contact.primary_email)}</small>` : ''}</td>
      <td>${esc(addressText(row, contact) || 'Not entered')}</td>
      <td>${esc(row.source || 'Not entered')}</td>
      <td>${Number(row.appointment_count || 0).toLocaleString()}</td>
      <td>${Number(row.job_count || 0).toLocaleString()}</td>
      <td>${esc(reviewNote)}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="9" class="empty">No records match this view.</td></tr>';
  $('reviewTableNote').textContent = rows.length > TABLE_LIMIT
    ? `Showing the first ${TABLE_LIMIT.toLocaleString()} of ${rows.length.toLocaleString()} matching records. Narrow the search to review a specific record.`
    : `${rows.length.toLocaleString()} record${rows.length === 1 ? '' : 's'} shown.`;
  updateSelection();
}

function normalizePropertyKey(street, city, state, zip) {
  const clean = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
  return `${clean(street)}|${clean(city)}|${clean(state)}|${String(zip || '').trim()}`;
}

async function ensureOperationsContact(msContact) {
  if (!msContact) return null;
  if (msContact.operations_contact_id) return msContact.operations_contact_id;

  const displayName = contactDisplay(msContact);
  const result = await db.from('contacts').insert({
    display_name: displayName,
    first_name: msContact.first_name || null,
    last_name: msContact.last_name || null,
    phone: msContact.phone || null,
    phone_secondary: msContact.phone_secondary || null,
    email: msContact.primary_email || null,
    notes: `Migrated from MarketSharp contact ${msContact.marketsharp_contact_id}.`
  }).select('id').single();
  if (result.error) throw new Error(`Could not create contact ${displayName}: ${result.error.message}`);

  const update = await db.from('marketsharp_contacts')
    .update({operations_contact_id:result.data.id, updated_at:new Date().toISOString()})
    .eq('marketsharp_contact_id', msContact.marketsharp_contact_id);
  if (update.error) throw new Error(`Contact was created, but its MarketSharp link could not be saved: ${update.error.message}`);

  msContact.operations_contact_id = result.data.id;
  return result.data.id;
}

async function ensureProperty(row, msContact) {
  const street = String(row.property_address || msContact?.address_line_one || '').trim();
  const city = String(row.city || msContact?.city || '').trim();
  const state = String(row.state || msContact?.state || '').trim();
  const zip = String(row.zip || msContact?.zip || '').trim();
  if (!street) return null;

  const normalizedKey = normalizePropertyKey(street, city, state, zip);
  const existing = await db.from('properties').select('id').eq('normalized_key', normalizedKey).limit(1);
  if (existing.error) throw new Error(`Could not check the property for Lead #${row.bauer_lead_number}: ${existing.error.message}`);
  if (existing.data?.length) return existing.data[0].id;

  const inserted = await db.from('properties').insert({
    street_address: street,
    city: city || null,
    state: state || null,
    zip: zip || null,
    normalized_key: normalizedKey,
    notes: `Created from MarketSharp inquiry ${row.marketsharp_lead_id}.`
  }).select('id').single();
  if (inserted.error) {
    const retry = await db.from('properties').select('id').eq('normalized_key', normalizedKey).limit(1);
    if (!retry.error && retry.data?.length) return retry.data[0].id;
    throw new Error(`Could not create the property for Lead #${row.bauer_lead_number}: ${inserted.error.message}`);
  }
  return inserted.data.id;
}

async function linkContactProperty(contactId, propertyId) {
  if (!contactId || !propertyId) return;
  const result = await db.from('contact_properties').upsert({
    contact_id: contactId,
    property_id: propertyId,
    relationship_type: 'Owner / Contact'
  }, {onConflict:'contact_id,property_id'});
  if (result.error) throw new Error(`Could not link the contact to the property: ${result.error.message}`);
}

async function migrateOne(row) {
  if (rowState(row) !== 'ready') return false;

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
  const contactId = await ensureOperationsContact(msContact);
  const propertyId = await ensureProperty(row, msContact);
  await linkContactProperty(contactId, propertyId);

  const displayName = contactDisplay(msContact);
  const street = String(row.property_address || msContact?.address_line_one || '').trim();
  const city = String(row.city || msContact?.city || '').trim();
  const state = String(row.state || msContact?.state || '').trim();
  const zip = String(row.zip || msContact?.zip || '').trim();

  const leadInsert = await db.from('leads').insert({
    lead_number: String(row.bauer_lead_number),
    source: row.source || 'MarketSharp',
    import_source: 'MarketSharp Migration',
    homeowner_name: displayName,
    first_name: msContact?.business_name ? '' : (msContact?.first_name || ''),
    last_name: msContact?.business_name ? '' : (msContact?.last_name || ''),
    street_address: street,
    city,
    state,
    zip,
    phone: msContact?.phone || '',
    email: msContact?.primary_email || '',
    work_category: 'Roofing',
    lead_status: 'Lead',
    assigned_to: 'Roy',
    notes: [`Migrated from preserved MarketSharp inquiry ${row.marketsharp_lead_id}.`, row.notes || row.description || ''].filter(Boolean).join('\n'),
    contact_id: contactId,
    property_id: propertyId
  }).select('id').single();
  if (leadInsert.error) throw new Error(`Could not migrate Lead #${row.bauer_lead_number}: ${leadInsert.error.message}`);

  const archiveUpdate = await db.from('marketsharp_inquiries').update({
    operations_lead_id: leadInsert.data.id,
    promotion_status: 'Migrated',
    promoted_at: new Date().toISOString(),
    promotion_note: 'Created in Bauer Roofing Operations from the preserved MarketSharp archive.',
    updated_at: new Date().toISOString()
  }).eq('marketsharp_lead_id', row.marketsharp_lead_id);
  if (archiveUpdate.error) throw new Error(`Lead #${row.bauer_lead_number} was created, but the MarketSharp link could not be saved: ${archiveUpdate.error.message}`);

  row.operations_lead_id = leadInsert.data.id;
  row.promotion_status = 'Migrated';
  return true;
}

function setProgress(done, total, text) {
  $('migrationProgress').classList.remove('hidden');
  $('migrationProgressBar').style.width = `${total ? Math.round((done / total) * 100) : 0}%`;
  $('migrationStatus').textContent = text;
}

async function migrateSelected() {
  if (!schemaReady || migrationRunning || !selected.size) return;
  const rows = inquiries.filter(row => selected.has(row.marketsharp_lead_id) && rowState(row) === 'ready');
  if (!rows.length) return;
  if (!confirm(`Migrate ${rows.length.toLocaleString()} selected MarketSharp inquir${rows.length === 1 ? 'y' : 'ies'} into Bauer Roofing Operations?`)) return;

  migrationRunning = true;
  $('migrationWarning').classList.add('hidden');
  updateSelection();
  let completed = 0;
  try {
    for (const row of rows) {
      setProgress(completed, rows.length, `Migrating Lead #${row.bauer_lead_number}… ${completed.toLocaleString()} of ${rows.length.toLocaleString()} completed.`);
      await migrateOne(row);
      completed += 1;
      selected.delete(row.marketsharp_lead_id);
      setProgress(completed, rows.length, `${completed.toLocaleString()} of ${rows.length.toLocaleString()} selected inquiries migrated.`);
    }
    $('migrationStatus').textContent = `${completed.toLocaleString()} selected inquir${completed === 1 ? 'y was' : 'ies were'} migrated successfully. Jobs remain preserved for the later job-migration stage.`;
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
  const test = await db.from('marketsharp_inquiries').select('marketsharp_lead_id,promotion_status,promoted_at').limit(1);
  schemaReady = !test.error;
  if (!schemaReady) {
    showNotice('The review screen is installed, but its one-time database setup still needs to be run in Supabase. Use supabase-marketsharp-review-migration.sql from the GitHub repository.', 'error');
  }
  updateSelection();
}

async function loadReview() {
  $('reviewTableBody').innerHTML = '<tr><td colspan="9" class="empty">Loading preserved MarketSharp records…</td></tr>';
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
    $('migrationStatus').textContent = 'Ready. Check the records you want to move into working Operations.';
  } catch (error) {
    inquiries = [];
    contacts = new Map();
    $('reviewTableBody').innerHTML = `<tr><td colspan="9" class="empty">${esc(error.message || String(error))}</td></tr>`;
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
$('selectShownBtn').addEventListener('click', () => {
  filteredRows().slice(0, TABLE_LIMIT).filter(row => rowState(row) === 'ready').forEach(row => selected.add(row.marketsharp_lead_id));
  renderTable();
});
$('clearSelectionBtn').addEventListener('click', () => { selected.clear(); renderTable(); });
$('migrateSelectedBtn').addEventListener('click', migrateSelected);

start();
