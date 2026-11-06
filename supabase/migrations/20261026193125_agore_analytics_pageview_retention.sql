-- Schedule daily deletion of analytics page views older than 180 days.
-- This retention job intentionally affects only public.agore_analytics_pageviews.

create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

do $migration$
declare
  existing_job_id bigint;
begin
  select jobid
    into existing_job_id
  from cron.job
  where jobname = 'agore-analytics-pageview-retention'
  limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'agore-analytics-pageview-retention',
    '17 3 * * *',
    $job$
      delete from public.agore_analytics_pageviews
      where viewed_at < now() - interval '180 days'
    $job$
  );
end
$migration$;