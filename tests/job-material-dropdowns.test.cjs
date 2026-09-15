'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const feature=fs.readFileSync(path.join(root,'jobs-materials.js'),'utf8');
const config=fs.readFileSync(path.join(root,'config.js'),'utf8');
const release=JSON.parse(fs.readFileSync(path.join(root,'release.json'),'utf8'));

for(const value of ['LM30','LandMark','XT25','Timberline','Max-Rib','Heritage']){
  assert.ok(feature.includes(`'${value}'`),`missing material type ${value}`);
}
for(const value of ['Moire Black','Pewter','Weathered Wood','Burnt Sienna','Pewter Gray','Cedar Brown','Silver Birch','Charcoal','Brownwood','Timber Blend','Resawn Shake','Dove Gray','Virginia Slate','Onyx Black','Heather Blend']){
  assert.ok(feature.includes(`'${value}'`),`missing material color ${value}`);
}
assert.ok(!feature.includes("'???'"),'unknown source value should not be a dropdown option');
assert.match(feature,/material_type/);
assert.match(feature,/material_color/);
assert.match(config,/jobs-materials\.js\?v=\$\{VERSION\}/);
const appVersion=config.match(/APP_VERSION:\s*'([^']+)'/)?.[1];
assert.equal(appVersion,release.version,'config and release versions should match');
console.log('job material dropdown checks passed');
