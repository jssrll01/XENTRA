grant select on public.polls, public.poll_votes to authenticated;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'polls' and policyname = 'polls_sel') then
    create policy polls_sel on public.polls for select to authenticated using (public.is_member(conversation_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'poll_votes' and policyname = 'poll_votes_sel') then
    create policy poll_votes_sel on public.poll_votes for select to authenticated using (public.is_member(conversation_id));
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'polls') then
    alter publication supabase_realtime add table public.polls;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'poll_votes') then
    alter publication supabase_realtime add table public.poll_votes;
  end if;
end $$;
select jsonb_build_object(
  'rls', (select string_agg(c.relname || ':' || c.relrowsecurity::int::text, ' ') from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname in ('polls', 'poll_options', 'poll_votes', 'message_attachments')),
  'sel', (select string_agg(c.relname || ':' || has_table_privilege('authenticated', c.oid, 'select')::int::text, ' ') from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname in ('polls', 'poll_options', 'poll_votes', 'message_attachments')),
  'pub', (select string_agg(tablename, ',' order by tablename) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'),
  'fn_new', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('create_poll', 'vote_poll', 'close_poll', 'send_thread_reply', 'list_thread', 'send_attachment', 'list_messages', 'chat_file_ok') and has_function_privilege('authenticated', oid, 'execute')),
  'fn_anon', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and prokind = 'f' and has_function_privilege('anon', oid, 'execute')),
  'bucket', (select coalesce(string_agg(id || ':' || public::text || ':' || coalesce(file_size_limit::text, '-'), ','), 'none') from storage.buckets),
  'spol', (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname in ('chat_files_read', 'chat_files_write')),
  'thread_col', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'messages' and column_name = 'thread_root')
) as verify;
