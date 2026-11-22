do $$
declare t text;
begin
  foreach t in array array['team_members', 'team_posts', 'team_join_requests'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
select jsonb_build_object(
  'kind_chk', (select pg_get_constraintdef(oid) from pg_constraint where conname = 'conversations_kind_check' and conrelid = 'public.conversations'::regclass),
  'rls', (select string_agg(c.relname || ':' || c.relrowsecurity::int::text, ' ' order by c.relname) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname in ('teams', 'team_members', 'team_bans', 'team_join_requests', 'team_channels', 'team_posts', 'team_activity', 'announcements')),
  'sel', (select string_agg(c.relname || ':' || has_table_privilege('authenticated', c.oid, 'select')::int::text, ' ' order by c.relname) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname in ('teams', 'team_members', 'team_bans', 'team_join_requests', 'team_channels', 'team_posts', 'team_activity', 'announcements')),
  'pub', (select string_agg(tablename, ',' order by tablename) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename like 'team%'),
  'fn_new', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and has_function_privilege('authenticated', oid, 'execute') and proname in ('create_team', 'update_team', 'set_team_avatar', 'get_team', 'list_my_teams', 'discover_teams', 'preview_team', 'join_team', 'join_team_by_code', 'list_join_requests', 'respond_join_request', 'reset_team_invite', 'set_team_invite_enabled', 'list_team_members', 'set_team_role', 'transfer_team_owner', 'leave_team', 'kick_member', 'ban_member', 'unban_member', 'list_bans', 'mute_member', 'create_channel', 'update_channel', 'archive_channel', 'list_channels', 'get_channel_head', 'conversation_names', 'create_post', 'pin_post', 'delete_post', 'list_posts', 'list_team_activity', 'get_announcement')),
  'fn_anon', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and prokind = 'f' and has_function_privilege('anon', oid, 'execute')),
  'helpers', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('jok', 'jerr', 'team_role', 'team_rank', 'log_team', 'add_to_channels', 'remove_from_channels', 'add_member', 'channel_block') and has_function_privilege('authenticated', oid, 'execute')),
  'policy_fns', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('is_team_member', 'is_team_staff') and has_function_privilege('authenticated', oid, 'execute') and not has_function_privilege('anon', oid, 'execute')),
  'enforced', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('block_between', 'block_error') and prosrc like '%channel%')
) as verify;
