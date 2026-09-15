const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('app.js', 'utf8');
const usability = fs.readFileSync('bro-usability.js', 'utf8');
const ideas = fs.readFileSync('improvement-ideas.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');

for (const [name, source] of [['app.js', app], ['bro-usability.js', usability], ['improvement-ideas.js', ideas]]) {
  assert.match(source, /window\.__broSupabaseClient/, `${name} must reuse the shared browser client`);
}

assert.match(app, /const \[subtaskResult,royResult,dadResult\]=await Promise\.all/, 'secondary Today requests should run concurrently');
assert.match(index, /app\.js\?v=20260915-perf2/);
assert.match(index, /bro-usability\.js\?v=20260915-perf2/);
assert.match(index, /improvement-ideas\.js\?v=20260915-perf2/);

console.log('PASS: Today reuses one Supabase client and loads secondary data concurrently.');
