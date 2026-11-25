select jsonb_build_object(
  'mem_cols', (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = 'conversation_members'),
  'conv_cols', (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = 'conversations'),
  'lc_where', (select substr(prosrc, greatest(position('where cm.user_id' in prosrc) - 200, 1), 700) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'list_conversations' limit 1)
) as scan;
