const fs=require('node:fs');
const assert=require('node:assert/strict');

const active=fs.readFileSync('jobs-active-load.js','utf8');
const addendums=fs.readFileSync('jobs-addendums.js','utf8');
const html=fs.readFileSync('jobs.html','utf8');

assert.match(addendums,/window\.BRORefreshCardBalances=refreshCardBalances/,
  'The balance refresh must be available after Open Jobs loads its Supabase jobs');
assert.match(active,/jobs=res\.data\|\|\[\][\s\S]*await window\.BRORefreshCardBalances\(\)/,
  'Open Jobs must await balance refresh after replacing the active jobs array');
assert.match(active,/typeof window\.BRORefreshCardBalances==='function'[\s\S]*else renderAll\(\)/,
  'Open Jobs must retain a normal render fallback when the finance module is unavailable');
assert.match(html,/jobs-addendums\.js\?v=20260915-open-jobs-balances1/,
  'Open Jobs must cache-bust the balance calculator');
assert.match(html,/jobs-active-load\.js\?v=20260915-open-jobs-balances1/,
  'Open Jobs must cache-bust the active job loader');

console.log('PASS: Open Jobs refreshes card balances after its async job load.');
