const fs=require('node:fs');
const assert=require('node:assert/strict');

const app=fs.readFileSync('app.js','utf8');
const index=fs.readFileSync('index.html','utf8');
const contacts=fs.readFileSync('contacts-inquiry-type.js','utf8');
const contactsHtml=fs.readFileSync('contacts.html','utf8');

function functionBody(source,name,nextName){
  const start=source.lastIndexOf(`async function ${name}`);
  assert.notEqual(start,-1,`Missing ${name}`);
  const end=nextName?source.indexOf(`function ${nextName}`,start+1):source.length;
  return source.slice(start,end);
}

const notes=functionBody(app,'saveAngiWorkingNotes','recordAngiOutcome');
const outcome=functionBody(app,'recordAngiOutcome','openAngiAppointment');
assert.doesNotMatch(notes,/await loadAll\(\)/,'Saving Angi notes must not reload the full application');
assert.match(notes,/Object\.assign\(prospect, \{notes/,'Saving Angi notes must update local state');
assert.doesNotMatch(outcome,/await loadAll\(\)/,'Recording an Angi outcome must not reload the full application');
assert.match(outcome,/data\?\.prospect/,'Angi outcomes must use the updated prospect returned by Supabase');
assert.match(outcome,/sales_communications/,'Angi outcomes must refresh the one new communication locally');

assert.match(index,/id="saveLeadGoogleBtn"[^>]*>Save &amp; Add Appointment to Google Calendar/,'The main inquiry form must offer Google Calendar');
assert.match(app,/saveLeadGoogleBtn'\)\.onclick = \(\) => saveLead\(true\)/,'The Google action must explicitly request sync');
assert.match(app,/saveLeadBtn'\)\.onclick =\s*\(\) => saveLead\(false\)/,'The normal save action must not accidentally request sync');
assert.match(app,/BROCalendarSync\.syncAppointment\(savedAppointment\)/,'The main inquiry workflow must sync its saved appointment');
assert.match(app,/if\(appointment\)[\s\S]*else\{[\s\S]*appointments'\)\.insert/,'Editing an inquiry must create an appointment when none exists');

assert.match(contacts,/id="saveNewAppointmentGoogleBtn"/,'The Contacts inquiry workflow must offer Google Calendar');
assert.match(contacts,/saveAppointment\(true\)/,'The Contacts Google action must request sync');
assert.match(contacts,/pendingInquiry=\{data,c,appointment:null\}/,'The Contacts workflow must retain the saved appointment for safe retry');
assert.match(contacts,/google_calendar_status:'Not Added'/,'New Contacts appointments must start with an explicit Google status');
assert.match(contacts,/BROCalendarSync\.syncAppointment\(pendingInquiry\.appointment\)/,'Contacts appointments must use the shared Google sync client');

assert.match(index,/app\.js\?v=20260915-weekly-comm1/,'The main app must use the current cache-busted build');
assert.match(contactsHtml,/contacts-inquiry-type\.js\?v=20260915-angi-calendar1/,'Contacts must cache-bust the fix');

console.log('PASS: Angi actions stay local and inquiry appointments can be added to Google Calendar.');
