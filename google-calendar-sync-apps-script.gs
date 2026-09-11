const BRO_CALENDAR_ID = 'roybauer88@gmail.com';
const BRO_SECRET_PROPERTY = 'BRO_SYNC_SECRET';

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function secret_() {
  return String(PropertiesService.getScriptProperties().getProperty(BRO_SECRET_PROPERTY) || '').trim();
}

function requireSecret_(body) {
  const expected = secret_();
  const received = String(body && body.secret || '').trim();
  if (!expected) throw new Error('BRO_SYNC_SECRET is not configured in Apps Script Properties.');
  if (!received || received !== expected) throw new Error('Invalid BRO_SYNC_SECRET.');
}

function calendar_(calendarId) {
  const id = String(calendarId || BRO_CALENDAR_ID).trim();
  const cal = CalendarApp.getCalendarById(id);
  if (!cal) throw new Error('Calendar not found or not accessible: ' + id);
  return cal;
}

function normalizeEventId_(id) {
  return String(id || '').trim();
}

function findEventById_(cal, id) {
  if (!id) return null;
  const raw = normalizeEventId_(id);
  const variants = [raw];
  if (!/@google\.com$/i.test(raw)) variants.push(raw + '@google.com');
  for (const v of variants) {
    try {
      const e = cal.getEventById(v);
      if (e) return e;
    } catch (_) {}
  }
  return null;
}

function eventToRow_(event, calendarId) {
  return {
    google_event_id: event.getId(),
    google_calendar_id: calendarId,
    calendar_name: 'Bauer Roofing',
    summary: event.getTitle() || null,
    description: event.getDescription() || null,
    location_raw: event.getLocation() || null,
    start_at: event.getStartTime().toISOString(),
    end_at: event.getEndTime().toISOString(),
    color_id: null,
    raw_payload: {
      title: event.getTitle() || '',
      description: event.getDescription() || '',
      location: event.getLocation() || '',
      start: event.getStartTime().toISOString(),
      end: event.getEndTime().toISOString()
    }
  };
}

function listEvents_(body) {
  const calendarId = String(body.calendar_id || BRO_CALENDAR_ID).trim();
  const cal = calendar_(calendarId);
  const start = new Date(body.start_time);
  const end = new Date(body.end_time);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) throw new Error('Valid start_time and end_time are required for list.');
  const events = cal.getEvents(start, end).map(function(e) { return eventToRow_(e, calendarId); });
  return { ok: true, events: events };
}

function upsertEvent_(body) {
  const calendarId = String(body.calendar_id || BRO_CALENDAR_ID).trim();
  const cal = calendar_(calendarId);
  const start = new Date(body.start_time);
  if (isNaN(start.getTime())) throw new Error('Valid start_time is required.');
  const end = body.end_time ? new Date(body.end_time) : new Date(start.getTime() + 90 * 60 * 1000);
  if (isNaN(end.getTime())) throw new Error('Invalid end_time.');
  if (end <= start) throw new Error('end_time must be after start_time.');

  let event = findEventById_(cal, body.google_event_id);
  if (!event) {
    event = cal.createEvent(String(body.title || 'Bauer Roofing Appointment'), start, end, {
      description: buildDescription_(body),
      location: String(body.location || '')
    });
  } else {
    event.setTime(start, end);
    if (body.title != null) event.setTitle(String(body.title));
    if (body.location != null) event.setLocation(String(body.location));
    event.setDescription(buildDescription_(body));
  }

  return { ok: true, google_event_id: event.getId() };
}

function cancelEvent_(body) {
  const calendarId = String(body.calendar_id || BRO_CALENDAR_ID).trim();
  const cal = calendar_(calendarId);
  const event = findEventById_(cal, body.google_event_id);
  if (!event) return { ok: true, google_event_id: body.google_event_id || null, already_missing: true };
  const id = event.getId();
  event.deleteEvent();
  return { ok: true, google_event_id: id };
}

function buildDescription_(body) {
  const lines = [];
  if (body.appointment_id) lines.push('BRO_APPOINTMENT_ID: ' + body.appointment_id);
  if (body.lead_number) lines.push('Inquiry #: ' + body.lead_number);
  if (body.customer_name) lines.push('Customer: ' + body.customer_name);
  if (body.phone) lines.push('Phone: ' + body.phone);
  if (body.phone_secondary) lines.push('Secondary phone: ' + body.phone_secondary);
  if (body.email) lines.push('Email: ' + body.email);
  if (body.work_category) lines.push('Work: ' + body.work_category);
  if (body.source) lines.push('Source: ' + body.source);
  if (body.assigned_to) lines.push('Salesperson: ' + body.assigned_to);
  if (body.notes) lines.push('Notes: ' + body.notes);
  lines.push('Managed by Bauer Roofing Operations');
  return lines.join('\n');
}

function doPost(e) {
  try {
    const body = JSON.parse(e && e.postData && e.postData.contents || '{}');
    requireSecret_(body);
    const action = String(body.action || 'upsert').toLowerCase();
    let result;
    if (action === 'list') result = listEvents_(body);
    else if (action === 'upsert') result = upsertEvent_(body);
    else if (action === 'cancel' || action === 'delete') result = cancelEvent_(body);
    else throw new Error('Unknown action: ' + action);
    return json_(result);
  } catch (err) {
    return json_({ ok: false, error: err && err.message ? err.message : String(err) });
  }
}

function doGet() {
  return json_({ ok: true, service: 'Bauer Roofing Google Calendar Sync', calendar_id: BRO_CALENDAR_ID });
}
