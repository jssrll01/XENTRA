select jsonb_build_object(
  'cron_jobs', (select string_agg(jobname || ' [' || schedule || '] ' || left(command, 160), E'\n') from cron.job),
  'storage_fns', (select string_agg(proname, ',') from pg_proc where pronamespace = 'public'::regnamespace and (prosrc ilike '%storage.objects%' or prosrc ilike '%attachment%' and prosrc ilike '%delete%')),
  'retention_fns', (select string_agg(proname, ',') from pg_proc where pronamespace = 'public'::regnamespace and (proname ilike '%retention%' or proname ilike '%purge%' or proname ilike '%expire%' or proname ilike '%cleanup%')),
  'buckets', (select string_agg(id || ' public=' || public::text, ', ') from storage.buckets),
  'files_total', (select count(*) from storage.objects),
  'files_older_24h', (select count(*) from storage.objects where created_at < now() - interval '24 hours'),
  'oldest_file', (select min(created_at) from storage.objects),
  'edge_note', 'Check supabase/functions in the repo for a scheduled storage cleanup function'
) as scan;
