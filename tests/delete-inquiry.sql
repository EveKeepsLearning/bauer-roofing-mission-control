begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','256b9356-8bab-42e1-9b65-314075f8426c',true);
do $$
declare sample public.leads; deleted uuid; blocked boolean:=false;
begin
 insert into public.leads(homeowner_name,lead_number,owner_id) values('BRO TEST rollback deletion','TEST-DELETE-ROLLBACK',auth.uid()) returning * into sample;
 begin
  perform public.bro_delete_inquiry(sample.id, sample.updated_at - interval '1 second');
 exception when others then
  if sqlerrm like 'This inquiry changed.%' then blocked:=true; else raise; end if;
 end;
 if not blocked then raise exception 'Stale delete was not blocked'; end if;
 perform public.bro_delete_inquiry(sample.id,sample.updated_at);
 if exists(select 1 from public.leads where id=sample.id) then raise exception 'Sample was not deleted'; end if;
 insert into public.leads(homeowner_name,lead_number,owner_id) values('BRO TEST rollback linked job','TEST-LINKED-ROLLBACK',auth.uid()) returning * into sample;
 insert into public.jobs(customer_name,lead_id,owner_id,stage) values('BRO TEST rollback linked job',sample.id,auth.uid(),'Awarded');
 blocked:=false;
 begin
  perform public.bro_delete_inquiry(sample.id,sample.updated_at);
 exception when others then
  if sqlerrm like 'This inquiry has linked jobs.%' then blocked:=true; else raise; end if;
 end;
 if not blocked then raise exception 'Linked job deletion was not blocked'; end if;
end $$;
rollback;
