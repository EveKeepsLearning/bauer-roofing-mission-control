const fs=require('node:fs');
const assert=require('node:assert/strict');

const calendar=fs.readFileSync('calendar.js','utf8');

assert.match(calendar,/from\('appointments'\)\.select\('\*'\)\.gte\('appointment_at'/,'BRO calendar must load saved BRO appointments directly, not only Google snapshots');
assert.match(calendar,/bro_calendar_source:'BRO'/,'BRO-only appointments must be represented distinctly on the calendar');
assert.match(calendar,/BRO only/,'BRO-only appointments should be visibly identifiable before Google sync');
assert.match(calendar,/normalizeGoogleId\(a\.google_calendar_event_id\)/,'linked Google events must be de-duplicated against the BRO appointment');
assert.match(calendar,/BRO Calendar',e\.bro_calendar_source==='BRO'\?'Not added yet'/,'appointment details must show whether Google sync has happened');
assert.match(calendar,/const map=\{'angi ads':'AA'.*'referral':'Ref'.*'homeadvisor \(angi leads\)':'HA'/s,'BRO calendar title formatting should preserve the Bauer Google Calendar source codes');
assert.match(calendar,/if\(key\.includes\('repair'\)\)return'F'/,'repair appointment code should remain F');
assert.match(calendar,/if\(key\.includes\('measure'\)\)return'M'/,'measure appointment code should remain M');

console.log('PASS: BRO calendar shows saved appointments immediately and preserves Bauer Google formatting.');
