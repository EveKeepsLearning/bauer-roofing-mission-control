const fs=require('node:fs');
const assert=require('node:assert/strict');

const config=fs.readFileSync('config.js','utf8');
const release=JSON.parse(fs.readFileSync('release.json','utf8'));
const contactsEdit=fs.readFileSync('contacts-edit.js','utf8');
const contactDelete=fs.readFileSync('contact-delete.js','utf8');
const numbers=fs.readFileSync('inquiry-number-suggestions.js','utf8');

assert.equal(release.version,'20260915-square1');
assert.match(config,/APP_VERSION: '20260915-square1'/);
assert.match(config,/contact-delete\.js\?v=\$\{VERSION\}/);
assert.match(contactsEdit,/Delete Contact/);
assert.match(contactDelete,/Delete Contact/);
assert.match(contactDelete,/from\('jobs'\)\.update\(\{customer_id:null\}\)/);
assert.match(contactDelete,/from\('leads'\)\.update\(\{contact_id:null\}\)/);
assert.match(contactDelete,/from\('contacts'\)\.delete\(\)/);
assert.match(contactDelete,/Type DELETE to continue/);
assert.match(contactDelete,/older than 10 years/);
assert.match(contactDelete,/Archived Inquiries/);
assert.match(contactDelete,/MarketSharp history/);
assert.match(numbers,/rpc\('bro_next_inquiry_number'\)/);
assert.doesNotMatch(numbers,/Lead Sheet Highest Number/);

console.log('PASS: contact deletion, inquiry numbering, and ten-year MarketSharp archive labels are wired into BRO.');
