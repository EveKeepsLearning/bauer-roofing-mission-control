const fs=require('node:fs');
const assert=require('node:assert/strict');

const config=fs.readFileSync('config.js','utf8');
const feature=fs.readFileSync('jobs-contact-scheduling.js','utf8');
const stage=fs.readFileSync('jobs-stage.js','utf8');
const guide=fs.readFileSync('guided-next-step.js','utf8');

assert.match(config,/jobs-contact-scheduling\.js\?v=\$\{VERSION\}/);
assert.match(feature,/Customer Contact Information/);
assert.match(feature,/phone_secondary/);
assert.match(feature,/preferred_contact_method/);
assert.match(feature,/Open Contact/);
assert.match(feature,/Open Inquiry/);
assert.match(feature,/target_start_date:expectedStart/);
assert.match(feature,/stageRank\(stage\)<stageRank\('Scheduled'\)/);
assert.match(feature,/stage='Scheduled'/);
assert.match(feature,/from\('jobs'\)\.update\(patch\)/);
assert.match(feature,/select\('\*'\)\.single\(\)/);
assert.match(feature,/Could not save job:/);
assert.match(feature,/Expected Start/);
assert.match(feature,/filtered\(\)\.filter\(job=>sameDay\(job\.target_start_date,day\)\)/);
assert.match(stage,/Schedule repair \/ order materials if needed/);
assert.match(guide,/Schedule Repair/);
assert.match(guide,/editExpectedStart/);

console.log('PASS: job contact details, single-write job saving, expected-start scheduling, and repair workflow shortcuts are wired into Open Jobs.');
