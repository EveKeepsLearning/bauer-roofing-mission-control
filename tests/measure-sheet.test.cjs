const fs=require('node:fs'),assert=require('node:assert/strict'),lib=require('pdf-lib'),fontkit=require('../vendor/fontkit-1.1.1.min.js');
const {build}=require('../measure-sheet-pdf');
(async()=>{
 const lead={lead_number:'TEST-0912',homeowner_name:'Sample Customer',spouse_name:'Sample Co-owner',inquiry_at:'2026-09-12T14:30:00Z',inquiry_taken_by:'Eve',street_address:'100 Sample Lane',city:'Columbia',state:'SC',zip:'29201',phone:'803-555-0100',phone_secondary:'803-555-0101',phone_secondary_label:'Spouse',email:'sample@example.com',insurance_related:true,insurance_company:'Sample Insurance',shingle_age:'15',desired_work_timing:'Within the next month',roof_layers:'2',current_leak:true,current_leak_location:'Near chimney',prior_leak:false,home_type:'2-story',roof_pitch:'Steep',payment_plan:'Cash',source:'Referral',referral_detail:'Previous customer',assigned_to:'Roy',notes:'NOT PRINTED - job work details',quoted_price:99999};
 const result=await build(fs.readFileSync('assets/measure-sheet-template.pdf'),lead,{},[{appointment_at:'2026-09-14T13:30:00Z',appointment_type:'Measure & Presentation',appointment_status:'Scheduled'}],lib,fs.readFileSync('assets/measure-sheet-font.ttf'),fontkit);
 assert.equal(result.pages,2);assert.equal(result.shortened.length,0);
 fs.writeFileSync('/tmp/filled-measure.pdf',result.bytes);
 const large=await build(fs.readFileSync('assets/measure-sheet-template.pdf'),{...lead,directions:'Long directions '.repeat(200)}, {},[],lib,fs.readFileSync('assets/measure-sheet-font.ttf'),fontkit);
 assert.equal(large.pages,2);assert(large.shortened.includes('Directions'));
 console.log('Two-page template, filled lead data, and long-field handling passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
