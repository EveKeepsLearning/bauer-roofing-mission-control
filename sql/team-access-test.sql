-- Run inside a transaction and always roll back. No real customers are edited.
create temporary table bro_test_ids(kind text primary key,id uuid) on commit drop;
insert into bro_test_ids values ('dad',gen_random_uuid()),('roy',gen_random_uuid()),('outsider',gen_random_uuid()),('contact',gen_random_uuid()),('job',gen_random_uuid()),('lead',gen_random_uuid()),('appointment',gen_random_uuid()),('task',gen_random_uuid()),('outsider_contact',gen_random_uuid());
grant select on bro_test_ids to authenticated;
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
select id,case kind when 'dad' then 'jbauer@bauerroofs.com' when 'roy' then 'rbauer@bauerroofs.com' else 'bro-isolation-test@example.invalid' end,now(),'{}','{}' from bro_test_ids where kind in ('dad','roy','outsider');
insert into public.contacts(id,owner_id,name) select id,(select workspace_owner from bro_private.team_access limit 1),'BRO temporary access test' from bro_test_ids where kind='contact';
insert into public.contacts(id,owner_id,name) select id,(select id from bro_test_ids where kind='outsider'),'BRO outsider test' from bro_test_ids where kind='outsider_contact';
insert into public.leads(id,owner_id,homeowner_name,contact_id) select id,(select workspace_owner from bro_private.team_access limit 1),'BRO temporary access test',(select id from bro_test_ids where kind='contact') from bro_test_ids where kind='lead';
insert into public.jobs(id,owner_id,customer_name,lead_id,customer_id) select id,(select workspace_owner from bro_private.team_access limit 1),'BRO temporary access test',(select id from bro_test_ids where kind='lead'),(select id from bro_test_ids where kind='contact') from bro_test_ids where kind='job';
insert into public.appointments(id,owner_id,lead_id) select id,(select workspace_owner from bro_private.team_access limit 1),(select id from bro_test_ids where kind='lead') from bro_test_ids where kind='appointment';
set local role authenticated;
do $$ declare member record; c uuid; n integer; result jsonb; workspace uuid; begin
 for member in select * from bro_test_ids where kind in ('dad','roy') loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub',member.id,'role','authenticated')::text,true);
  workspace:=bro_private.workspace_owner();
  if workspace=member.id or workspace is null then raise exception 'Team resolution failed for %',member.kind; end if;
  if not exists(select 1 from public.contacts where id=(select id from bro_test_ids where kind='contact')) then raise exception 'Shared contact not visible'; end if;
  if exists(select 1 from public.contacts where id=(select id from bro_test_ids where kind='outsider_contact')) then raise exception 'Other account data leaked'; end if;
  if not exists(select 1 from public.bauer_contact_search_advanced(p_name=>'BRO temporary access test')) then raise exception 'Contact search failed'; end if;
  update public.contacts set notes='Temporary edit test' where id=(select id from bro_test_ids where kind='contact');
  get diagnostics n=row_count; if n<>1 then raise exception 'Contact update failed'; end if;
  insert into public.contacts(name,owner_id) values ('BRO new shared contact test',member.id) returning id into c;
  if not exists(select 1 from public.contacts where id=c and owner_id=workspace) then raise exception 'New contact ownership failed'; end if;
  delete from public.contacts where id=c;
  get diagnostics n=row_count; if n<>1 then raise exception 'Contact delete failed'; end if;
  result:=public.bauer_update_record('leads',(select id from bro_test_ids where kind='lead'),'{"notes":"Temporary RPC edit"}'::jsonb);
  if result->>'notes'<>'Temporary RPC edit' then raise exception 'Inquiry RPC edit failed'; end if;
  if (result->>'owner_id')::uuid<>workspace then raise exception 'Editing changed ownership'; end if;
  perform public.bauer_update_record('jobs',(select id from bro_test_ids where kind='job'),'{"production_notes":"Temporary production edit"}'::jsonb);
  update public.jobs set stage='Scheduled',confirmed_start_date=current_date+3 where id=(select id from bro_test_ids where kind='job');
  get diagnostics n=row_count; if n<>1 then raise exception 'Job scheduling update failed'; end if;
  update public.appointments set appointment_result='Estimate needed' where id=(select id from bro_test_ids where kind='appointment');
  get diagnostics n=row_count; if n<>1 then raise exception 'Appointment update failed'; end if;
  result:=public.undo_last_action();
  if result->>'ok'<>'true' then raise exception 'Actor undo failed'; end if;
  if public.bootstrap_bauer_data()<>'Team workspace ready' then raise exception 'Team bootstrap failed'; end if;
 end loop;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',(select id from bro_test_ids where kind='outsider'),'role','authenticated')::text,true);
 if exists(select 1 from public.contacts where id=(select id from bro_test_ids where kind='contact')) then raise exception 'Outsider sees team contact'; end if;
 update public.jobs set production_notes='Should not happen' where id=(select id from bro_test_ids where kind='job');
 get diagnostics n=row_count; if n<>0 then raise exception 'Outsider can edit team job'; end if;
 begin
   perform public.bauer_update_record('leads',(select id from bro_test_ids where kind='lead'),'{"notes":"Should not happen"}'::jsonb);
   raise exception 'Outsider RPC unexpectedly succeeded';
 exception when raise_exception then
   if sqlerrm<>'Record not found.' then raise; end if;
 end;
end $$;
reset role;
select 'PASS: Dad/Roy shared search, create, edit, delete, job scheduling, appointment edits, actor undo and outsider isolation' as result;
