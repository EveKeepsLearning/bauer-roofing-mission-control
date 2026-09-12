// Only verified Eve can create team logins or explicitly set a chosen password.
// Existing passwords are never retrieved; new initial passwords are returned only to Eve.
const origin = 'https://evekeepslearning.github.io';
const appUrl = origin + '/bauer-roofing-mission-control/index.html';
const members: Record<string,string> = {
  'jbauer@bauerroofs.com': 'Jonathan', 'rbauer@bauerroofs.com': 'Roy'
};
const headers = {'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
function respond(body: unknown, status=200) { return new Response(JSON.stringify(body), {status,headers}); }
export async function handler(req: Request) {
  if(req.method==='OPTIONS')return new Response('',{headers});
  if(req.method!=='POST')return respond({error:'POST required'},405);
  const url=Deno.env.get('SUPABASE_URL');
  const adminKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!adminKey)return respond({error:'Account service is not configured'},503);
  const authorization=req.headers.get('authorization')||'';
  if(!authorization.startsWith('Bearer '))return respond({error:'Sign in as Eve first'},401);
  // Validate the caller with Auth; never authorize on client-supplied user metadata.
  const auth=await fetch(url+'/auth/v1/user',{headers:{apikey:adminKey,Authorization:authorization}});
  if(!auth.ok)return respond({error:'Sign in as Eve first'},401);
  const actor=await auth.json();
  if(actor.email?.toLowerCase()!=='evebauer@bauerroofs.com'||!actor.email_confirmed_at)
    return respond({error:'Only Eve’s BRO work account can administer these accounts'},403);
  let body;
  try{body=await req.json();}catch{return respond({error:'Invalid request'},400);}
  const email=String(body.email||'').trim().toLowerCase();
  if(!members[email]||!['create_test','invite','set_password'].includes(body.action))return respond({error:'Choose Jonathan or Roy and a supported action'},400);
  const h={apikey:adminKey,Authorization:'Bearer '+adminKey,'Content-Type':'application/json'};
  const chosenPassword=typeof body.password==='string'?body.password:'';
  if((body.action==='set_password'||chosenPassword)&&chosenPassword.length<12)
    return respond({error:'Use at least 12 characters for a password you choose.'},400);
  if(chosenPassword.length>128)return respond({error:'Use no more than 128 characters.'},400);
  if(body.action==='set_password'){
    let target=null;
    for(let page=1;page<=100;page++){
      const listed=await fetch(url+'/auth/v1/admin/users?page='+page+'&per_page=100',{headers:h});
      if(!listed.ok)return respond({error:'Could not look up the account. No password was changed.'},502);
      const users=(await listed.json()).users||[];
      target=users.find((u:{email?:string})=>u.email?.toLowerCase()===email);
      if(target||users.length<100)break;
    }
    if(!target)return respond({error:'This account does not exist yet. Use Create login first.'},404);
    const changed=await fetch(url+'/auth/v1/admin/users/'+encodeURIComponent(target.id),{
      method:'PUT',headers:h,body:JSON.stringify({password:chosenPassword})
    });
    const result=await changed.json();
    if(!changed.ok)return respond({error:result.msg||result.message||'Password was not changed.'},changed.status);
    return respond({email,status:'Password updated. The account owner can change it anytime using Change my password.'});
  }
  if(body.action==='invite'){
    const result=await fetch(url+'/auth/v1/invite?redirect_to='+encodeURIComponent(appUrl+'?setup=password'),{
      method:'POST',headers:h,body:JSON.stringify({email,data:{bauer_team_member:members[email].toLowerCase()}})
    });
    const data=await result.json();
    if(!result.ok)return respond({error:data.msg||data.message||data.error_description||'Invitation was not sent. The account may already exist; use Set or reset password on BRO.'},result.status);
    return respond({email,status:'Invitation sent'});
  }
  const bytes=crypto.getRandomValues(new Uint8Array(24));
  const password=chosenPassword||'BRO!'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  const result=await fetch(url+'/auth/v1/admin/users',{
    method:'POST',headers:h,body:JSON.stringify({email,password,email_confirm:true,
      user_metadata:{bauer_team_member:members[email].toLowerCase()},
      app_metadata:{bro_initial_password:true}})
  });
  const data=await result.json();
  if(!result.ok)return respond({error:data.msg||data.message||data.error_description||'Account was not created. Existing accounts are never overwritten; use password reset instead.'},result.status);
  return respond({email,password,status:'Account created for testing. Save this initial password now; it is only displayed once. Have the account owner change it before regular use.'});
}
Deno.serve(handler);

