select jsonb_build_object(
  'kind_chk', (select pg_get_constraintdef(oid) from pg_constraint where conname = 'conversations_kind_check' and conrelid = 'public.conversations'::regclass),
  'conv_new', (select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_schema = 'public' and table_name = 'conversations' and column_name in ('name', 'description', 'avatar_url', 'announcement_only', 'created_by', 'invite_code', 'invite_enabled')),
  'role_col', (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'conversation_members' and column_name = 'role'),
  'fn_new', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('create_group', 'update_group', 'set_group_avatar', 'get_group', 'list_group_members', 'preview_group', 'join_group', 'reset_group_invite', 'set_group_invite_enabled', 'add_group_members', 'remove_group_member', 'leave_group', 'set_member_role', 'transfer_ownership', 'list_conversations') and has_function_privilege('authenticated', oid, 'execute')),
  'fn_anon', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and prokind = 'f' and has_function_privilege('anon', oid, 'execute')),
  'helpers', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('group_role', 'is_group', 'block_error', 'block_between') and has_function_privilege('authenticated', oid, 'execute')),
  'announce', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('block_error', 'block_between') and (prosrc like '%announcement_only%' or prosrc like '%Only admins%')),
  'list_ok', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'list_conversations' and prosrc like '%public.blocks%' and prosrc like '%is_group%' = false)
) as verify;
