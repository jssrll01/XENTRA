insert into public.app_config (key, value) values ('meeting_idle_minutes', '15') on conflict do nothing;
insert into public.app_config (key, value) values ('meeting_max_minutes', '480') on conflict do nothing;

create or replace function public.meeting_idle_due() returns integer
language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0; idle integer; mx integer;
begin
  idle := public.sched_cfg('meeting_idle_minutes', 15);
  mx := public.sched_cfg('meeting_max_minutes', 480);
  for r in
    select m.id, (coalesce(m.answered_at, m.created_at) <= now() - make_interval(mins => mx)) as over
    from public.meetings m
    where m.status = 'active' and (
      coalesce(m.answered_at, m.created_at) <= now() - make_interval(mins => mx)
      or (m.meeting_type = 'group'
          and coalesce(m.answered_at, m.created_at) <= now() - make_interval(mins => idle)
          and not exists (select 1 from public.meeting_participants p
            where p.meeting_id = m.id and (p.status = 'joined' or p.left_at > now() - make_interval(mins => idle))))
    )
  loop
    perform public.call_finish(r.id, 'ended', case when r.over then 'max_duration' else 'idle' end);
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function public.meeting_idle_due() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'xentra_meeting_idle') then
    perform cron.schedule('xentra_meeting_idle', '*/5 * * * *', 'select public.meeting_idle_due()');
  end if;
end $$;

select jsonb_build_object(
  'fn_closed', (not has_function_privilege('authenticated', 'public.meeting_idle_due()', 'execute') and not has_function_privilege('anon', 'public.meeting_idle_due()', 'execute')),
  'cron', exists (select 1 from cron.job where jobname = 'xentra_meeting_idle'),
  'cfg', (select count(*) from public.app_config where key in ('meeting_idle_minutes', 'meeting_max_minutes'))
);
