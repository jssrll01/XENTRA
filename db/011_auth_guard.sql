begin;
do $do$ begin
  if to_regclass('public.account_activity') is null then raise exception 'account_activity missing'; end if;
  if to_regclass('public.notifications') is null then raise exception 'notifications missing'; end if;
  if to_regclass('public.auth_attempts') is not null then raise exception 'already applied'; end if;
end $do$;

create table public.auth_attempts (
  scope text not null check (scope in ('email','device')),
  k text not null,
  fails int not null default 0,
  strikes int not null default 0,
  locked_until timestamptz,
  last_fail_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (scope, k));
alter table public.auth_attempts enable row level security;
revoke all on public.auth_attempts from public, anon, authenticated;

insert into public.app_config(key, value, is_public) values
 ('auth_lock_threshold', '5'::jsonb, false),
 ('auth_lock_minutes', '[1,5,15,60]'::jsonb, false),
 ('auth_attempt_window_hours', '24'::jsonb, false) on conflict (key) do nothing;

alter table public.account_activity alter column signin_at drop not null;
do $do$ declare r record; n int := 0; begin
  for r in select conname from pg_constraint where conrelid = 'public.account_activity'::regclass and contype = 'c' and pg_get_constraintdef(oid) ~ 'kind' loop
    execute format('alter table public.account_activity drop constraint %I', r.conname); n := n + 1;
  end loop;
  if n <> 1 then raise exception 'expected one kind constraint, found %', n; end if;
  alter table public.account_activity add constraint account_activity_kind_check check (kind in ('signin','privacy','username','signin_failed','otp_failed','reset_failed','blocked'));
end $do$;

create function public.auth_guard_ek(p_email text) returns text language sql immutable as $f$
  select encode(sha256(convert_to(lower(btrim(coalesce(p_email, ''))), 'UTF8')), 'hex') $f$;
create function public.auth_guard_user(p_email text) returns uuid language sql stable security definer set search_path = public, pg_temp as $f$
  select id from auth.users where lower(email) = lower(btrim(coalesce(p_email, ''))) limit 1 $f$;

create function public.auth_guard_bump(p_scope text, p_key text) returns timestamptz language plpgsql security definer set search_path = public, pg_temp as $f$
declare th int := (public.cfg('auth_lock_threshold') #>> '{}')::int; mins jsonb := public.cfg('auth_lock_minutes'); wh int := (public.cfg('auth_attempt_window_hours') #>> '{}')::int;
  f int; s int; lu timestamptz; lf timestamptz; n int; m int; newlock timestamptz;
begin
  if th is null or mins is null or wh is null then raise exception 'Settings are unavailable.'; end if;
  insert into public.auth_attempts(scope, k) values (p_scope, p_key) on conflict do nothing;
  select fails, strikes, locked_until, last_fail_at into f, s, lu, lf from public.auth_attempts where scope = p_scope and k = p_key for update;
  if lf is not null and lf < now() - make_interval(hours => wh) and (lu is null or lu <= now()) then f := 0; s := 0; end if;
  f := f + 1;
  if f >= th then
    s := s + 1; n := jsonb_array_length(mins); m := (mins ->> (least(s, n) - 1))::int;
    newlock := now() + make_interval(mins => m); f := 0;
  end if;
  update public.auth_attempts set fails = f, strikes = s, locked_until = coalesce(newlock, locked_until), last_fail_at = now(), updated_at = now() where scope = p_scope and k = p_key;
  return newlock;
end $f$;

create function public.auth_guard_check(p_email text, p_device text) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $f$
declare ek text := public.auth_guard_ek(p_email); dk text := left(btrim(coalesce(p_device, '')), 64); lu timestamptz; uid uuid;
begin
  if dk = '' then raise exception 'device required'; end if;
  select max(locked_until) into lu from public.auth_attempts where (scope = 'email' and k = ek) or (scope = 'device' and k = dk);
  if lu is not null and lu > now() then
    uid := public.auth_guard_user(p_email);
    if uid is not null and not exists (select 1 from public.account_activity where user_id = uid and kind = 'blocked' and created_at > now() - interval '10 minutes') then
      insert into public.account_activity(user_id, kind, detail, created_at) values (uid, 'blocked', 'Attempt blocked while sign-ins are paused', now());
    end if;
    return jsonb_build_object('blocked', true, 'retry_after', greatest(1, ceil(extract(epoch from (lu - now())))::int));
  end if;
  return jsonb_build_object('blocked', false, 'retry_after', 0);
end $f$;

create function public.auth_guard_fail(p_email text, p_device text, p_kind text) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $f$
declare ek text := public.auth_guard_ek(p_email); dk text := left(btrim(coalesce(p_device, '')), 64); l1 timestamptz; l2 timestamptz; lu timestamptz; uid uuid; mn int;
begin
  if dk = '' then raise exception 'device required'; end if;
  if p_kind not in ('signin_failed','otp_failed','reset_failed') then raise exception 'bad kind'; end if;
  l1 := public.auth_guard_bump('email', ek);
  l2 := public.auth_guard_bump('device', dk);
  lu := greatest(l1, l2);
  uid := public.auth_guard_user(p_email);
  if uid is not null then
    insert into public.account_activity(user_id, kind, detail, created_at) values (uid, p_kind,
      case p_kind when 'signin_failed' then 'Failed sign-in attempt' when 'otp_failed' then 'Wrong verification code' else 'Wrong password reset code' end, now());
    if lu is not null then
      mn := greatest(1, ceil(extract(epoch from (lu - now())) / 60)::int);
      insert into public.account_activity(user_id, kind, detail, created_at) values (uid, 'blocked', 'Too many failed attempts. Sign-ins paused for ' || mn || ' min.', now());
      insert into public.notifications(user_id, type, title, body, link) values (uid, 'security', 'Sign-in attempts blocked',
        'There were repeated failed attempts on your account. Sign-ins are paused for ' || mn || ' minutes. If this was not you, change your password.', '/settings');
    end if;
  end if;
  return jsonb_build_object('blocked', lu is not null, 'retry_after', case when lu is not null then greatest(1, ceil(extract(epoch from (lu - now())))::int) else 0 end);
end $f$;

create function public.auth_guard_ok(p_email text, p_device text) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $f$
begin
  update public.auth_attempts set fails = 0, strikes = 0, locked_until = null, updated_at = now() where scope = 'email' and k = public.auth_guard_ek(p_email);
  update public.auth_attempts set fails = 0, updated_at = now() where scope = 'device' and k = left(btrim(coalesce(p_device, '')), 64);
  return jsonb_build_object('ok', true);
end $f$;

do $do$ declare r record; begin
  for r in select p.oid::regprocedure sig, p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('auth_guard_ek','auth_guard_user','auth_guard_bump','auth_guard_check','auth_guard_fail','auth_guard_ok') loop
    execute 'revoke all on function ' || r.sig || ' from public, anon, authenticated';
    if r.proname in ('auth_guard_check','auth_guard_fail','auth_guard_ok') then execute 'grant execute on function ' || r.sig || ' to service_role'; end if;
  end loop;
  perform cron.schedule('xentra_auth_attempts_gc', '30 3 * * *', 'delete from public.auth_attempts where updated_at < now() - interval ''7 days'' and (locked_until is null or locked_until < now())');
end $do$;
commit;

select jsonb_build_object(
 'tbl_rls', (select relrowsecurity from pg_class where oid = 'public.auth_attempts'::regclass),
 'tbl_auth_select', has_table_privilege('authenticated', 'public.auth_attempts', 'select'),
 'cfg', (select count(*) from public.app_config where key in ('auth_lock_threshold','auth_lock_minutes','auth_attempt_window_hours')),
 'kinds', (select left(pg_get_constraintdef(oid), 160) from pg_constraint where conname = 'account_activity_kind_check'),
 'closed_to_client', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname like 'auth_guard_%' and (has_function_privilege('anon', oid, 'execute') or has_function_privilege('authenticated', oid, 'execute'))),
 'svc_ok', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('auth_guard_check','auth_guard_fail','auth_guard_ok') and has_function_privilege('service_role', oid, 'execute')),
 'cron', (select schedule from cron.job where jobname = 'xentra_auth_attempts_gc'));
