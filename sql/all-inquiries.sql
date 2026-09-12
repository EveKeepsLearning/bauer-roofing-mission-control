-- Read-only directory: existing BRO inquiries, with existing caller RLS enforced.
create or replace function public.bro_search_inquiries(
 p_query text default '', p_status text default '', p_source text default '',
 p_from date default null, p_to date default null, p_archive text default 'all',
 p_sort text default 'newest', p_offset integer default 0, p_limit integer default 50
) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
with base as materialized (
 select l.id,l.contact_id,l.lead_number,
 coalesce(nullif(c.name,''),nullif(l.homeowner_name,''),'Unnamed contact') as customer_name,
 l.homeowner_name,
 concat_ws(', ',nullif(l.street_address,''),nullif(l.city,''),nullif(l.state,''),nullif(l.zip,'')) as address,
 coalesce(l.lead_date,(l.inquiry_at at time zone 'America/New_York')::date,
 (l.received_at at time zone 'America/New_York')::date,(l.created_at at time zone 'America/New_York')::date) as inquiry_date,
 coalesce(nullif(l.sales_stage,''),nullif(l.lead_status,''),nullif(l.status,''),'Not set') as inquiry_status,
 coalesce(l.source,'') as source,coalesce(nullif(l.product_interest,''),l.work_category,'') as interest,
 coalesce(nullif(l.assigned_to,''),l.salesperson,'') as assigned_to,l.archived_at,
 concat_ws(' ',l.lead_number,l.homeowner_name,c.name,l.first_name,l.last_name,l.spouse_name,
 l.street_address,l.city,l.state,l.zip,l.phone,l.phone_secondary,l.email,c.phone,c.email) as searchable
 from public.leads l left join public.contacts c on c.id=l.contact_id
 where l.deleted_at is null
), filtered as materialized (
 select * from base where
 (coalesce(trim(p_query),'')='' or position(lower(trim(p_query)) in lower(searchable))>0)
 and (coalesce(p_status,'')='' or inquiry_status=p_status)
 and (coalesce(p_source,'')='' or source=p_source)
 and (p_from is null or inquiry_date>=p_from) and (p_to is null or inquiry_date<=p_to)
 and (p_archive='all' or p_archive='archived' and archived_at is not null or p_archive='current' and archived_at is null)
), page as (
 select * from filtered order by
 case when coalesce(trim(p_query),'')<>'' and lead_number=trim(p_query) then 0 else 1 end,
 case when p_sort='name' then lower(customer_name) end asc,
 case when p_sort='oldest' then inquiry_date end asc nulls last,
 case when p_sort<>'oldest' then inquiry_date end desc nulls last,id
 offset greatest(coalesce(p_offset,0),0) limit least(greatest(coalesce(p_limit,50),1),100)
)
select jsonb_build_object(
 'total',(select count(*) from filtered),'all_total',(select count(*) from base),
 'rows',coalesce((select jsonb_agg(to_jsonb(page)-'searchable'-'homeowner_name') from page),'[]'::jsonb),
 'statuses',coalesce((select jsonb_agg(s order by s) from (select distinct inquiry_status s from base) opts),'[]'::jsonb),
 'sources',coalesce((select jsonb_agg(s order by s) from (select distinct source s from base where source<>'') opts),'[]'::jsonb)
);
$$;
revoke all on function public.bro_search_inquiries(text,text,text,date,date,text,text,integer,integer) from public,anon;
grant execute on function public.bro_search_inquiries(text,text,text,date,date,text,text,integer,integer) to authenticated;
notify pgrst,'reload schema';
