const fs=require('node:fs');
const assert=require('node:assert/strict');

const editor=fs.readFileSync('jobs-payment-requests.js','utf8');
const printable=fs.readFileSync('payment-request-print.js','utf8');

assert.match(editor,/23 sq @ \$60\.0\/sq/,'RFP editor should teach the quantity @ rate entry pattern');
assert.match(editor,/parseWorkDescription/,'RFP editor should calculate amounts from the work description');
assert.match(editor,/contract\.value=calc\.amount\.toFixed\(2\)/,'Calculated work cost should fill Agreed amount');
assert.match(editor,/requested\.value=calc\.amount\.toFixed\(2\)/,'Calculated work cost should fill This request');

for(const phrase of [
  'REQUEST FOR PAYMENT',
  'Requisition No. (',
  'Mr. Bauer:',
  'This request for payment is for work performed on the above',
  'Original Contract Amount',
  'Approved Change Orders',
  'TOTAL REVISED CONTRACT',
  'Value of work performed to date',
  'WORK PERFORMED to DATE',
  'Amount Earned to Date',
  'Less Previous Payments',
  'AMOUNT of THIS REQUISITION',
  'RELEASE',
  'The Subontractor certifies that all materials, labor, and services furnished by him through the above period have been fully paid for',
  'This Release is given in order to induce payment of',
  'EXCEPTIONS ARE AS FOLLOWS:',
  'Contractor',
  'Title:',
  'Date:'
])assert.ok(printable.includes(phrase),`Printable RFP should preserve original wording: ${phrase}`);

console.log('PASS: RFP editor auto-calculates quantity @ rate and print form preserves the original Bauer wording.');
