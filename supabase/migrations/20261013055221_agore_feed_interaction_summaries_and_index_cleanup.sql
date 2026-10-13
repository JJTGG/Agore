-- Summarize post interactions in one authenticated request for a batch of feed posts.
-- SECURITY INVOKER preserves the caller's normal grants and RLS policies.
CREATE OR REPLACE FUNCTION public.agore_post_interaction_summaries(p_post_ids uuid[])
RETURNS TABLE (
  post_id uuid,
  like_count bigint,
  love_count bigint,
  laugh_count bigint,
  care_count bigint,
  wow_count bigint,
  sad_count bigint,
  angry_count bigint,
  my_reaction text,
  repost_count bigint,
  has_reposted boolean,
  comment_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
  WITH requested_ids AS (
    SELECT DISTINCT requested.id
    FROM unnest(COALESCE(p_post_ids, ARRAY[]::uuid[])) AS requested(id)
    LIMIT 50
  )
  SELECT
    p.id AS post_id,
    COUNT(pr.user_id) FILTER (WHERE pr.reaction_type = 'like')::bigint AS like_count,
    COUNT(pr.user_id) FILTER (WHERE pr.reaction_type = 'love')::bigint AS love_count,
    COUNT(pr.user_id) FILTER (WHERE pr.reaction_type = 'laugh')::bigint AS laugh_count,
    COUNT(pr.user_id) FILTER (WHERE pr.reaction_type = 'care')::bigint AS care_count,
    COUNT(pr.user_id) FILTER (WHERE pr.reaction_type = 'wow')::bigint AS wow_count,
    COUNT(pr.user_id) FILTER (WHERE pr.reaction_type = 'sad')::bigint AS sad_count,
    COUNT(pr.user_id) FILTER (WHERE pr.reaction_type = 'angry')::bigint AS angry_count,
    MAX(pr.reaction_type::text) FILTER (WHERE pr.user_id = (SELECT auth.uid())) AS my_reaction,
    (SELECT COUNT(*)::bigint FROM public.reposts r WHERE r.post_id = p.id) AS repost_count,
    EXISTS (
      SELECT 1 FROM public.reposts r
      WHERE r.post_id = p.id AND r.user_id = (SELECT auth.uid())
    ) AS has_reposted,
    (SELECT COUNT(*)::bigint FROM public.comments c WHERE c.post_id = p.id) AS comment_count
  FROM requested_ids requested
  JOIN public.posts p ON p.id = requested.id AND p.deleted_at IS NULL
  LEFT JOIN public.post_reactions pr ON pr.post_id = p.id
  GROUP BY p.id;
$function$;

REVOKE ALL ON FUNCTION public.agore_post_interaction_summaries(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agore_post_interaction_summaries(uuid[]) TO authenticated, service_role;

-- Remove only exact duplicate indexes identified by the performance advisor.
DROP INDEX IF EXISTS public.notifications_recipient_idx;
DROP INDEX IF EXISTS public.comment_media_comment_id_sort_order_idx;
