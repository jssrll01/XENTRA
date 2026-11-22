select jsonb_build_object(
  'conv_cols', (select string_agg(column_name || ':' || data_type || ':' || is_nullable, ' ' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = 'conversations'),
  'mem_cols', (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = 'conversation_members'),
  'msg_cols', (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = 'messages'),
  'conv_con', (select string_agg(conname || ' ' || pg_get_constraintdef(oid), ' | ') from pg_constraint where conrelid = 'public.conversations'::regclass),
  'mem_con', (select string_agg(conname, ',') from pg_constraint where conrelid = 'public.conversation_members'::regclass),
  'policies', (select string_agg(tablename || '.' || policyname, ',') from pg_policies where schemaname = 'public' and tablename in ('conversations', 'conversation_members', 'messages')),
  'storage_pol', (select string_agg(policyname, ',') from pg_policies where schemaname = 'storage'),
  'assume_other', (select string_agg(proname, ',') from pg_proc where pronamespace = 'public'::regnamespace and (prosrc like '%direct_key%' or prosrc like '%user_id <> me%' or prosrc like '%user_id <> auth.uid()%')),
  'is_member_src', (select left(prosrc, 200) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'is_member' limit 1),
  'notif_chk', (select string_agg(pg_get_constraintdef(oid), ' | ') from pg_constraint where conrelid = 'public.notifications'::regclass and contype = 'c')
) as scan;
