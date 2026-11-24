select jsonb_build_object(
  'contacts_cols', (select string_agg(column_name || ':' || data_type, ', ' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = 'contacts'),
  'labels_cols', (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = 'contact_labels'),
  'contacts_pk', (select string_agg(conname, ',') from pg_constraint where conrelid = 'public.contacts'::regclass),
  'label_fns', (select string_agg(proname, ',') from pg_proc where pronamespace = 'public'::regnamespace and prosrc like '%label_id%'),
  'prof_cols', (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = 'profiles'),
  'prof_sel', (select string_agg(column_name, ',') from information_schema.column_privileges where table_schema = 'public' and table_name = 'profiles' and grantee = 'authenticated' and privilege_type = 'SELECT'),
  'upd_profile', (select left(prosrc, 700) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'update_profile' limit 1),
  'get_profile', (select left(prosrc, 500) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'get_my_profile' limit 1)
) as scan;
