do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['messages','message_reactions','conversation_members'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

select jsonb_build_object(
 'realtime', (select string_agg(tablename, ',' order by tablename) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'),
 'rls', (select jsonb_object_agg(relname, relrowsecurity) from pg_class
         where oid in ('public.conversations'::regclass, 'public.conversation_members'::regclass, 'public.messages'::regclass, 'public.message_reactions'::regclass)),
 'sel', jsonb_build_object(
   'conv', has_table_privilege('authenticated', 'public.conversations', 'select'),
   'cm', has_table_privilege('authenticated', 'public.conversation_members', 'select'),
   'msg', has_table_privilege('authenticated', 'public.messages', 'select'),
   'rx', has_table_privilege('authenticated', 'public.message_reactions', 'select'),
   'body_col', has_column_privilege('authenticated', 'public.messages', 'body', 'select'),
   'read_col', has_column_privilege('authenticated', 'public.conversation_members', 'last_read_at', 'select')),
 'writes_blocked', not (has_table_privilege('authenticated', 'public.messages', 'insert')
   or has_table_privilege('authenticated', 'public.messages', 'update')
   or has_table_privilege('authenticated', 'public.messages', 'delete')
   or has_table_privilege('authenticated', 'public.conversation_members', 'update')),
 'anon_none', not (has_table_privilege('anon', 'public.messages', 'select') or has_table_privilege('anon', 'public.conversations', 'select')),
 'fn_auth', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
   and proname in ('is_member','start_direct','list_conversations','list_messages','send_message','edit_message','delete_message','mark_read','toggle_reaction')
   and has_function_privilege('authenticated', oid, 'execute')),
 'fn_anon', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
   and proname in ('is_member','start_direct','list_conversations','list_messages','send_message','edit_message','delete_message','mark_read','toggle_reaction')
   and has_function_privilege('anon', oid, 'execute')),
 'policies', (select count(*) from pg_policies where schemaname = 'public' and tablename in ('conversations','conversation_members','messages','message_reactions'))
) as v3c;
