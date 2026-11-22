select jsonb_build_object(
 'users', (select count(*) from auth.users),
 'profiles', (select count(*) from public.profiles),
 'rls', (select jsonb_agg(c.relname || ':' || c.relrowsecurity::text) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'),
 'tbl_profiles_select', has_table_privilege('authenticated', 'public.profiles', 'select'),
 'col_profiles_id', has_column_privilege('authenticated', 'public.profiles', 'id', 'select'),
 'col_profiles_phone', has_column_privilege('authenticated', 'public.profiles', 'phone', 'select'),
 'tbl_notifications_select', has_table_privilege('authenticated', 'public.notifications', 'select'),
 'anon_any', (has_table_privilege('anon', 'public.profiles', 'select') or has_table_privilege('anon', 'public.notifications', 'select')),
 'client_writes', (has_table_privilege('authenticated', 'public.profiles', 'update') or has_table_privilege('authenticated', 'public.profiles', 'insert') or has_table_privilege('authenticated', 'public.notifications', 'update')),
 'rpc', (select jsonb_agg(p.proname || ':' || has_function_privilege('authenticated', p.oid, 'execute')::text || '/' || has_function_privilege('anon', p.oid, 'execute')::text)
         from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname <> 'handle_new_user'),
 'trigger', (select count(*) from pg_trigger where tgname = 'on_auth_user_created')
);
