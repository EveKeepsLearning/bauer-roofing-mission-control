alter table public.team_messages add column reply_to uuid references public.team_messages(id);
create index team_messages_reply_to on public.team_messages(reply_to);
grant insert(reply_to) on public.team_messages to authenticated;
drop policy message_teammates_send on public.team_messages;
create policy message_teammates_send on public.team_messages for insert to authenticated
with check (sender_id=(select auth.uid()) and recipient_id in (select user_id from bro_private.message_members()));
create table public.team_message_dismissals(
 message_id uuid not null references public.team_messages(id) on delete cascade,
 user_id uuid not null default auth.uid() references auth.users(id),
 primary key(user_id,message_id)
);
alter table public.team_message_dismissals enable row level security;
revoke all on public.team_message_dismissals from public,anon,authenticated;
grant select on public.team_message_dismissals to authenticated;
grant insert(message_id) on public.team_message_dismissals to authenticated;
create policy own_dismissals_read on public.team_message_dismissals for select to authenticated using(user_id=(select auth.uid()));
create policy own_message_dismiss on public.team_message_dismissals for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.team_messages m where m.id=message_id and (m.sender_id=(select auth.uid()) or m.recipient_id=(select auth.uid()))));
create function bro_private.validate_message_reply() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.reply_to is not null and not exists(
  select 1 from public.team_messages original where original.id=new.reply_to and original.reply_to is null
  and ((original.sender_id=new.sender_id and original.recipient_id=new.recipient_id)
    or (original.sender_id=new.recipient_id and original.recipient_id=new.sender_id))
 ) then raise exception 'This conversation is not available to these participants.' using errcode='42501'; end if;
 return new;
end $$;
revoke all on function bro_private.validate_message_reply() from public,anon;
grant execute on function bro_private.validate_message_reply() to authenticated;
create trigger validate_message_reply before insert on public.team_messages for each row execute function bro_private.validate_message_reply();

create function public.bro_message_threads(p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path='' as $$
 with mine as materialized (
  select m.*,d.message_id is not null as hidden from public.team_messages m
  left join public.team_message_dismissals d on d.message_id=m.id and d.user_id=auth.uid()
  where m.sender_id=auth.uid() or m.recipient_id=auth.uid()
 ), threads as (
  select coalesce(reply_to,id) as root_id,max(created_at) as latest
  from mine group by coalesce(reply_to,id) having bool_or(not hidden)
 ), page as (
  select * from threads order by latest desc,root_id offset greatest(coalesce(p_offset,0),0) limit 20
 )
 select jsonb_build_object(
  'rows',coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at,m.id) from mine m join page p on p.root_id=coalesce(m.reply_to,m.id)),'[]'::jsonb),
  'has_more',(select count(*) from threads)>greatest(coalesce(p_offset,0),0)+20
 );
$$;
revoke all on function public.bro_message_threads(integer) from public,anon;
grant execute on function public.bro_message_threads(integer) to authenticated;
