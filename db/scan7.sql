select jsonb_build_object(
  'contacts_cols', (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = 'contacts'),
  'contacts_check', (select pg_get_constraintdef(oid) from pg_constraint where conname = 'contacts_check' and conrelid = 'public.contacts'::regclass),
  'meta_cols', (select string_agg(table_name || '.' || column_name, ',') from information_schema.columns where table_schema = 'public' and table_name like '%label%'),
  'list_contacts', (select left(prosrc, 900) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'list_contacts' limit 1)
) as scan;
