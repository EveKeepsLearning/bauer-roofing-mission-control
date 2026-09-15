const fs=require('node:fs');
const assert=require('node:assert/strict');

const app=fs.readFileSync('app.js','utf8');
const html=fs.readFileSync('index.html','utf8');

const loadStart=app.lastIndexOf('async function loadAll(');
const loadEnd=app.indexOf('// Additional click handling',loadStart);
const loader=app.slice(loadStart,loadEnd);
assert.match(loader,/const coreCalls=\[\['tasks'/,'The initial loader must define a lightweight core data set');
assert.match(loader,/const fullCalls=\[\['prospects'/,'CRM history must be separated from the Today data set');
assert.match(loader,/const calls=full\?\[\.\.\.coreCalls,\.\.\.fullCalls\]:coreCalls/,'Today must skip full CRM queries');
assert.match(loader,/if\(full\)\{\s*const relationshipResults=/,'Contact relationship tables must load only for full CRM views');
assert.match(loader,/if\(full\)\{try \{ await rollForwardMissedAngiCadence/,'Angi maintenance must not block Today');
assert.doesNotMatch(loader,/renderProspectsLeads\(\); renderAngiQueue\(\)/,'Hidden CRM views must not render unconditionally');

const dashboardStart=app.lastIndexOf('function renderDashboard()');
const dashboardEnd=app.indexOf('\nfunction renderRoyUpdates',dashboardStart);
const dashboard=app.slice(dashboardStart,dashboardEnd);
assert.doesNotMatch(dashboard,/renderPhone\(\); renderJobs\(\)/,'Today must not render hidden Phone and Jobs workspaces');
assert.match(app,/ensureFullDataForView\(name\)/,'Heavy data must load when a CRM workspace is opened');
assert.match(app,/db\.from\('leads'\)\.select\('\*'\)\.not\('prospect_id','is',null\)/,'Angi must load only inquiries linked to prospects');
assert.match(app,/db\.from\('appointments'\)\.select\('\*'\)\.not\('prospect_id','is',null\)/,'Angi must load only appointments linked to prospects');
assert.match(app,/if\(name==='angi'&&!angiDataLoaded\)/,'Angi must lazy-load its own small data set');
assert.match(html,/app\.js\?v=20260915-perf2/,'The optimized loader must be cache-busted');

console.log('PASS: Today defers CRM history and does not render hidden workspaces.');
