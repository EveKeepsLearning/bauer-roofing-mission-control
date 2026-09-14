const fs=require('node:fs');
const assert=require('node:assert/strict');

const config=fs.readFileSync('config.js','utf8');
const maps=fs.readFileSync('google-address-autocomplete.js','utf8');
const guide=fs.readFileSync('guided-next-step.js','utf8');
const release=JSON.parse(fs.readFileSync('release.json','utf8'));

assert.equal(release.version,'20260914-guidedflow1');
assert.match(config,/APP_VERSION: '20260914-guidedflow1'/);
assert.match(config,/google-address-autocomplete\.js\?v=\$\{VERSION\}/);
assert.match(config,/guided-next-step\.js\?v=\$\{VERSION\}/);
assert.match(maps,/libraries=places/);
assert.match(maps,/componentRestrictions:\{country:'us'\}/);
for(const id of ['address','newContactStreet','editContactStreet','inquiryAddress','ciStreet','ciMailStreet'])assert.match(maps,new RegExp(`['\"]${id}['\"]`));
assert.match(maps,/postal_code/);
assert.match(maps,/administrative_area_level_1/);
assert.match(guide,/Schedule Appointment/);
assert.match(guide,/Contract Signed — Create Job/);
assert.match(guide,/Record Deposit/);
assert.match(guide,/Schedule Work/);

console.log('PASS: Google address autocomplete and guided next-step navigation are wired into BRO.');
