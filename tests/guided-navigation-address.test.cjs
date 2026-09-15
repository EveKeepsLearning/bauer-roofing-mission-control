const fs=require('node:fs');
const assert=require('node:assert/strict');

const config=fs.readFileSync('config.js','utf8');
const maps=fs.readFileSync('google-address-autocomplete.js','utf8');
const guide=fs.readFileSync('guided-next-step.js','utf8');
const release=JSON.parse(fs.readFileSync('release.json','utf8'));

assert.equal(release.version,'20260915-sales-pipeline1');
assert.match(config,/APP_VERSION: '20260915-sales-pipeline1'/);
assert.match(config,/google-address-autocomplete\.js\?v=\$\{VERSION\}/);
assert.match(config,/guided-next-step\.js\?v=\$\{VERSION\}/);
assert.match(maps,/importLibrary\('places'\)/);
assert.match(maps,/PlaceAutocompleteElement/);
assert.match(maps,/includedPrimaryTypes:\['street_address'\]/);
assert.match(maps,/includedRegionCodes:\['US'\]/);
assert.match(maps,/gmp-select/);
assert.match(maps,/place\.fetchFields\(\{fields:\['addressComponents','formattedAddress'\]\}\)/);
assert.doesNotMatch(maps,/new google\.maps\.places\.Autocomplete/);
for(const id of ['address','newContactStreet','editContactStreet','inquiryAddress','ciStreet','ciMailStreet'])assert.match(maps,new RegExp(`['\"]${id}['\"]`));
assert.match(maps,/postal_code/);
assert.match(maps,/administrative_area_level_1/);
assert.match(maps,/syncManual/);
assert.match(guide,/Schedule Appointment/);
assert.match(guide,/Contract Signed — Create Job/);
assert.match(guide,/Record Deposit/);
assert.match(guide,/Schedule Repair/);
assert.match(guide,/Order materials only when this repair actually needs them/);

console.log('PASS: Places API New address autocomplete and guided next-step navigation are wired into BRO.');
