select jsonb_build_object(
  'prof_cols', (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = 'profiles'),
  'tables', (select string_agg(table_name, ',') from information_schema.tables where table_schema = 'public' and (table_name like '%communit%' or table_name like '%banner%' or table_name like '%organ%')),
  'fns', (select string_agg(proname, ',') from pg_proc where pronamespace = 'public'::regnamespace and (proname like '%banner%' or proname like '%bio%' or proname like '%communit%' or proname like '%organ%' or prosrc like '%banner%' or prosrc like '%bio%')),
  'teams', (select string_agg(name, ' | ') from public.teams)
) as scan;
