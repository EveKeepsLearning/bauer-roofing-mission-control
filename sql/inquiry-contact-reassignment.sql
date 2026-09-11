
create or replace function public.bro_move_inquiry_contact(
 p_inquiry_id uuid, p_contact_id uuid, p_expected_updated_at timestamptz,
 p_job_ids uuid[] default '{}'
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare l public.leads%rowtype; c public.contacts%rowtype; n integer; wanted integer;
begin
 if auth.uid() is null then raise exception 'Sign in before moving an inquiry.'; end if;
 select * into l from public.leads where id=p_inquiry_id and owner_id=auth.uid() and deleted_at is null for update;
 if not found then raise exception 'Inquiry not found or not accessible.'; end if;
 if l.updated_at is distinct from p_expected_updated_at then raise exception 'Inquiry changed. Close this dialog, reload, and review again.'; end if;
 select * into c from public.contacts where id=p_contact_id and owner_id=auth.uid() for share;
 if not found then raise exception 'Target contact not found or not accessible.'; end if;
 if l.contact_id=c.id then raise exception 'This inquiry already belongs to that contact.'; end if;
 select count(distinct x) into wanted from unnest(coalesce(p_job_ids,'{}'::uuid[])) x;
 perform id from public.jobs where id=any(coalesce(p_job_ids,'{}'::uuid[])) and owner_id=auth.uid() and deleted_at is null and lead_id=l.id for update;
 get diagnostics n=row_count;
 if n<>wanted then raise exception 'A selected job is no longer linked to this inquiry or is not accessible. Review again.'; end if;
 update public.leads set contact_id=c.id,homeowner_name=c.name,phone=c.phone,email=c.email,updated_at=now() where id=l.id and owner_id=auth.uid();
 get diagnostics n=row_count;
 if n<>1 then raise exception 'Inquiry could not be moved.'; end if;
 update public.jobs set customer_id=c.id,customer_name=c.name,updated_at=now() where id=any(coalesce(p_job_ids,'{}'::uuid[])) and owner_id=auth.uid() and lead_id=l.id;
 get diagnostics n=row_count;
 if n<>wanted then raise exception 'Selected jobs could not be moved.'; end if;
 return jsonb_build_object('inquiry_id',l.id,'contact_id',c.id,'jobs_moved',n);
end;
$$;
revoke all on function public.bro_move_inquiry_contact(uuid,uuid,timestamptz,uuid[]) from public,anon;
grant execute on function public.bro_move_inquiry_contact(uuid,uuid,timestamptz,uuid[]) to authenticated;
