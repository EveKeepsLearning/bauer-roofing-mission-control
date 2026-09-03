'use strict';

const cfg = window.BAUER_CONFIG || {};

let db = null;
let user = null;

let state = {
  tasks: [],
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
  suggestions: []
};

const $ = id => document.getElementById(id);

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

  renderIncoming();
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


function prospectName(p) {
  return p.customer_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unnamed prospect';
}


function leadName(l) {
  return l.homeowner_name || [l.first_name, l.last_name].filter(Boolean).join(' ') || 'Unnamed lead';
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

  select.innerHTML =
    state.sops
      .map(s => `
        <option value="${esc(s.id)}">
          ${esc(s.title)}
        </option>
      `)
      .join('');

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

  db.auth.onAuthStateChange(
    (_event, nextSession) =>
      handleSession(
        nextSession
      )
  );
}


async function handleSession(
  session
) {
  user =
    session?.user ||
    null;

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


$('loginBtn').onclick =
  async () => {

    const email =
      $('loginEmail')
        .value
        .trim();

    if (!email) {
      authMsg(
        'Enter your email.',
        'error'
      );

      return;
    }

    const {
      error
    } =
      await db.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo:
            location.href.split('#')[0]
        }
      });

    if (error) {
      authMsg(
        error.message,
        'error'
      );
    } else {
      authMsg(
        'Check your email for the sign-in link.',
        'success'
      );
    }
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

$('saveIncomingBtn').onclick =
  saveIncoming;

$('newTaskBtn').onclick =
  () =>
    $('taskDialog')
      .showModal();

$('saveTaskBtn').onclick =
  saveTask;

$('newProspectBtn').onclick =
  openProspectDialog;

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
  const progress = t.progress_total ? ` • <b>${esc(t.progress_current || 0)} of ${esc(t.progress_total)}</b>` : '';
  const skipButton = t.recurring_rule_id ? '<button class="btn small" data-action="skip">Skip</button>' : '';
  return `
    <div class="task" data-task-id="${esc(t.id)}">
      <div class="task-title"><b>${esc(t.task)}</b><span class="badge ${esc(t.base_priority)}">${esc(t.base_priority)}</span></div>
      <div class="meta">${esc(t.status)}${progress}${t.next_action ? ' • Next: ' + esc(t.next_action) : ''}${dueStamp(t) ? ' • Due ' + esc(dueStamp(t)) : ''}${relatedLabel(t) ? ' • ' + relatedLabel(t) : ''}</div>
      ${t.description ? `<div>${esc(t.description)}</div>` : ''}
      <div class="actions">
        <button class="btn primary small" data-action="start">Start</button>
        <button class="btn small" data-action="pause">Pause</button>
        <button class="btn small" data-action="resume">Resume</button>
        <button class="btn small" data-action="complete">Complete</button>
        ${skipButton}
        <button class="btn small" data-action="block">Block</button>
        <button class="btn small" data-edit-task="${esc(t.id)}">Edit</button>
        <button class="btn small" data-record-action="delete" data-record-table="tasks" data-record-id="${esc(t.id)}">Delete</button>
      </div>
    </div>`;
}

function actionableTasks() {
  const finished = new Set(['Completed','Cancelled','Skipped']);
  return state.tasks
    .filter(t => activeRow(t) && !finished.has(t.status) && t.status !== 'In Progress' && !['Blocked','Waiting'].includes(t.status))
    .sort((a,b) => {
      const p = priorityRank(b.base_priority) - priorityRank(a.base_priority);
      return p || String(a.due_date || '9999').localeCompare(String(b.due_date || '9999'));
    });
}

function currentTask() {
  return state.tasks.find(t => activeRow(t) && t.status === 'In Progress') || null;
}

function renderDashboard() {
  $('nowText').textContent = localNow();
  const cur = currentTask();
  $('currentTask').innerHTML = cur ? `<div class="card critical"><h2>Current / Resume</h2>${taskCard(cur)}</div>` : '';
  const acts = actionableTasks();
  $('taskList').innerHTML = acts.map(taskCard).join('') || empty('Nothing urgent right now.');
  const blocked = state.tasks.filter(t => activeRow(t) && ['Blocked','Waiting'].includes(t.status));
  $('blockedList').innerHTML = blocked.map(taskCard).join('') || empty('None.');
  const jw = jobsThisWeek().filter(activeRow);
  $('weekJobs').innerHTML = jw.map(j => `<div class="task"><b>${esc(j.customer_name || 'Unnamed customer')}</b><div class="meta">${esc(j.property_address || '')} • ${esc(j.stage)} • Start ${esc(j.confirmed_start_date || j.target_start_date || 'Not set')}</div></div>`).join('') || empty('No jobs entered for this week yet.');
  const comms = commDueSoon();
  $('commList').innerHTML = comms.map(c => `<div class="task"><b>${esc(c.purpose)}</b><div class="meta">Job ${esc(c.job_id || '')} • ${esc(c.status)} • Due ${esc([c.due_date,c.due_time].filter(Boolean).join(' '))}</div></div>`).join('') || empty('No communication due in the next two days.');
  const td = todayISO();
  const isOpen = t => activeRow(t) && !['Completed','Cancelled','Skipped'].includes(t.status);
  $('kpiCritical').textContent = state.tasks.filter(t => isOpen(t) && (t.base_priority === 'Critical' || (t.due_date && t.due_date < td))).length;
  $('kpiDue').textContent = state.tasks.filter(t => isOpen(t) && t.due_date === td).length;
  $('kpiComms').textContent = comms.length;
  $('kpiWeekJobs').textContent = jw.length;
  renderIncoming(); renderPhone(); renderJobs();
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

function phoneDigits(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  return digits;
}

function contactActionHtml({ phone = '', email = '', kind = '', id = '', name = '' } = {}) {
  const digits = phoneDigits(phone);
  const subject = encodeURIComponent('Bauer Roofing');
  const call = digits ? `<a class="btn small primary" href="tel:${esc(digits)}">☎ Call</a>` : '';
  const text = digits ? `<a class="btn small" href="sms:${esc(digits)}">Text</a>` : '';
  const mail = email ? `<a class="btn small" href="mailto:${esc(email)}?subject=${subject}">Email</a>` : '';
  const log = kind && id ? `<button class="btn small" data-log-communication="${esc(kind)}" data-contact-id="${esc(id)}">Log Communication</button>` : '';
  return `<div class="actions contact-actions">${call}${text}${mail}${log}</div>`;
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

function renderJobs() {
  const activeJobs = state.jobs.filter(activeRow);
  const rows = activeJobs.map(j => {
    const contact = contactForJob(j);
    return `<tr><td>${esc(j.customer_name)}</td><td>${esc(j.lead_number || '')}</td><td>${esc(j.job_number || '')}</td><td>${esc(j.property_address || '')}</td><td class="job-stage">${esc(j.stage)}</td><td>${esc(j.confirmed_start_date || j.target_start_date || '')}</td><td>${esc(j.salesperson || '')}</td><td>${contactActionHtml({phone:contact.phone,email:contact.email,kind:'job',id:j.id,name:contact.name})}<details><summary>History</summary>${communicationHistoryHtml('job',j.id)}</details><div class="actions"><button class="btn small" data-edit-job="${esc(j.id)}">View / Edit</button> <button class="btn small" data-record-action="archive" data-record-table="jobs" data-record-id="${esc(j.id)}">Archive</button> <button class="btn small" data-record-action="delete" data-record-table="jobs" data-record-id="${esc(j.id)}">Delete</button></div></td></tr>`;
  }).join('');
  $('jobsTable').innerHTML = `<div class="table-wrap"><table class="simple-table"><thead><tr><th>Customer</th><th>Lead #</th><th>Job #</th><th>Address</th><th>Stage</th><th>Start</th><th>Salesperson</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div>${rows ? '' : empty('No jobs entered yet.')}`;
  $('allComms').innerHTML = state.communications.map(c => `<div class="task"><b>${esc(c.purpose)}</b><div class="meta ${c.due_date && c.due_date < todayISO() && c.status !== 'Completed' ? 'comm-overdue' : ''}">${esc(c.type)} • ${esc(c.status)} • Due ${esc(c.due_date || '')} ${esc(c.due_time || '')}</div></div>`).join('') || empty('No communication responsibilities yet.');
  const archived = state.jobs.filter(j => !j.deleted_at && j.archived_at);
  $('archivedJobsList').innerHTML = archived.map(j => `<div class="task"><b>${esc(j.customer_name || 'Unnamed customer')}</b><div class="meta">${j.job_number ? 'Job # ' + esc(j.job_number) : ''}${j.property_address ? ' • ' + esc(j.property_address) : ''}</div><div class="actions"><button class="btn small" data-record-action="restore" data-record-table="jobs" data-record-id="${esc(j.id)}">Restore</button><button class="btn small" data-record-action="delete" data-record-table="jobs" data-record-id="${esc(j.id)}">Delete</button></div></div>`).join('') || empty('No archived jobs.');
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

function clearTaskForm() { ['taskEditId','taskName','taskCategory','taskDueDate','taskDueTime','taskRelatedNumber','taskDescription','taskNext','taskNotes'].forEach(id=>{if($(id))$(id).value='';}); $('taskPriority').value='Normal'; $('taskDialogTitle').textContent='New Task'; $('saveTaskBtn').textContent='Save'; }
function openTaskEdit(id) { const t=state.tasks.find(x=>x.id===id); if(!t)return; $('taskEditId').value=t.id; $('taskName').value=t.task||''; $('taskCategory').value=t.category||''; $('taskPriority').value=t.base_priority||'Normal'; $('taskDueDate').value=t.due_date||''; $('taskDueTime').value=t.due_time||''; $('taskRelatedNumber').value=t.related_number||t.job_number||t.lead_number||''; $('taskDescription').value=t.description||''; $('taskNext').value=t.next_action||''; $('taskNotes').value=t.notes||''; $('taskDialogTitle').textContent='Edit Task'; $('saveTaskBtn').textContent='Save Changes'; $('taskDialog').showModal(); }
async function saveTask() { try { const id=$('taskEditId').value; const task=$('taskName').value.trim(); if(!task)return msg('Task name is required.','error'); const related=resolveRelatedNumber($('taskRelatedNumber').value); const patch={task,description:$('taskDescription').value.trim(),category:$('taskCategory').value.trim(),base_priority:$('taskPriority').value,due_date:$('taskDueDate').value||null,due_time:$('taskDueTime').value||null,next_action:$('taskNext').value.trim(),notes:$('taskNotes').value.trim(),related_number:related.related_number,lead_number:related.lead_number,job_number:related.job_number}; if(id){await updateRecord('tasks',id,patch,'Task changes undone.');} else {const r=await db.from('tasks').insert({...patch,task_type:'One-Time',status:'Not Started'}).select().single(); if(r.error)throw r.error; await db.from('undo_history').insert({action_type:'create',entity_type:'tasks',entity_id:r.data.id,description:'New task removed.',payload:{}});} $('taskDialog').close(); clearTaskForm(); await loadAll(); msg(id?'Task updated.':'Task created.','success'); } catch(error){msg(error.message||String(error),'error');} }

function clearProspectForm() { ['prospectEditId','prospectSourceRef','prospectFirstName','prospectLastName','prospectStreet','prospectCity','prospectZip','prospectPhone','prospectEmail','prospectNextFollow','prospectNextAction','prospectNotes'].forEach(id=>{if($(id))$(id).value='';}); $('prospectState').value='SC'; $('prospectWorkCategory').value='Roofing'; $('prospectDialogTitle').textContent='New Prospect'; $('saveProspectBtn').textContent='Save Prospect'; setupLeadProspectSelects(); }
function openProspectDialog(prospect=null) { clearProspectForm(); if(prospect){$('prospectEditId').value=prospect.id; $('prospectDialogTitle').textContent='Prospect Details'; $('saveProspectBtn').textContent='Save Changes'; $('prospectSource').value=prospect.source||'Other'; toggleAngiFields('prospect'); $('prospectSourceAccount').value=prospect.source_account||''; $('prospectSourceRef').value=prospect.source_reference||''; $('prospectStatus').value=prospect.current_status||'New'; $('prospectFirstName').value=prospect.first_name||''; $('prospectLastName').value=prospect.last_name||''; $('prospectStreet').value=prospect.street_address||''; $('prospectCity').value=prospect.city||''; $('prospectState').value=prospect.state||'SC'; $('prospectZip').value=prospect.zip||''; $('prospectPhone').value=prospect.phone||''; $('prospectEmail').value=prospect.email||''; $('prospectWorkCategory').value=prospect.work_category||'Roofing'; $('prospectAssignedTo').value=prospect.assigned_to||'Roy'; $('prospectNextFollow').value=dateTimeLocalValue(prospect.next_follow_up_at); $('prospectNextAction').value=prospect.next_action||''; $('prospectNotes').value=prospect.notes||'';} $('prospectDialog').showModal(); }
async function saveProspect() { try { const id=$('prospectEditId').value; const first=$('prospectFirstName').value.trim(), last=$('prospectLastName').value.trim(), phone=$('prospectPhone').value.trim(), email=$('prospectEmail').value.trim(); if(!first&&!last&&!phone&&!email)return msg('Enter at least a name, phone number, or email for the prospect.','error'); const row={source:$('prospectSource').value,source_account:$('prospectSource').value==='Angi'?($('prospectSourceAccount').value||null):null,source_reference:$('prospectSourceRef').value.trim()||null,first_name:first,last_name:last,customer_name:[first,last].filter(Boolean).join(' '),street_address:$('prospectStreet').value.trim(),city:$('prospectCity').value.trim(),state:$('prospectState').value.trim(),zip:$('prospectZip').value.trim(),phone,email,work_category:$('prospectWorkCategory').value,current_status:$('prospectStatus').value,assigned_to:$('prospectAssignedTo').value,next_follow_up_at:$('prospectNextFollow').value?new Date($('prospectNextFollow').value).toISOString():null,next_action:$('prospectNextAction').value.trim(),notes:$('prospectNotes').value.trim()}; if(id){await updateRecord('prospects',id,row,'Prospect changes undone.');} else {const r=await db.from('prospects').insert({...row,import_source:'Manual'}).select().single(); if(r.error)throw r.error; await db.from('undo_history').insert({action_type:'create',entity_type:'prospects',entity_id:r.data.id,description:'New prospect removed.',payload:{}});} $('prospectDialog').close(); await loadAll(); msg(id?'Prospect updated.':'Prospect saved.','success'); } catch(error){msg('Could not save prospect: '+(error.message||String(error)),'error');} }

function clearLeadForm() { ['leadEditId','leadProspectId','leadNumber','leadSourceRef','leadFirstName','leadLastName','leadStreet','leadCity','leadZip','leadPhone','leadEmail','leadAppointmentDate','leadAppointmentTime','leadEstimateNote','leadNotes'].forEach(id=>{if($(id))$(id).value='';}); $('leadState').value='SC'; $('leadWorkCategory').value='Roofing'; $('leadStatus').value='Appointment Wanted'; $('leadDialogTitle').textContent='New Lead'; $('saveLeadBtn').textContent='Save Lead'; setupLeadProspectSelects(); }
function openLeadEdit(id) { const l=state.leads.find(x=>x.id===id); if(!l)return; clearLeadForm(); $('leadEditId').value=l.id; $('leadProspectId').value=l.prospect_id||''; $('leadDialogTitle').textContent='Lead Details'; $('saveLeadBtn').textContent='Save Changes'; $('leadNumber').value=l.lead_number||''; $('leadSource').value=l.source||'Other'; toggleAngiFields('lead'); $('leadSourceAccount').value=l.source_account||''; $('leadSourceRef').value=l.source_reference||''; $('leadFirstName').value=l.first_name||''; $('leadLastName').value=l.last_name||''; $('leadStreet').value=l.street_address||''; $('leadCity').value=l.city||''; $('leadState').value=l.state||'SC'; $('leadZip').value=l.zip||''; $('leadPhone').value=l.phone||''; $('leadEmail').value=l.email||''; $('leadWorkCategory').value=l.work_category||'Roofing'; $('leadAssignedTo').value=l.assigned_to||'Roy'; $('leadStatus').value=l.lead_status||'Appointment Wanted'; $('leadEstimateStatus').value=l.estimate_status||'Not Known'; $('leadEstimateNote').value=l.estimate_issue_note||''; $('leadNotes').value=l.notes||''; const a=state.appointments.filter(a=>activeRow(a)&&a.lead_id===l.id).sort((a,b)=>String(b.appointment_at||'').localeCompare(String(a.appointment_at||'')))[0]; if(a){$('leadAppointmentDate').value=datePart(a.appointment_at); $('leadAppointmentTime').value=timePart(a.appointment_at); $('leadMarketSharpStatus').value=a.marketsharp_status||'Not Needed Yet';} $('leadDialog').showModal(); }
async function saveLead() {
  try {
    const editId=$('leadEditId').value;
    if(editId){
      const first=$('leadFirstName').value.trim(), last=$('leadLastName').value.trim();
      const patch={lead_number:$('leadNumber').value.trim()||null,source:$('leadSource').value,source_account:$('leadSource').value==='Angi'?($('leadSourceAccount').value||null):null,source_reference:$('leadSourceRef').value.trim()||null,homeowner_name:[first,last].filter(Boolean).join(' '),first_name:first,last_name:last,street_address:$('leadStreet').value.trim(),city:$('leadCity').value.trim(),state:$('leadState').value.trim(),zip:$('leadZip').value.trim(),phone:$('leadPhone').value.trim(),email:$('leadEmail').value.trim(),work_category:$('leadWorkCategory').value,lead_status:$('leadStatus').value,assigned_to:$('leadAssignedTo').value,estimate_status:$('leadEstimateStatus').value,estimate_issue_note:$('leadEstimateNote').value.trim(),notes:$('leadNotes').value.trim()};
      await updateRecord('leads',editId,patch,'Lead changes undone.');
      const appointment=state.appointments.filter(a=>activeRow(a)&&a.lead_id===editId).sort((a,b)=>String(b.appointment_at||'').localeCompare(String(a.appointment_at||'')))[0];
      if(appointment && $('leadAppointmentDate').value){ const at=new Date(`${$('leadAppointmentDate').value}T${$('leadAppointmentTime').value||'12:00'}`).toISOString(); await updateRecord('appointments',appointment.id,{appointment_at:at,marketsharp_status:$('leadMarketSharpStatus').value,assigned_to:$('leadAssignedTo').value},'Appointment changes undone.'); }
      $('leadDialog').close(); await loadAll(); msg('Lead updated.','success'); return;
    }
    // Existing Phase 1 create/promote behavior follows for new leads.
    const first=$('leadFirstName').value.trim(), last=$('leadLastName').value.trim(), leadNumber=$('leadNumber').value.trim(), prospectId=$('leadProspectId').value||null;
    if(!first&&!last&&!$('leadPhone').value.trim())return msg('Enter at least a homeowner name or phone number.','error');
    const row={prospect_id:prospectId,lead_number:leadNumber||null,source:$('leadSource').value,source_account:$('leadSource').value==='Angi'?($('leadSourceAccount').value||null):null,source_reference:$('leadSourceRef').value.trim()||null,import_source:'Manual',homeowner_name:[first,last].filter(Boolean).join(' '),first_name:first,last_name:last,street_address:$('leadStreet').value.trim(),city:$('leadCity').value.trim(),state:$('leadState').value.trim(),zip:$('leadZip').value.trim(),phone:$('leadPhone').value.trim(),email:$('leadEmail').value.trim(),work_category:$('leadWorkCategory').value,lead_status:$('leadStatus').value,assigned_to:$('leadAssignedTo').value,estimate_status:$('leadEstimateStatus').value,estimate_issue_note:$('leadEstimateNote').value.trim(),notes:$('leadNotes').value.trim()};
    const r=await db.from('leads').insert(row).select().single(); if(r.error)throw r.error; let appointmentId=null; let prospectBefore=null;
    if(prospectId){ prospectBefore=state.prospects.find(p=>p.id===prospectId)||null; const u=await db.from('prospects').update({converted_to_lead_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',prospectId).select().single(); if(u.error)throw u.error; }
    if($('leadAppointmentDate').value){ const at=new Date(`${$('leadAppointmentDate').value}T${$('leadAppointmentTime').value||'12:00'}`).toISOString(); const a=await db.from('appointments').insert({lead_id:r.data.id,prospect_id:prospectId,appointment_at:at,appointment_status:'Scheduled',assigned_to:$('leadAssignedTo').value,marketsharp_status:$('leadMarketSharpStatus').value,google_calendar_status:'Not Added'}).select().single(); if(a.error)throw a.error; appointmentId=a.data.id; }
    if(prospectId){ await db.from('undo_history').insert({action_type:'promote_prospect',entity_type:'prospects',entity_id:prospectId,description:'Prospect promotion undone.',payload:{prospect_before:prospectBefore,lead_id:r.data.id,appointment_id:appointmentId}}); } else { await db.from('undo_history').insert({action_type:'create',entity_type:'leads',entity_id:r.data.id,description:'New lead removed.',payload:{}}); }
    $('leadDialog').close(); await loadAll(); msg('Lead saved.','success');
  } catch(error){msg('Could not save lead: '+(error.message||String(error)),'error');}
}

function clearJobForm(){ ['jobEditId','jobCustomer','jobLead','jobNumber','jobAddress','jobSalesperson','jobTarget','jobConfirmed','jobNotes'].forEach(id=>{if($(id))$(id).value='';}); $('jobStage').value='Sold'; $('jobDialogTitle').textContent='New Job'; $('saveJobBtn').textContent='Save'; }
function openJobEdit(id){ const j=state.jobs.find(x=>x.id===id); if(!j)return; clearJobForm(); $('jobEditId').value=j.id; $('jobCustomer').value=j.customer_name||''; $('jobLead').value=j.lead_number||''; $('jobNumber').value=j.job_number||''; $('jobAddress').value=j.property_address||''; $('jobSalesperson').value=j.salesperson||''; $('jobStage').value=j.stage||'Sold'; $('jobTarget').value=j.target_start_date||''; $('jobConfirmed').value=j.confirmed_start_date||''; $('jobNotes').value=j.production_notes||''; $('jobDialogTitle').textContent='Job Details'; $('saveJobBtn').textContent='Save Changes'; $('jobDialog').showModal(); }
async function saveJob(){ try{ const id=$('jobEditId').value; const customer=$('jobCustomer').value.trim(); if(!customer)return msg('Customer name is required.','error'); const row={customer_name:customer,lead_number:$('jobLead').value.trim(),job_number:$('jobNumber').value.trim(),property_address:$('jobAddress').value.trim(),salesperson:$('jobSalesperson').value.trim(),stage:$('jobStage').value,target_start_date:$('jobTarget').value||null,confirmed_start_date:$('jobConfirmed').value||null,production_notes:$('jobNotes').value.trim()}; if(id){await updateRecord('jobs',id,row,'Job changes undone.');} else {const r=await db.from('jobs').insert(row).select().single(); if(r.error)throw r.error; await db.from('undo_history').insert({action_type:'create',entity_type:'jobs',entity_id:r.data.id,description:'New job removed.',payload:{}});} $('jobDialog').close(); clearJobForm(); await loadAll(); msg(id?'Job updated.':'Job created.','success'); } catch(error){msg(error.message||String(error),'error');} }

function openAppointmentEdit(id){ const a=state.appointments.find(x=>x.id===id); if(!a)return; $('appointmentEditId').value=a.id; $('appointmentEditDate').value=datePart(a.appointment_at); $('appointmentEditTime').value=timePart(a.appointment_at); $('appointmentEditStatus').value=a.appointment_status||'Scheduled'; $('appointmentEditAssigned').value=a.assigned_to||''; $('appointmentEditMarketSharp').value=a.marketsharp_status||'Not Needed Yet'; $('appointmentEditCalendar').value=a.google_calendar_status||'Not Added'; $('appointmentEditNotes').value=a.notes||''; $('appointmentDialog').showModal(); }
async function saveAppointmentEdit(){ try{ const id=$('appointmentEditId').value; if(!id)return; const at=$('appointmentEditDate').value?new Date(`${$('appointmentEditDate').value}T${$('appointmentEditTime').value||'12:00'}`).toISOString():null; await updateRecord('appointments',id,{appointment_at:at,appointment_status:$('appointmentEditStatus').value,assigned_to:$('appointmentEditAssigned').value.trim(),marketsharp_status:$('appointmentEditMarketSharp').value,google_calendar_status:$('appointmentEditCalendar').value,notes:$('appointmentEditNotes').value.trim()},'Appointment changes undone.'); $('appointmentDialog').close(); await loadAll(); msg('Appointment updated.','success'); }catch(error){msg(error.message||String(error),'error');} }

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

async function taskAction(id,action){
  const task=state.tasks.find(x=>x.id===id); if(!task)return; let note='';
  if(action==='block') note=prompt('Why is this task blocked?')||'';
  if(action==='skip'){ if(!task.recurring_rule_id){msg('Only recurring task occurrences can be skipped.','error');return;} note=prompt('Optional: why are you skipping this occurrence?')||''; }
  const other=currentTask();
  const snapshot={...task}; const otherSnapshot=(other&&other.id!==id&&(action==='start'||action==='resume'))?{...other}:null;
  const {data,error}=await db.rpc('task_action',{p_task_id:id,p_action:action,p_note:note});
  if(error){msg('Could not save task change: '+error.message,'error');await loadAll();return;}
  await db.from('undo_history').insert({action_type:'task_action',entity_type:'tasks',entity_id:id,description:`Task ${action} undone.`,payload:{before:snapshot,other_task_before:otherSnapshot}});
  await loadAll();
}

async function loadAll(){
  const calls=[['tasks','created_at',false],['jobs','updated_at',false],['communications','due_date',true],['incoming','captured_at',false],['phone_messages','created_at',false],['prospects','created_at',false],['leads','created_at',false],['appointments','appointment_at',true],['sales_communications','occurred_at',false],['job_communications','occurred_at',false],['lookup_options','sort_order',true],['sops','title',true],['suggestions','created_at',false]];
  const results=await Promise.all(calls.map(([table,order,ascending])=>db.from(table).select('*').order(order,{ascending}).limit(500)));
  for(let i=0;i<results.length;i++){ if(results[i].error)throw results[i].error; let stateName=calls[i][0]==='phone_messages'?'phone':calls[i][0]; if(stateName==='lookup_options')stateName='lookups'; state[stateName]=results[i].data||[]; }
  setupLeadProspectSelects(); renderDashboard(); renderProspectsLeads();
}

// Additional click handling for editing and record safety actions.
document.body.addEventListener('click', async event => {
  try {
    const editTask=event.target.closest('[data-edit-task]'); if(editTask){openTaskEdit(editTask.dataset.editTask);return;}
    const editPhone=event.target.closest('[data-edit-phone]'); if(editPhone){openPhoneEdit(editPhone.dataset.editPhone);return;}
    const editIncoming=event.target.closest('[data-edit-incoming]'); if(editIncoming){openIncomingEdit(editIncoming.dataset.editIncoming);return;}
    const editProspect=event.target.closest('[data-edit-prospect]'); if(editProspect){openProspectDialog(state.prospects.find(p=>p.id===editProspect.dataset.editProspect));return;}
    const editLead=event.target.closest('[data-edit-lead]'); if(editLead){openLeadEdit(editLead.dataset.editLead);return;}
    const editJob=event.target.closest('[data-edit-job]'); if(editJob){openJobEdit(editJob.dataset.editJob);return;}
    const editAppt=event.target.closest('[data-edit-appointment]'); if(editAppt){openAppointmentEdit(editAppt.dataset.editAppointment);return;}
    const logComm=event.target.closest('[data-log-communication]'); if(logComm){openCommunicationDialog(logComm.dataset.logCommunication,logComm.dataset.contactId);return;}
    const action=event.target.closest('[data-record-action]');
    if(action){ const table=action.dataset.recordTable,id=action.dataset.recordId,verb=action.dataset.recordAction; const result=await recordAction(table,id,verb,`${verb.charAt(0).toUpperCase()+verb.slice(1)} ${table.replace('_',' ')} undone.`); if(result){await loadAll();msg(verb==='delete'?'Deleted. Undo is available.':verb==='archive'?'Archived.':'Restored.','success');} return;}
  } catch(error){msg(error.message||String(error),'error');}
});

$('undoBtn').onclick=undoLastAction;
$('cancelPhoneEditBtn').onclick=clearPhoneForm;
$('cancelIncomingEditBtn').onclick=clearIncomingForm;
$('saveAppointmentEditBtn').onclick=saveAppointmentEdit;
$('saveCommunicationBtn').onclick=saveCommunication;
$('newTaskBtn').onclick=()=>{clearTaskForm();$('taskDialog').showModal();};
$('newProspectBtn').onclick=()=>openProspectDialog();
$('newLeadBtn').onclick=()=>{clearLeadForm();openLeadDialog();};
$('newJobBtn').onclick=()=>{clearJobForm();$('jobDialog').showModal();};


init();
