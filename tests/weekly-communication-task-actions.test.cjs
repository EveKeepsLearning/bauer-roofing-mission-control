const fs=require('node:fs');
const assert=require('node:assert/strict');

const app=fs.readFileSync('app.js','utf8');
const html=fs.readFileSync('index.html','utf8');

const cardStart=app.indexOf("if (entry.kind === 'job')");
const cardEnd=app.indexOf("const c = entry.item",cardStart);
const card=app.slice(cardStart,cardEnd);
assert.match(card,/data-edit-job="\$\{esc\(j\.id\)\}">Open Job</,'Weekly communication cards must open the exact job');
assert.match(card,/data-delete-job-communication-task="\$\{esc\(j\.id\)\}">Delete Task</,'Weekly communication cards must offer Delete Task');
assert.match(card,/data-job-contacted=/,'The existing customer-contact action must remain available');

const deleteStart=app.indexOf('async function deleteJobCommunicationTask');
const deleteEnd=app.indexOf('\nasync function loadAll',deleteStart);
const remove=app.slice(deleteStart,deleteEnd);
assert.match(remove,/client_communication_needed:false/,'Deleting the task must dismiss the current reminder');
assert.match(remove,/client_communication_due_date:nextDue/,'Deleting the task must retain the next weekly reminder');
assert.match(remove,/updateRecord\('jobs',jobId/,'Deleting the task must use the undoable job update path');
assert.match(remove,/The job will remain/,'The confirmation must make clear that the job is not deleted');

assert.match(app,/data-delete-job-communication-task[^\n]+deleteJobCommunicationTask/,'The Delete Task control must be wired to its handler');
assert.match(html,/app\.js\?v=20260915-perf2/,'The Today page must use the current cache-busted app');

console.log('PASS: weekly production communication cards open jobs and dismiss only the current reminder.');
