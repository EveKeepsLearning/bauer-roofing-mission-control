/* Account creation only runs after the administrator explicitly clicks a button. */
(async()=>{
 const cfg=window.BAUER_CONFIG||window.CONFIG||{};
 const db=supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
 const {data,error}=await db.auth.getUser();
 const identity=document.getElementById('identity');
 if(error||!data.user){identity.textContent='Sign in to BRO as evebauer@bauerroofs.com, then reopen this page.';return;}
 if(data.user.email?.toLowerCase()!=='evebauer@bauerroofs.com'){identity.textContent='This setup page is only available to Eve’s BRO work account.';return;}
 identity.textContent='Signed in as '+data.user.email;
 document.getElementById('setup').classList.remove('hidden');
 document.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',async()=>{
   const card=button.closest('.member'),email=card.dataset.email,action=button.dataset.action;
   if(!confirm(action==='create_test'?`Create ${email} with an initial password for testing? This will not email them.`:`Send a BRO invitation to ${email}?`))return;
   const output=card.querySelector('.result');
   card.querySelectorAll('button').forEach(b=>b.disabled=true);
   output.classList.remove('hidden');output.textContent='Working…';
   try{
     const {data:sessionData,error:sessionError}=await db.auth.getSession();
     if(sessionError||!sessionData.session)throw new Error('Your session expired. Sign in again.');
     const response=await fetch(cfg.SUPABASE_URL+'/functions/v1/bro-team-admin',{
       method:'POST',headers:{'Content-Type':'application/json',apikey:cfg.SUPABASE_ANON_KEY,Authorization:'Bearer '+sessionData.session.access_token},body:JSON.stringify({email,action})});
     const result=await response.json();
     if(!response.ok||result.error)throw new Error(result.error||result.message||'Account setup failed');
     output.textContent=result.status+(result.password?'\n\nEmail: '+result.email+'\nInitial password: '+result.password+'\n\nThis password is displayed only here. Save it before leaving this page.':'');
   }catch(error){output.textContent=error.message;card.querySelectorAll('button').forEach(b=>b.disabled=false);}
 }));
})();
