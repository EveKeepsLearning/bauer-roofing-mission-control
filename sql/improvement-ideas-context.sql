create or replace function public.bro_ideas_context()
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
  'is_workspace_owner', auth.uid()=bro_private.workspace_owner() and exists(select 1 from public.bro_message_recipients() m where m.user_id=auth.uid()),
  'members',coalesce((select jsonb_agg(to_jsonb(m)) from public.bro_message_recipients() m),'[]'::jsonb)
 );
$$;
revoke all on function public.bro_ideas_context() from public,anon;
grant execute on function public.bro_ideas_context() to authenticated;
