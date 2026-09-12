-- psql test parameters: workspace_owner_id, confirmed_teammate_id, unconfirmed_teammate_id.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',:'workspace_owner_id',true);
insert into public.improvement_ideas(scope,idea) values('bro','TEST-IDEAS-SHARED-ROLLBACK'),('business','TEST-IDEAS-PRIVATE-ROLLBACK');
select set_config('request.jwt.claim.sub',:'confirmed_teammate_id',true);
do $$
begin
 if exists(select 1 from public.improvement_ideas where idea='TEST-IDEAS-PRIVATE-ROLLBACK') then raise exception 'Private ideas leaked to Jonathan'; end if;
 if not exists(select 1 from public.improvement_ideas where idea='TEST-IDEAS-SHARED-ROLLBACK') then raise exception 'Jonathan cannot see shared ideas'; end if;
 update public.improvement_ideas set status='Planned' where idea='TEST-IDEAS-SHARED-ROLLBACK';
 if not found then raise exception 'Jonathan cannot update shared idea status'; end if;
end $$;
insert into public.improvement_ideas(scope,idea) values('bro','TEST-IDEAS-JONATHAN-ROLLBACK');
select set_config('request.jwt.claim.sub',:'unconfirmed_teammate_id',true);
do $$
begin
 if exists(select 1 from public.improvement_ideas where idea='TEST-IDEAS-PRIVATE-ROLLBACK') then raise exception 'Private ideas leaked to Roy'; end if;
 -- Roy's invitation is currently unconfirmed: no shared workspace access yet.
 if exists(select 1 from public.improvement_ideas where idea='TEST-IDEAS-JONATHAN-ROLLBACK') then raise exception 'Unconfirmed account gained shared access'; end if;
end $$;

select set_config('request.jwt.claim.sub',:'workspace_owner_id',true);
do $$
begin
 if (select count(*) from public.improvement_ideas where idea like 'TEST-IDEAS-%-ROLLBACK')<>3 then raise exception 'Eve cannot see intended ideas'; end if;
end $$;
rollback;
