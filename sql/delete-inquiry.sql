-- Permanently remove a mistaken BRO inquiry, without cascading into appointments/jobs.
create or replace function public.bro_delete_inquiry(p_inquiry_id uuid, p_expected_updated_at timestamptz)
returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare item public.leads; remaining integer;
begin
  if auth.uid() is null then raise exception 'Sign in to delete an inquiry.'; end if;
  select * into item from public.leads where id=p_inquiry_id for update;
  if not found then raise exception 'Inquiry not found or you do not have access.'; end if;
  if item.updated_at is distinct from p_expected_updated_at then
    raise exception 'This inquiry changed. Refresh and review it before deleting.';
  end if;
  if exists(select 1 from public.jobs where lead_id=item.id) then
    raise exception 'This inquiry has linked jobs. Move those jobs to the correct inquiry or delete a mistaken job first.';
  end if;
  if exists(select 1 from public.appointments where lead_id=item.id) then
    raise exception 'This inquiry has appointments. Move them to the correct inquiry or remove mistaken appointments first.';
  end if;
  if exists(select 1 from public.roy_estimate_updates where lead_id=item.id) then
    raise exception 'This inquiry has estimate history. Keep the inquiry or move it to the correct contact.';
  end if;
  delete from public.leads where id=item.id;
  get diagnostics remaining = row_count;
  if remaining <> 1 then raise exception 'Inquiry was not deleted. Check your access and refresh.'; end if;
  return item.contact_id;
end;
$$;
revoke all on function public.bro_delete_inquiry(uuid,timestamptz) from public, anon;
grant execute on function public.bro_delete_inquiry(uuid,timestamptz) to authenticated;
