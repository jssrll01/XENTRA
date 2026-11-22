drop policy if exists pins_sel on public.message_pins;
create policy pins_sel on public.message_pins for select to authenticated using (public.is_member(conversation_id));
grant select on public.message_pins to authenticated;
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_pins') then
    alter publication supabase_realtime add table public.message_pins;
  end if;
end $$;
select jsonb_build_object(
 'realtime', (select string_agg(tablename, ',' order by tablename) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'),
 'rls', (select jsonb_object_agg(relname, relrowsecurity) from pg_class where oid in ('public.message_pins'::regclass, 'public.scheduled_messages'::regclass, 'public.reminders'::regclass)),
 'pins_sel', has_table_privilege('authenticated', 'public.message_pins', 'select'),
 'pins_col', has_column_privilege('authenticated', 'public.message_pins', 'message_id', 'select'),
 'pins_write_blocked', not (has_table_privilege('authenticated', 'public.message_pins', 'insert') or has_table_privilege('authenticated', 'public.message_pins', 'delete')),
 'private_tables_closed', not (has_table_privilege('authenticated', 'public.scheduled_messages', 'select') or has_table_privilege('authenticated', 'public.reminders', 'select') or has_table_privilege('anon', 'public.message_pins', 'select')),
 'fn_auth', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
   and proname in ('set_conversation_flags','toggle_pin_message','list_pins','forward_message','search_messages','schedule_message','list_scheduled','cancel_scheduled','create_reminder','list_reminders','cancel_reminder','list_messages','home_summary')
   and has_function_privilege('authenticated', oid, 'execute')),
 'fn_anon', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
   and proname in ('set_conversation_flags','toggle_pin_message','list_pins','forward_message','search_messages','schedule_message','list_scheduled','cancel_scheduled','create_reminder','list_reminders','cancel_reminder','list_messages','home_summary')
   and has_function_privilege('anon', oid, 'execute')),
 'internal_hidden', not (has_function_privilege('authenticated', 'public.dispatch_due()', 'execute') or has_function_privilege('authenticated', 'public.home_summary_base()', 'execute')),
 'cron_jobs', (select count(*) from cron.job where jobname = 'xentra_dispatch_due'),
 'notif_checks', (select coalesce(string_agg(pg_get_constraintdef(oid), ' | '), 'none') from pg_constraint where conrelid = 'public.notifications'::regclass and contype = 'c')
) as v3d;
