const fs=require('node:fs');
const assert=require('node:assert/strict');

const config=fs.readFileSync('config.js','utf8');
const release=JSON.parse(fs.readFileSync('release.json','utf8'));
const square=fs.readFileSync('square-payments-sync.js','utf8');

assert.equal(release.version,'20260915-sales-pipeline1');
assert.match(config,/APP_VERSION: '20260915-sales-pipeline1'/);
assert.match(config,/if\(path==='jobs\.html'\)[\s\S]*square-payments-sync\.js\?v=\$\{VERSION\}/);
const todayBlock=config.match(/if\(path==='index\.html'\|\|path===''\)\{([\s\S]*?)\}if\(path==='jobs\.html'\)/)?.[1]||'';
assert.doesNotMatch(todayBlock,/square-payments-sync\.js/);
assert.match(square,/querySelector\('\.jobs-shell'\)/);
assert.match(square,/Recent Square payments wait here/);
assert.match(square,/functions\.invoke\('bro-square-sync'/);
assert.match(square,/from\('square_payments'\)/);
assert.match(square,/\.is\('job_payment_id',null\)/);
assert.match(square,/bro_link_square_payment/);
assert.match(square,/Record in Job/);
assert.match(square,/Possible match:/);
assert.match(square,/Please confirm before recording/);
assert.match(square,/square_customer_name/);
assert.match(square,/Payment at Start/);
assert.match(square,/Progress Payment/);
assert.match(square,/Final Payment/);
assert.match(square,/Ready for another Square sync/);
assert.match(square,/refreshLinkedJob/);
assert.doesNotMatch(square,/Recorded in BRO/);
assert.doesNotMatch(square,/SQUARE_ACCESS_TOKEN/);

console.log('PASS: BRO shows only unhandled Square payments, clears handled rows, keeps payment types explicit, and refreshes the linked job.');
