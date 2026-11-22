do $$
begin
  if to_regprocedure('public.home_summary_inner()') is null then
    alter function public.home_summary() rename to home_summary_inner;
  end if;
end $$;
create or replace function public.home_summary() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); b jsonb; n int; ser jsonb;
begin
  b := public.home_summary_inner();
  if me is null or (b->>'ok') is distinct from 'true' then return b; end if;
  select count(*) into n from public.contact_requests where to_user = me and status = 'pending';
  select to_jsonb(array_agg(coalesce(x.c, 0) order by d.day)) into ser
    from (select gs::date as day from generate_series(current_date::timestamp - interval '6 days', current_date::timestamp, interval '1 day') gs) d
    left join (select created_at::date as day, count(*) as c from public.contact_requests where to_user = me and created_at >= current_date - 6 group by created_at::date) x on x.day = d.day;
  return jsonb_set(b, '{data,invites}', jsonb_build_object('value', n, 'series', ser));
end $$;
revoke all on function public.home_summary(), public.home_summary_inner() from public, anon, authenticated;
grant execute on function public.home_summary() to authenticated;
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'contact_requests') then
    alter publication supabase_realtime add table public.contact_requests;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'contacts') then
    alter publication supabase_realtime add table public.contacts;
  end if;
end $$;
select jsonb_build_object(
  'rls', (select string_agg(c.relname || ':' || c.relrowsecurity::int::text, ' ' order by c.relname) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname in ('contact_codes', 'contact_requests', 'contact_labels', 'contacts', 'blocks')),
  'sel', (select string_agg(c.relname || ':' || has_table_privilege('authenticated', c.oid, 'select')::int::text, ' ' order by c.relname) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname in ('contact_codes', 'contact_requests', 'contact_labels', 'contacts', 'blocks')),
  'pub', (select string_agg(tablename, ',' order by tablename) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'),
  'fn_new', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('get_my_code', 'regenerate_my_code', 'lookup_code', 'respond_contact_request', 'send_contact_request', 'cancel_contact_request', 'remove_contact', 'set_favorite', 'create_label', 'rename_label', 'delete_label', 'set_contact_label', 'list_labels', 'block_user', 'unblock_user', 'list_blocks', 'list_contacts', 'list_requests', 'contact_relations', 'mutual_contacts', 'start_direct', 'list_conversations', 'send_message', 'forward_message', 'create_poll', 'send_thread_reply', 'send_attachment', 'home_summary') and has_function_privilege('authenticated', oid, 'execute')),
  'fn_anon', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and prokind = 'f' and has_function_privilege('anon', oid, 'execute')),
  'helpers', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('disp', 'pair_blocked', 'block_between', 'block_error', 'relation_of', 'mutual_count', 'home_summary_inner') and has_function_privilege('authenticated', oid, 'execute')),
  'enforced', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and ((proname in ('send_message', 'forward_message', 'create_poll', 'send_thread_reply', 'send_attachment') and prosrc like '%block_error%') or (proname = 'start_direct' and prosrc like '%pair_blocked%') or (proname = 'dispatch_due' and prosrc like '%block_between%') or (proname = 'list_conversations' and prosrc like '%public.blocks%'))),
  'wrapped', exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'home_summary' and prosrc like '%contact_requests%')
) as verify;
