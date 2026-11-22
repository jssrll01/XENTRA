grant select on public.notifications to authenticated;
drop policy if exists notif_sel on public.notifications;
create policy notif_sel on public.notifications for select to authenticated using (user_id = auth.uid());
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
select jsonb_build_object(
  'rls', (select relrowsecurity from pg_class where oid = 'public.notifications'::regclass),
  'sel', has_table_privilege('authenticated', 'public.notifications', 'select'),
  'anon_sel', has_table_privilege('anon', 'public.notifications', 'select'),
  'pub', (select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'),
  'policy', (select count(*) from pg_policies where tablename = 'notifications' and policyname = 'notif_sel'),
  'fn_anon', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and prokind = 'f' and has_function_privilege('anon', oid, 'execute'))
) as verify;
