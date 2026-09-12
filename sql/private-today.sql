-- Personal work remains personal even inside the shared business workspace.
drop policy if exists bro_team_tasks on public.tasks;
create policy tasks_personal_only on public.tasks as restrictive for all to authenticated
using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy notes_personal_only on public.quick_notes as restrictive for all to authenticated
using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

update bro_private.team_access set display_name='Jonathan' where email='jbauer@bauerroofs.com';

-- Only confirmed, active teammates in the caller's workspace appear as recipients.
create function bro_private.message_members()
returns table(user_id uuid, display_name text)
language sql stable security definer set search_path=''
as $$
 select u.id,t.display_name from bro_private.team_access t
 join auth.users u on lower(u.email)=t.email
 where t.active and u.email_confirmed_at is not null
 and (u.banned_until is null or u.banned_until < now())
 and exists (
   select 1 from bro_private.team_access me join auth.users caller on lower(caller.email)=me.email
   where caller.id=auth.uid() and me.active and me.workspace_owner=t.workspace_owner
   and caller.email_confirmed_at is not null
   and (caller.banned_until is null or caller.banned_until < now())
 );
$$;
revoke all on function bro_private.message_members() from public,anon;
grant execute on function bro_private.message_members() to authenticated;
create function public.bro_message_recipients()
returns table(user_id uuid, display_name text)
language sql stable security invoker set search_path=''
as $$ select * from bro_private.message_members() order by display_name $$;
revoke all on function public.bro_message_recipients() from public,anon;
grant execute on function public.bro_message_recipients() to authenticated;

create table public.team_messages (
 id uuid primary key default gen_random_uuid(),
 sender_id uuid not null default auth.uid() references auth.users(id),
 recipient_id uuid not null references auth.users(id),
 body text not null check (length(trim(body)) between 1 and 4000),
 created_at timestamptz not null default now(),
 read_at timestamptz,
 check (sender_id <> recipient_id)
);
alter table public.team_messages enable row level security;
revoke all on public.team_messages from public,anon,authenticated;
grant select on public.team_messages to authenticated;
grant insert (recipient_id,body) on public.team_messages to authenticated;
grant update (read_at) on public.team_messages to authenticated;
create index team_messages_recipient_date on public.team_messages(recipient_id,created_at desc);
create index team_messages_sender_date on public.team_messages(sender_id,created_at desc);
create policy message_participants_read on public.team_messages for select to authenticated
using (sender_id=(select auth.uid()) or recipient_id=(select auth.uid()));
create policy message_teammates_send on public.team_messages for insert to authenticated
with check (sender_id=(select auth.uid()) and recipient_id in (select user_id from bro_private.message_members()));
create policy message_recipient_read_receipt on public.team_messages for update to authenticated
using (recipient_id=(select auth.uid())) with check (recipient_id=(select auth.uid()));
