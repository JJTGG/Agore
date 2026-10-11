
create or replace function public.agore_admin_get_retention(
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_role text;
  v_tracking_start timestamptz;
  v_day_offset integer;
  v_eligible bigint;
  v_returned bigint;
  v_results jsonb := '{}'::jsonb;
  v_key text;
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

  select min(viewed_at)
    into v_tracking_start
  from public.agore_analytics_pageviews;

  foreach v_day_offset in array array[1, 7, 30] loop
    v_key := 'day' || v_day_offset::text;

    if v_tracking_start is null then
      v_eligible := 0;
      v_returned := 0;
    else
      select count(*)
        into v_eligible
      from public.profiles profile
      where profile.created_at >= v_tracking_start
        and profile.created_at >= now() - interval '180 days'
        and profile.created_at <=
            now() - make_interval(days => v_day_offset + 1);

      select count(*)
        into v_returned
      from public.profiles profile
      where profile.created_at >= v_tracking_start
        and profile.created_at >= now() - interval '180 days'
        and profile.created_at <=
            now() - make_interval(days => v_day_offset + 1)
        and (
          exists (
            select 1
            from public.agore_analytics_pageviews pageview
            where pageview.user_id = profile.id
              and pageview.viewed_at >= profile.created_at
                  + make_interval(days => v_day_offset)
              and pageview.viewed_at < profile.created_at
                  + make_interval(days => v_day_offset + 1)
          )
          or exists (
            select 1
            from private.agore_events event
            where event.actor_id = profile.id
              and event.occurred_at >= profile.created_at
                  + make_interval(days => v_day_offset)
              and event.occurred_at < profile.created_at
                  + make_interval(days => v_day_offset + 1)
              and event.event_type in (
                'profile.updated', 'post.created', 'post.updated', 'post.deleted',
                'comment.created', 'comment.updated', 'comment.deleted',
                'post.reaction.added', 'post.reaction.changed',
                'post.reaction.removed', 'repost.created', 'repost.deleted',
                'follow.created', 'follow.deleted', 'conversation.created',
                'conversation.updated', 'conversation.member_added',
                'conversation.member_removed', 'message.created',
                'message.updated', 'message.deleted', 'message.reaction.added',
                'message.reaction.changed', 'message.reaction.removed',
                'message.media_added', 'message.media_removed'
              )
          )
        );
    end if;

    v_results := v_results || jsonb_build_object(
      v_key,
      jsonb_build_object(
        'eligibleUsers', v_eligible,
        'returnedUsers', v_returned,
        'ratePercent',
          case
            when v_eligible = 0 then null
            else round(
              (v_returned::numeric / v_eligible::numeric) * 100,
              1
            )
          end
      )
    );
  end loop;

  return jsonb_build_object(
    'trackingStartedAt', v_tracking_start,
    'cohorts', v_results,
    'definition',
      'Each cohort counts registered accounts created after page-view tracking began. Return means a page view or meaningful product event during the 24-hour window beginning 1, 7, or 30 days after account creation. Incomplete cohorts are excluded.'
  );
end;
$function$;

revoke all on function public.agore_admin_get_retention(uuid)
  from public, anon, authenticated;
grant execute on function public.agore_admin_get_retention(uuid)
  to service_role;
