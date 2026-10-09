-- Agoré V0: atomically create a support case with its opening message and audit records.
-- Restricted to service_role; application routes must derive requester_id from the auth session.

CREATE OR REPLACE FUNCTION public.agore_create_support_case(
  p_requester_id uuid,
  p_category text,
  p_subject text,
  p_description text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_case_id uuid;
  v_message_id uuid;
  v_subject text;
  v_description text;
BEGIN
  IF p_requester_id IS NULL THEN
    RAISE EXCEPTION 'requester_id is required'
      USING ERRCODE = '22023';
  END IF;

  v_subject := btrim(COALESCE(p_subject, ''));
  v_description := btrim(COALESCE(p_description, ''));

  IF char_length(v_subject) < 5 OR char_length(v_subject) > 160 THEN
    RAISE EXCEPTION 'subject must be between 5 and 160 characters'
      USING ERRCODE = '22023';
  END IF;

  IF char_length(v_description) < 10 OR char_length(v_description) > 5000 THEN
    RAISE EXCEPTION 'description must be between 10 and 5000 characters'
      USING ERRCODE = '22023';
  END IF;

  IF p_category NOT IN (
    'account_access',
    'technical_issue',
    'bug_report',
    'safety',
    'privacy',
    'feedback',
    'other'
  ) THEN
    RAISE EXCEPTION 'invalid support category'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    WHERE profile.id = p_requester_id
      AND profile.account_status = 'active'
  ) THEN
    RAISE EXCEPTION 'active requester profile not found'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.support_cases (
    requester_id,
    category,
    subject,
    description
  )
  VALUES (
    p_requester_id,
    p_category,
    v_subject,
    v_description
  )
  RETURNING id INTO v_case_id;

  INSERT INTO public.support_case_messages (
    case_id,
    sender_id,
    visibility,
    body
  )
  VALUES (
    v_case_id,
    p_requester_id,
    'customer',
    v_description
  )
  RETURNING id INTO v_message_id;

  INSERT INTO private.support_case_events (
    case_id,
    actor_id,
    event_type,
    metadata
  )
  VALUES
  (
    v_case_id,
    p_requester_id,
    'case.created',
    jsonb_build_object(
      'category', p_category,
      'subject', v_subject,
      'initial_message_id', v_message_id
    )
  ),
  (
    v_case_id,
    p_requester_id,
    'case.message_added',
    jsonb_build_object(
      'message_id', v_message_id,
      'visibility', 'customer',
      'is_opening_message', true
    )
  );

  RETURN v_case_id;
END;
$function$;

COMMENT ON FUNCTION public.agore_create_support_case(uuid, text, text, text) IS
  'Atomically creates a support case, opening customer message, and audit events. Restricted to trusted server-side service_role callers.';

REVOKE ALL
  ON FUNCTION public.agore_create_support_case(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
  ON FUNCTION public.agore_create_support_case(uuid, text, text, text)
  TO service_role;