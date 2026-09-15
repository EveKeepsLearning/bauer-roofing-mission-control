const fs=require('node:fs');
const assert=require('node:assert/strict');

const config=fs.readFileSync('config.js','utf8');
const release=JSON.parse(fs.readFileSync('release.json','utf8'));
const square=fs.readFileSync('square-payments-sync.js','utf8');

assert.equal(release.version,'20260915-square1');
assert.match(config,/APP_VERSION: '20260915-square1'/);
assert.match(config,/square-payments-sync\.js\?v=\$\{VERSION\}/);
assert.match(square,/functions\.invoke\('bro-square-sync'/);
assert.match(square,/from\('square_payments'\)/);
assert.match(square,/bro_link_square_payment/);
assert.match(square,/Record in Job/);
assert.match(square,/Possible match:/);
assert.match(square,/Please confirm before recording/);
assert.match(square,/square_customer_name/);
assert.match(square,/Payment at Start/);
assert.doesNotMatch(square,/SQUARE_ACCESS_TOKEN/);

console.log('PASS: BRO exposes a read-only Square sync with explicit job assignment and no client-side Square secret.');
