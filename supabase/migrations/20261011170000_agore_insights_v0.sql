
create table if not exists public.agore_analytics_pageviews (
  pageview_id uuid primary key,
  visitor_id uuid not null,
  session_id uuid not null,
  user_id uuid null references public.profiles(id) on delete set null,
  path text not null check (
    char_length(path) between 1 and 200
    and left(path, 1) = '/'
    and position('?' in path) = 0
    and position('#' in path) = 0
  ),
  referrer_host text not null default 'direct'
    check (char_length(referrer_host) between 1 and 253),
  device_type text not null
    check (device_type in ('mobile', 'tablet', 'desktop', 'unknown')),
  country_code text null
    check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  viewed_at timestamptz not null default now()
);

comment on table public.agore_analytics_pageviews is
  'First-party, privacy-minimised page-view telemetry. Never stores full URLs, query strings, IP addresses, message contents, or raw user agents.';

create index if not exists agore_analytics_pageviews_viewed_at_idx
  on public.agore_analytics_pageviews (viewed_at desc);
create index if not exists agore_analytics_pageviews_session_idx
  on public.agore_analytics_pageviews (session_id, viewed_at desc);
create index if not exists agore_analytics_pageviews_visitor_idx
  on public.agore_analytics_pageviews (visitor_id, viewed_at desc);
create index if not exists agore_analytics_pageviews_user_idx
  on public.agore_analytics_pageviews (user_id, viewed_at desc)
  where user_id is not null;

alter table public.agore_analytics_pageviews enable row level security;
revoke all on table public.agore_analytics_pageviews
  from public, anon, authenticated, service_role;

create or replace function public.agore_analytics_record_pageview(
  p_pageview_id uuid,
  p_visitor_id uuid,
  p_session_id uuid,
  p_user_id uuid,
  p_path text,
  p_referrer_host text,
  p_device_type text,
  p_country_code text
)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := null;
  v_recent_count bigint := 0;
begin
  if p_pageview_id is null
     or p_visitor_id is null
     or p_session_id is null
     or p_path is null
     or char_length(p_path) < 1
     or char_length(p_path) > 200
     or left(p_path, 1) <> '/'
     or position('?' in p_path) > 0
     or position('#' in p_path) > 0
  then
    raise exception 'Invalid analytics page-view payload'
      using errcode = '22023';
  end if;

  if p_referrer_host is null
     or char_length(p_referrer_host) < 1
     or char_length(p_referrer_host) > 253
     or p_referrer_host !~ '^[A-Za-z0-9.-]+$'
  then
    raise exception 'Invalid referrer host'
      using errcode = '22023';
  end if;

  if p_device_type is null
     or p_device_type not in ('mobile', 'tablet', 'desktop', 'unknown')
  then
    raise exception 'Invalid device type'
      using errcode = '22023';
  end if;

  if p_country_code is not null
     and p_country_code !~ '^[A-Z]{2}$'
  then
    p_country_code := null;
  end if;

  if exists (
    select 1
    from public.agore_analytics_pageviews existing
    where existing.pageview_id = p_pageview_id
  ) then
    return false;
  end if;

  select count(*)
    into v_recent_count
  from public.agore_analytics_pageviews existing
  where existing.visitor_id = p_visitor_id
    and existing.viewed_at > now() - interval '1 minute';

  if v_recent_count >= 90 then
    return false;
  end if;

  if p_user_id is not null and exists (
    select 1
    from public.profiles profile
    where profile.id = p_user_id
      and profile.account_status = 'active'
  ) then
    v_user_id := p_user_id;
  end if;

  insert into public.agore_analytics_pageviews (
    pageview_id,
    visitor_id,
    session_id,
    user_id,
    path,
    referrer_host,
    device_type,
    country_code
  )
  values (
    p_pageview_id,
    p_visitor_id,
    p_session_id,
    v_user_id,
    p_path,
    lower(p_referrer_host),
    p_device_type,
    p_country_code
  )
  on conflict (pageview_id) do nothing;

  if not found then
    return false;
  end if;

  if random() < 0.01 then
    delete from public.agore_analytics_pageviews
    where viewed_at < now() - interval '180 days';
  end if;

  return true;
end;
$function$;

revoke all on function public.agore_analytics_record_pageview(
  uuid, uuid, uuid, uuid, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.agore_analytics_record_pageview(
  uuid, uuid, uuid, uuid, text, text, text, text
) to service_role;

create or replace function public.agore_admin_get_insights(
  p_actor_id uuid,
  p_days integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_role text;
  v_days integer;
  v_start timestamptz;
  v_summary jsonb;
  v_daily jsonb;
  v_pages jsonb;
  v_sources jsonb;
  v_devices jsonb;
  v_countries jsonb;
begin
  if p_actor_id is null then
    raise exception 'Administrative access required'
      using errcode = '42501';
  end if;

  v_role := public.agore_get_admin_role(p_actor_id);

  if v_role not in (
    'founder', 'super_admin', 'platform_admin', 'moderator', 'analyst'
  ) then
    raise exception 'Administrative access required'
      using errcode = '42501';
  end if;

  if p_days is null or p_days not in (7, 30, 90) then
    raise exception 'Days must be 7, 30, or 90'
      using errcode = '22023';
  end if;

  v_days := p_days;
  v_start := (
    date_trunc('day', now() at time zone 'UTC')
    - ((v_days - 1) * interval '1 day')
  ) at time zone 'UTC';

  select jsonb_build_object(
    'days', v_days,
    'from', v_start,
    'to', now(),
    'generatedAt', now(),
    'totalAccounts', (select count(*) from public.profiles),
    'activeAccounts', (
      select count(*) from public.profiles where account_status = 'active'
    ),
    'disabledAccounts', (
      select count(*) from public.profiles where account_status = 'disabled'
    ),
    'visiblePosts', (
      select count(*) from public.posts where deleted_at is null
    ),
    'visibleComments', (
      select count(*) from public.comments where deleted_at is null
    ),
    'currentReactions', (select count(*) from public.post_reactions),
    'currentReposts', (select count(*) from public.reposts),
    'currentFollows', (select count(*) from public.follows),
    'currentMessages', (
      select count(*) from public.messages where deleted_at is null
    ),
    'currentGroups', (
      select count(*) from public.conversations where type = 'group'
    ),
    'pageViews', (
      select count(*) from public.agore_analytics_pageviews
      where viewed_at >= v_start
    ),
    'visitors', (
      select count(distinct visitor_id)
      from public.agore_analytics_pageviews where viewed_at >= v_start
    ),
    'sessions', (
      select count(distinct session_id)
      from public.agore_analytics_pageviews where viewed_at >= v_start
    ),
    'returningVisitors', (
      select count(distinct recent.visitor_id)
      from public.agore_analytics_pageviews recent
      where recent.viewed_at >= v_start
        and exists (
          select 1
          from public.agore_analytics_pageviews earlier
          where earlier.visitor_id = recent.visitor_id
            and earlier.viewed_at < v_start
        )
    ),
    'newAccounts', (
      select count(*) from public.profiles where created_at >= v_start
    ),
    'newPosts', (
      select count(*) from public.agore_events
      where event_type = 'post.created' and occurred_at >= v_start
    ),
    'newComments', (
      select count(*) from private.agore_events
      where event_type = 'comment.created' and occurred_at >= v_start
    ),
    'newReactions', (
      select count(*) from private.agore_events
      where event_type in ('post.reaction.added', 'post.reaction.changed')
        and occurred_at >= v_start
    ),
    'newReposts', (
      select count(*) from private.agore_events
      where event_type = 'repost.created' and occurred_at >= v_start
    ),
    'newFollows', (
      select count(*) from private.agore_events
      where event_type = 'follow.created' and occurred_at >= v_start
    ),
    'messagesSent', (
      select count(*) from private.agore_events
      where event_type = 'message.created' and occurred_at >= v_start
    ),
    'dau', (
      select count(distinct actor_id) from (
        select user_id as actor_id
        from public.agore_analytics_pageviews
        where user_id is not null
          and viewed_at >= now() - interval '1 day'
        union
        select actor_id
        from private.agore_events
        where actor_id is not null
          and occurred_at >= now() - interval '1 day'
          and event_type in (
            'profile.updated', 'post.created', 'post.updated', 'post.deleted',
            'comment.created', 'comment.updated', 'comment.deleted',
            'post.reaction.added', 'post.reaction.changed', 'post.reaction.removed',
            'repost.created', 'repost.deleted', 'follow.created', 'follow.deleted',
            'conversation.created', 'conversation.updated', 'conversation.member_added',
            'conversation.member_removed', 'message.created', 'message.updated',
            'message.deleted', 'message.reaction.added', 'message.reaction.changed',
            'message.reaction.removed', 'message.media_added', 'message.media_removed'
          )
      ) active_today
    ),
    'wau', (
      select count(distinct actor_id) from (
        select user_id as actor_id
        from public.agore_analytics_pageviews
        where user_id is not null
          and viewed_at >= now() - interval '7 days'
        union
        select actor_id
        from private.agore_events
        where actor_id is not null
          and occurred_at >= now() - interval '7 days'
          and event_type in (
            'profile.updated', 'post.created', 'post.updated', 'post.deleted',
            'comment.created', 'comment.updated', 'comment.deleted',
            'post.reaction.added', 'post.reaction.changed', 'post.reaction.removed',
            'repost.created', 'repost.deleted', 'follow.created', 'follow.deleted',
            'conversation.created', 'conversation.updated', 'conversation.member_added',
            'conversation.member_removed', 'message.created', 'message.updated',
            'message.deleted', 'message.reaction.added', 'message.reaction.changed',
            'message.reaction.removed', 'message.media_added', 'message.media_removed'
          )
      ) active_week
    ),
    'mau', (
      select count(distinct actor_id) from (
        select user_id as actor_id
        from public.agore_analytics_pageviews
        where user_id is not null
          and viewed_at >= now() - interval '30 days'
        union
        select actor_id
        from private.agore_events
        where actor_id is not null
          and occurred_at >= now() - interval '30 days'
          and event_type in (
            'profile.updated', 'post.created', 'post.updated', 'post.deleted',
            'comment.created', 'comment.updated', 'comment.deleted',
            'post.reaction.added', 'post.reaction.changed', 'post.reaction.removed',
            'repost.created', 'repost.deleted', 'follow.created', 'follow.deleted',
            'conversation.created', 'conversation.updated', 'conversation.member_added',
            'conversation.member_removed', 'message.created', 'message.updated',
            'message.deleted', 'message.reaction.added', 'message.reaction.changed',
            'message.reaction.removed', 'message.media_added', 'message.media_removed'
          )
      ) active_month
    )
  ) into v_summary;

  with days as (
    select generate_series(
      (now() at time zone 'UTC')::date - (v_days - 1),
      (now() at time zone 'UTC')::date,
      interval '1 day'
    )::date as day
  ),
  pageview_daily as (
    select
      (viewed_at at time zone 'UTC')::date as day,
      count(*) as page_views,
      count(distinct visitor_id) as visitors
    from public.agore_analytics_pageviews
    where viewed_at >= v_start
    group by 1
  ),
  signup_daily as (
    select (created_at at time zone 'UTC')::date as day, count(*) as signups
    from public.profiles
    where created_at >= v_start
    group by 1
  ),
  event_daily as (
    select
      (occurred_at at time zone 'UTC')::date as day,
      count(*) filter (where event_type = 'post.created') as posts,
      count(*) filter (where event_type = 'comment.created') as comments,
      count(*) filter (
        where event_type in ('post.reaction.added', 'post.reaction.changed')
      ) as reactions,
      count(*) filter (where event_type = 'repost.created') as reposts,
      count(*) filter (where event_type = 'follow.created') as follows,
      count(*) filter (where event_type = 'message.created') as messages,
      count(*) filter (
        where event_type = 'conversation.created'
          and data->>'conversation_type' = 'group'
      ) as groups_created
    from private.agore_events
    where occurred_at >= v_start
    group by 1
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', to_char(days.day, 'YYYY-MM-DD'),
        'pageViews', coalesce(pageview_daily.page_views, 0),
        'visitors', coalesce(pageview_daily.visitors, 0),
        'signups', coalesce(signup_daily.signups, 0),
        'posts', coalesce(event_daily.posts, 0),
        'comments', coalesce(event_daily.comments, 0),
        'reactions', coalesce(event_daily.reactions, 0),
        'reposts', coalesce(event_daily.reposts, 0),
        'follows', coalesce(event_daily.follows, 0),
        'messages', coalesce(event_daily.messages, 0),
        'groupsCreated', coalesce(event_daily.groups_created, 0)
      )
      order by days.day
    ),
    '[]'::jsonb
  )
  into v_daily
  from days
  left join pageview_daily using (day)
  left join signup_daily using (day)
  left join event_daily using (day);

  select coalesce(
    jsonb_agg(jsonb_build_object(
      'path', ranked.path,
      'pageViews', ranked.page_views,
      'visitors', ranked.visitors
    ) order by ranked.page_views desc),
    '[]'::jsonb
  )
  into v_pages
  from (
    select path, count(*) as page_views,
      count(distinct visitor_id) as visitors
    from public.agore_analytics_pageviews
    where viewed_at >= v_start
    group by path
    order by page_views desc
    limit 10
  ) ranked;

  select coalesce(
    jsonb_agg(jsonb_build_object(
      'source', ranked.source,
      'visits', ranked.visits
    ) order by ranked.visits desc),
    '[]'::jsonb
  )
  into v_sources
  from (
    select referrer_host as source, count(distinct session_id) as visits
    from public.agore_analytics_pageviews
    where viewed_at >= v_start
    group by referrer_host
    order by visits desc
    limit 10
  ) ranked;

  select coalesce(
    jsonb_agg(jsonb_build_object(
      'device', ranked.device_type,
      'pageViews', ranked.page_views
    ) order by ranked.page_views desc),
    '[]'::jsonb
  )
  into v_devices
  from (
    select device_type, count(*) as page_views
    from public.agore_analytics_pageviews
    where viewed_at >= v_start
    group by device_type
    order by page_views desc
  ) ranked;

  select coalesce(
    jsonb_agg(jsonb_build_object(
      'country', ranked.country_code,
      'pageViews', ranked.page_views,
      'visitors', ranked.visitors
    ) order by ranked.page_views desc),
    '[]'::jsonb
  )
  into v_countries
  from (
    select country_code,
      count(*) as page_views,
      count(distinct visitor_id) as visitors
    from public.agore_analytics_pageviews
    where viewed_at >= v_start
      and country_code is not null
    group by country_code
    order by page_views desc
    limit 10
  ) ranked;

  return jsonb_build_object(
    'summary', v_summary,
    'daily', v_daily,
    'popularPages', v_pages,
    'trafficSources', v_sources,
    'devices', v_devices,
    'countries', v_countries,
    'definitions', jsonb_build_object(
      'visitors', 'Distinct first-party random browser IDs seen in the selected period; historical coverage begins when page tracking is deployed.',
      'sessions', 'Distinct browser session IDs in the selected period.',
      'activeUsers', 'Distinct signed-in accounts with a page view or meaningful product event in the period.',
      'retention', 'Historical anonymous identifiers are retained for up to 180 days; product events predate page tracking only from the existing event-log activation.'
    )
  );
end;
$function$;

revoke all on function public.agore_admin_get_insights(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.agore_admin_get_insights(uuid, integer)
  to service_role;
