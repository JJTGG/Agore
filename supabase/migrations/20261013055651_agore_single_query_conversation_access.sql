CREATE OR REPLACE FUNCTION public.agore_get_conversation_messaging_access(
  p_conversation_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT jsonb_build_object(
    'conversation', (
      SELECT jsonb_build_object(
        'id', c.id,
        'type', c.type,
        'created_by', c.created_by,
        'direct_participant_a', c.direct_participant_a,
        'direct_participant_b', c.direct_participant_b
      )
      FROM public.conversations c
      WHERE c.id = p_conversation_id
    ),
    'membership', (
      SELECT jsonb_build_object(
        'conversation_id', cm.conversation_id,
        'user_id', cm.user_id,
        'role', cm.role,
        'joined_at', cm.joined_at,
        'left_at', cm.left_at
      )
      FROM public.conversation_members cm
      WHERE cm.conversation_id = p_conversation_id
        AND cm.user_id = p_user_id
        AND cm.left_at IS NULL
    ),
    'blocked', EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = p_conversation_id
        AND c.type = 'direct'
        AND c.direct_participant_a IS NOT NULL
        AND c.direct_participant_b IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.blocks b
          WHERE (
            b.blocker_id = c.direct_participant_a
            AND b.blocked_id = c.direct_participant_b
          ) OR (
            b.blocker_id = c.direct_participant_b
            AND b.blocked_id = c.direct_participant_a
          )
        )
    )
  );
$function$;

REVOKE ALL ON FUNCTION public.agore_get_conversation_messaging_access(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agore_get_conversation_messaging_access(uuid, uuid)
  TO service_role;
