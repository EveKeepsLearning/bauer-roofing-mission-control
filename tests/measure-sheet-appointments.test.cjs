const assert=require('node:assert/strict');
const {selectAppointments}=require('../measure-sheet-pdf');
const a=(id,at,type,status='Scheduled')=>({id,appointment_at:at,appointment_type:type,appointment_status:status});
const rows=[a('initial','2026-09-01T13:00Z','Measure & Presentation'),a('later','2026-09-09T14:00Z','Inspection'),a('proposal','2026-09-20T15:00Z','Deliver Proposal'),a('old-canceled','2026-08-01T13:00Z','Sales Appointment','Canceled'),a('superseded','2026-09-15T13:00Z','Presentation','Rescheduled')];
const r=selectAppointments(rows,Date.parse('2026-09-12T12:00Z'));assert.equal(r.measure.id,'initial');assert.equal(r.proposal.id,'proposal');
assert.equal(selectAppointments([rows[0]]).proposal,undefined);
assert.equal(selectAppointments([rows[2]]).measure,undefined);
console.log('Initial appointment and separately scheduled proposal selection passed.');
