do $do$
declare d text; nd text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'home_summary_base';
  if d is null then raise exception 'home_summary_base missing'; end if;
  if position('cleared_at' in d) = 0 then
    nd := regexp_replace(d,
      'where\s+cm\.user_id\s*=\s*me\s+and\s+not\s+cm\.archived\s+and\s+c\.last_message_at\s*>\s*now\(\)\s*-\s*interval\s*''7 days''',
      $q$where cm.user_id = me and not cm.archived and c.last_message_at > now() - interval '7 days'
      and (cm.cleared_at is null or c.last_message_at > cm.cleared_at)
      and (c.kind = 'group' or (c.kind = 'direct' and exists (select 1 from public.conversation_members o where o.conversation_id = c.id and o.user_id <> me and not exists (select 1 from public.blocks bk where bk.blocker = me and bk.blocked = o.user_id))))$q$);
    if nd = d then raise exception 'home_summary_base anchor not found'; end if;
    execute nd;
  end if;
end $do$;

select jsonb_build_object(
 'patched', (select position('cleared_at' in prosrc) > 0 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'home_summary_base'),
 'fn_anon', (select coalesce(bool_or(has_function_privilege('anon', oid, 'execute')), false) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('home_summary', 'home_summary_base')),
 'series', (select substr(prosrc, greatest(position('into acs' in prosrc) - 40, 1), 760) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'home_summary_base')
) as verify;
