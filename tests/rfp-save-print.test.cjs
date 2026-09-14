const fs=require('node:fs');
const assert=require('node:assert/strict');

const editor=fs.readFileSync('jobs-payment-requests.js','utf8');
const printable=fs.readFileSync('payment-request-print.js','utf8');

assert.match(editor,/id="saveRfpBtn">Save &amp; Print</,'RFP editor should make Save & Print the primary action');
assert.match(editor,/id="saveRfpOnlyBtn">Save Only</,'RFP editor should preserve a save-without-print option');
assert.match(editor,/save\(true\)/,'Save & Print should invoke the print path');
assert.match(editor,/payment-request-print\.html\?id=.*&print=1/,'Save & Print should route directly to the printable RFP');
assert.match(printable,/autoPrint=params\.get\('print'\)==='1'/,'Printable RFP should recognize automatic printing');
assert.match(printable,/if\(autoPrint\)setTimeout\(\(\)=>window\.print\(\),250\)/,'Printable RFP should open the browser print dialog automatically');

console.log('PASS: RFP Save & Print is a one-step save-to-printer workflow with Save Only still available.');
