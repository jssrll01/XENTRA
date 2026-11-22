grant execute on function public.push_targets(uuid, uuid) to service_role;
grant select, update, delete on public.push_subscriptions to service_role;
select jsonb_build_object(
  'svc_exec', has_function_privilege('service_role', 'public.push_targets(uuid,uuid)', 'execute'),
  'anon_exec', has_function_privilege('anon', 'public.push_targets(uuid,uuid)', 'execute'),
  'auth_exec', has_function_privilege('authenticated', 'public.push_targets(uuid,uuid)', 'execute'),
  'fn_anon', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and prokind = 'f' and has_function_privilege('anon', oid, 'execute'))
) as verify;
