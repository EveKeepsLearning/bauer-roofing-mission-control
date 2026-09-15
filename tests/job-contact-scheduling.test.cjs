const fs=require('node:fs');
const assert=require('node:assert/strict');

const config=fs.readFileSync('config.js','utf8');
const feature=fs.readFileSync('jobs-contact-scheduling.js','utf8');

assert.match(config,/jobs-contact-scheduling\.js\?v=\$\{VERSION\}/);
assert.match(feature,/Customer Contact Information/);
assert.match(feature,/phone_secondary/);
assert.match(feature,/preferred_contact_method/);
assert.match(feature,/Open Contact/);
assert.match(feature,/Open Inquiry/);
assert.match(feature,/target_start_date/);
assert.match(feature,/stageRank\(priorStage\)<stageRank\('Scheduled'\)/);
assert.match(feature,/stage\.value='Scheduled'/);
assert.match(feature,/Expected Start/);
assert.match(feature,/added to Job Calendar/);
assert.match(feature,/filtered\(\)\.filter\(job=>sameDay\(job\.target_start_date,day\)\)/);

console.log('PASS: job contact details and expected-start scheduling automation are wired into Open Jobs.');
