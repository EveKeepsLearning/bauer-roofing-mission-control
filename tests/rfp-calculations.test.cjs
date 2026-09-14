const assert=require('node:assert/strict');
const math=require('../rfp-calculations.js');

const requests=[
  {id:'r1',requisition_number:1,retainage_percent:0,payment_date:'2026-09-01'},
  {id:'r2',requisition_number:2,retainage_percent:0,payment_date:'2026-09-10'}
];
const items=[
  {payment_request_id:'r1',sort_order:1,description:'23 sq roofing',contract_amount:1380,requested_amount:1380},
  {payment_request_id:'r1',sort_order:2,description:'40 LF boards',contract_amount:20,requested_amount:20},
  {payment_request_id:'r2',sort_order:1,description:'23 sq roofing',contract_amount:1880,requested_amount:500},
  {payment_request_id:'r2',sort_order:2,description:'Additional flashing',contract_amount:100,requested_amount:100}
];
const history=math.calculateHistory(requests,items);
assert.equal(history[0].totalWorkPerformed,1400);
assert.equal(history[0].previousPayments,0);
assert.equal(history[0].thisRequisition,1400);
assert.equal(history[1].totalWorkPerformed,2000);
assert.equal(history[1].previousPayments,1400);
assert.equal(history[1].thisRequisition,600);
assert.equal(history[1].contractTotal,2000);
assert.deepEqual(history[1].rows.map(r=>[r.description,r.work_performed_to_date]),[
  ['23 sq roofing',1880],['40 LF boards',20],['Additional flashing',100]
]);

const retainageHistory=math.calculateHistory([
  {id:'a',requisition_number:1,retainage_percent:10},
  {id:'b',requisition_number:2,retainage_percent:0},
  {id:'c',requisition_number:3,retainage_percent:0}
],[
  {payment_request_id:'a',description:'Work',requested_amount:100,contract_amount:300},
  {payment_request_id:'b',description:'Work',requested_amount:100,contract_amount:300},
  {payment_request_id:'c',description:'Work',requested_amount:100,contract_amount:300}
]);
assert.equal(retainageHistory[0].thisRequisition,90);
assert.equal(retainageHistory[1].previousPayments,90);
assert.equal(retainageHistory[1].thisRequisition,110);
assert.equal(retainageHistory[2].previousPayments,200,'Previous Payments must equal the actual prior RFP requisitions, not gross requests.');
assert.equal(retainageHistory[2].thisRequisition,100);
console.log('PASS: RFPs treat prior requisitions as paid and preserve cumulative work lines.');
