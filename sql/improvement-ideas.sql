create table public.improvement_ideas (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null default bro_private.workspace_owner(),
 author_id uuid not null default auth.uid(),
 scope text not null check(scope in ('bro','business')),
 idea text not null check(length(trim(idea)) between 1 and 5000),
 status text not null default 'New' check(status in ('New','Planned','In progress','Done')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.improvement_ideas enable row level security;
create policy read_ideas on public.improvement_ideas for select to authenticated using (
 (scope='bro' and workspace_id=(select bro_private.workspace_owner())) or
 (scope='business' and author_id=(select auth.uid()))
);
create policy add_ideas on public.improvement_ideas for insert to authenticated with check (
 author_id=(select auth.uid()) and workspace_id=(select bro_private.workspace_owner())
);
create policy change_ideas on public.improvement_ideas for update to authenticated using (
 (scope='bro' and workspace_id=(select bro_private.workspace_owner())) or
 (scope='business' and author_id=(select auth.uid()))
) with check (
 (scope='bro' and workspace_id=(select bro_private.workspace_owner())) or
 (scope='business' and author_id=(select auth.uid()))
);
create policy remove_ideas on public.improvement_ideas for delete to authenticated using (
 author_id=(select auth.uid()) or
 (scope='bro' and workspace_id=(select auth.uid()))
);
revoke all on public.improvement_ideas from public,anon,authenticated;
grant select,delete on public.improvement_ideas to authenticated;
grant insert(scope,idea) on public.improvement_ideas to authenticated;
grant update(idea,status,updated_at) on public.improvement_ideas to authenticated;
create index improvement_ideas_workspace_scope on public.improvement_ideas(workspace_id,scope,created_at desc);
create index improvement_ideas_author_scope on public.improvement_ideas(author_id,scope,created_at desc);
