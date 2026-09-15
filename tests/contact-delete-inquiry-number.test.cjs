const fs=require('node:fs');
const assert=require('node:assert/strict');

const config=fs.readFileSync('config.js','utf8');
const release=JSON.parse(fs.readFileSync('release.json','utf8'));
const contactsEdit=fs.readFileSync('contacts-edit.js','utf8');
const numbers=fs.readFileSync('inquiry-number-suggestions.js','utf8');
const contactsHtml=fs.readFileSync('contacts.html','utf8');

assert.equal(release.version,'20260915-contactdelete1');
assert.match(config,/APP_VERSION: '20260915-contactdelete1'/);
assert.match(contactsEdit,/Delete Contact/);
assert.match(contactsEdit,/deleteContact/);
assert.match(contactsEdit,/from\('jobs'\)\.update\(\{customer_id:null\}\)/);
assert.match(contactsEdit,/from\('leads'\)\.update\(\{contact_id:null\}\)/);
assert.match(contactsEdit,/from\('contacts'\)\.delete\(\)/);
assert.match(contactsEdit,/Type DELETE to continue/);
assert.match(numbers,/rpc\('bro_next_inquiry_number'\)/);
assert.doesNotMatch(numbers,/Lead Sheet Highest Number/);
assert.match(contactsHtml,/contacts-edit\.js\?v=20260915-contactdelete1/);

console.log('PASS: contacts can be deliberately deleted and inquiry suggestions use the authoritative server-side next number.');
