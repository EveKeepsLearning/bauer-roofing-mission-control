const fs=require('node:fs');
const assert=require('node:assert/strict');

const exists=path=>fs.existsSync(path);
const read=path=>fs.readFileSync(path,'utf8');

const release=JSON.parse(read('release.json')).version;
const config=read('config.js');
const appVersion=(config.match(/APP_VERSION:\s*'([^']+)'/)||[])[1];
assert.equal(appVersion,release,'config.js and release.json must use the same release version');

for(const path of [
  'angi-queue-import.js',
  'lifecycle-navigation.js',
  'calendar-sync-client.js',
  'calendar.js',
  'calendar-sync-recovery.js',
  'calendar-google-view.js',
  'sales-board.js',
  'jobs-rfp.js',
  'inquiry-number-suggestions.js',
  'jobs-active-load.js',
  'jobs-stage.js'
]) assert.ok(exists(path),`Missing authoritative module: ${path}`);

for(const path of [
  'bro-test',
  'angi-import-contact-fix.js',
  'angi-queue-import-rfp2.js',
  'lifecycle-navigation-rfp2.js',
  'calendar-sync-client-v2.js',
  'calendar-v3.js',
  'calendar-v4.js',
  'calendar-modern-links.js',
  'calendar-modern-match.js',
  'calendar-window-fix.js',
  'sales-board-v2.js',
  'sales-board-rfp2.js',
  'jobs-rfp2.js',
  'inquiry-number-suggestions-v2.js',
  'jobs-active-load-fix.js',
  'jobs-stage-fix.js'
]) assert.ok(!exists(path),`Obsolete compatibility file should not exist: ${path}`);

const runtimeFiles=['config.js','index.html','calendar.html','sales.html','jobs.html'];
const forbidden=[
  'calendar-sync-client-v2.js','calendar-v3.js','calendar-v4.js',
  'sales-board-v2.js','sales-board-rfp2.js','jobs-rfp2.js',
  'lifecycle-navigation-rfp2.js','jobs-active-load-fix.js','jobs-stage-fix.js',
  'inquiry-number-suggestions-v2.js','angi-import-contact-fix.js','angi-queue-import-rfp2.js'
];
for(const file of runtimeFiles){
  const text=read(file);
  for(const oldName of forbidden)assert.ok(!text.includes(oldName),`${file} still references ${oldName}`);
}

console.log('PASS: repository uses one release value and authoritative runtime module names.');
