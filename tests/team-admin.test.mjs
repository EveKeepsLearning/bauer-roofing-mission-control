import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
let handler;
let calls=[];
let actor={email:'evebauer@bauerroofs.com',email_confirmed_at:'2026-09-12'};
let authStatus=200;
let createStatus=200;
const code=stripTypeScriptTypes(fs.readFileSync(new URL('../supabase/functions/bro-team-admin/index.ts',import.meta.url),'utf8')).replace('export async function handler','async function handler');
vm.runInNewContext(code,{
 Deno:{env:{get:name=>name==='SUPABASE_URL'?'https://test.invalid':'TEST_KEY'},serve:fn=>handler=fn},
 Request,Response,crypto,
 fetch:async(url,options)=>{calls.push({url,options});if(url.includes('/admin/users?page='))return new Response(JSON.stringify({users:[{id:'jonathan-id',email:'jbauer@bauerroofs.com'}]}));return new Response(JSON.stringify(url.endsWith('/user')?actor:createStatus===200?{id:'test-user'}:{msg:'Account already exists'}),{status:url.endsWith('/user')?authStatus:createStatus});}
});
const request=(body,token='test')=>new Request('https://example.invalid',{method:'POST',headers:token?{authorization:'Bearer '+token}:{},body:JSON.stringify(body)});
assert.equal((await handler(request({},''))).status,401);assert.equal(calls.length,0);
authStatus=401;assert.equal((await handler(request({}))).status,401);authStatus=200;
actor.email='rbauer@bauerroofs.com';assert.equal((await handler(request({action:'create_test',email:'jbauer@bauerroofs.com'}))).status,403);
actor.email='evebauer@bauerroofs.com';actor.email_confirmed_at=null;assert.equal((await handler(request({}))).status,403);actor.email_confirmed_at='2026-09-12';
assert.equal((await handler(request({action:'create_test',email:'outsider@example.invalid'}))).status,400);
for(const email of ['jbauer@bauerroofs.com','rbauer@bauerroofs.com']){
 const res=await handler(request({action:'create_test',email}));assert.equal(res.status,200);
 const data=await res.json();assert.equal(data.email,email);assert.ok(data.password.length>=28);
 assert.equal(res.headers.get('cache-control'),'no-store');
 const payload=JSON.parse(calls.at(-1).options.body);assert.equal(payload.email,email);assert.equal(payload.password,data.password);
}
createStatus=422;const existing=await handler(request({action:'create_test',email:'rbauer@bauerroofs.com'}));assert.equal(existing.status,422);assert.equal((await existing.json()).password,undefined);
assert.ok(calls.filter(x=>!x.url.endsWith('/user')).every(x=>x.options.method==='POST'&&x.url.endsWith('/admin/users')));
createStatus=200;
let custom=await handler(request({action:'create_test',email:'rbauer@bauerroofs.com',password:'Chosen test password 123!'}));
assert.equal(custom.status,200);assert.equal(JSON.parse(calls.at(-1).options.body).password,'Chosen test password 123!');
assert.equal((await handler(request({action:'set_password',email:'jbauer@bauerroofs.com',password:''}))).status,400);
assert.equal((await handler(request({action:'set_password',email:'jbauer@bauerroofs.com',password:'short'}))).status,400);
assert.equal((await handler(request({action:'set_password',email:'outsider@example.invalid',password:'Chosen test password 123!'}))).status,400);
actor.email='jbauer@bauerroofs.com';assert.equal((await handler(request({action:'set_password',email:'rbauer@bauerroofs.com',password:'Chosen test password 123!'}))).status,403);actor.email='evebauer@bauerroofs.com';
const changed=await handler(request({action:'set_password',email:'jbauer@bauerroofs.com',password:'Chosen test password 123!'}));
assert.equal(changed.status,200);assert.equal(calls.at(-1).options.method,'PUT');assert.ok(calls.at(-1).url.endsWith('/jonathan-id'));assert.equal((await changed.json()).password,undefined);
assert.equal((await handler(request({action:'set_password',email:'rbauer@bauerroofs.com',password:'Chosen test password 123!'}))).status,404);
console.log('PASS: chosen initial password, explicit existing password update, short/missing password validation, admin and target restrictions;  missing/invalid auth, wrong admin, unconfirmed admin, target allowlist, initial passwords, no-store, and no existing-password overwrite');
