const fs=require('node:fs');
const assert=require('node:assert/strict');

const html=fs.readFileSync('all-inquiries.html','utf8');
const js=fs.readFileSync('all-inquiries.js','utf8');

assert.match(html,/value="newest">Newest inquiry date first/);
assert.match(html,/value="oldest">Oldest inquiry date first/);
assert.match(html,/value="number_desc">Inquiry # — highest first/);
assert.match(html,/value="number_asc">Inquiry # — lowest first/);
assert.match(html,/MarketSharp records without a real inquiry date are shown without a date instead of using the import date/);
assert.match(js,/p_sort:\$\('sort'\)\.value/);

console.log('PASS: Inquiry directory exposes date and inquiry-number sorting and documents MarketSharp date handling.');
