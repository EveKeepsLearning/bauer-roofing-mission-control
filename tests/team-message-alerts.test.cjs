const fs=require('node:fs');
const assert=require('node:assert/strict');

const config=fs.readFileSync('config.js','utf8');
const alerts=fs.readFileSync('team-message-alerts.js','utf8');
const release=JSON.parse(fs.readFileSync('release.json','utf8'));

assert.equal(release.version,'20260915-sales-pipeline1');
assert.match(config,/APP_VERSION: '20260915-sales-pipeline1'/);
assert.match(config,/team-message-alerts\.js\?v=\$\{VERSION\}/);
assert.match(alerts,/New Team Message/);
assert.match(alerts,/Read & Open Conversation/);
assert.match(alerts,/Mark Read/);
assert.match(alerts,/recipient_id',uid/);
assert.match(alerts,/read_at:new Date\(\)\.toISOString\(\)/);
assert.match(alerts,/setInterval\(\(\)=>\{bindAccount\(\);checkUnread\(\);\},5000\)/);
assert.match(alerts,/postgres_changes/);
assert.match(alerts,/dialog\.addEventListener\('cancel',e=>e\.preventDefault\(\)\)/);

console.log('PASS: team messages create unavoidable global pop-up alerts across BRO.');
