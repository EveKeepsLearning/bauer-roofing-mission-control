-- All fixtures, including messages, are rolled back. No real account is modified.
begin;
create temporary table personal_test_ids(kind text primary key,id uuid) on commit drop;
insert into personal_test_ids select kind,gen_random_uuid() from unnest(array['one','two','three','outsider','job','contact']) kind;
grant select on personal_test_ids to authenticated;
insert into auth.users(id,email,email_confirmed_at) select id,'bro-personal-test-'||kind||'@example.invalid',now() from personal_test_ids where kind in ('one','two','three','outsider');
insert into bro_private.team_access(email,workspace_owner,display_name) select 'bro-personal-test-'||kind||'@example.invalid',(select id from personal_test_ids where kind='one'),kind from personal_test_ids where kind in ('one','two','three');
insert into public.contacts(id,owner_id,name) select id,(select id from personal_test_ids where kind='one'),'Temporary privacy test' from personal_test_ids where kind='contact';
insert into public.jobs(id,owner_id,customer_name) select id,(select id from personal_test_ids where kind='one'),'Temporary privacy test' from personal_test_ids where kind='job';
set local role authenticated;
do $$ declare actor record; taskid uuid; otherid uuid; mid uuid; n int; begin
 for actor in select * from personal_test_ids where kind in ('one','two','three') loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor.id,'role','authenticated')::text,true);
  insert into public.tasks(task) values ('Temporary private task') returning id into taskid;
  insert into public.task_subtasks(task_id,title) values (taskid,'Temporary private subtask');
  insert into public.quick_notes(note) values ('Temporary private note');
  if exists(select 1 from public.tasks where owner_id<>actor.id) then raise exception 'Other tasks leaked'; end if;
  if exists(select 1 from public.quick_notes where owner_id<>actor.id) then raise exception 'Other notes leaked'; end if;
  if (select count(*) from public.task_subtasks)<>1 then raise exception 'Subtask isolation failed'; end if;
  update public.tasks set task='Edited private task' where id=taskid;
  get diagnostics n=row_count; if n<>1 then raise exception 'Own task edit failed'; end if;
  perform public.bauer_update_record('tasks',taskid,'{"notes":"Private RPC edit"}'::jsonb);
  if not exists(select 1 from public.contacts where id=(select id from personal_test_ids where kind='contact')) then raise exception 'Shared contacts broken'; end if;
  update public.jobs set stage='Scheduled',confirmed_start_date=current_date+3 where id=(select id from personal_test_ids where kind='job');
  get diagnostics n=row_count; if n<>1 then raise exception 'Shared job editing broken'; end if;
  select id into otherid from personal_test_ids where kind='one';
  if actor.id<>otherid then
    begin
      insert into public.tasks(owner_id,task) values(otherid,'Must fail');
      raise exception 'Cross-user task insert succeeded';
    exception when insufficient_privilege then null; end;
    update public.tasks set notes='Must not change' where owner_id=otherid;
    get diagnostics n=row_count; if n<>0 then raise exception 'Cross-user task edit succeeded'; end if;
    delete from public.quick_notes where owner_id=otherid;
    get diagnostics n=row_count; if n<>0 then raise exception 'Cross-user note delete succeeded'; end if;
  end if;
 end loop;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',(select id from personal_test_ids where kind='one'),'role','authenticated')::text,true);
 insert into public.team_messages(recipient_id,body) values((select id from personal_test_ids where kind='two'),'Temporary rollback-only message') returning id into mid;
 if (select count(*) from public.bro_message_recipients())<>3 then raise exception 'Recipient scope wrong'; end if;
 begin
  insert into public.team_messages(recipient_id,body) values((select id from personal_test_ids where kind='outsider'),'Must fail');
  raise exception 'Outsider message allowed';
 exception when insufficient_privilege then null; end;
 begin
  update public.team_messages set body='Tampering' where id=mid;
  raise exception 'Message tampering allowed';
 exception when insufficient_privilege then null; end;
 update public.team_messages set read_at=now() where id=mid;
 get diagnostics n=row_count; if n<>0 then raise exception 'Sender can mark recipient read'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',(select id from personal_test_ids where kind='two'),'role','authenticated')::text,true);
 if not exists(select 1 from public.team_messages where id=mid) then raise exception 'Recipient cannot read'; end if;
 update public.team_messages set read_at=now() where id=mid;
 get diagnostics n=row_count; if n<>1 then raise exception 'Read receipt failed'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',(select id from personal_test_ids where kind='three'),'role','authenticated')::text,true);
 if exists(select 1 from public.team_messages where id=mid) then raise exception 'Third teammate sees private message'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',(select id from personal_test_ids where kind='outsider'),'role','authenticated')::text,true);
 if exists(select 1 from public.bro_message_recipients()) or exists(select 1 from public.team_messages where id=mid) then raise exception 'Outsider visibility'; end if;
end $$;
reset role;
select 'PASS: private tasks, subtasks, notes, editing and RPCs; shared job scheduling; participant-only messages, recipient receipts, outsider rejection' as result;
rollback;
