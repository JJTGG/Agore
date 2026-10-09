-- Agoré V0: atomically add a customer reply to their own support case.
-- Customer callers are constrained to the requester on the case.
-- This function is callable only by the trusted server-side service_role.

CREATE OR REPLACE FUNCTION public.agore_add_support_case_message(
  p_case_id uuid,
  p_sender_id uuid,
  p_body text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_case_requester_id uuid;
  v_case_status text;
  v_body text;
  v_message_id uuid;
  v_now timestamptz := now();
BEGIN
  IF p_case_id IS NULL OR p_sender_id IS NULL THEN
    RAISE EXCEPTION 'case_id and sender_id are required'
      USING ERRCODE = '22023';
  END IF;

  v_body := btrim(COALESCE(p_body, ''));

  IF char_length(v_body) < 1 OR char_length(v_body) > 5000 THEN
    RAISE EXCEPTION 'message body must be between 1 and 5000 characters'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    WHERE profile.id = p_sender_id
      AND profile.account_status = 'active'
  ) THEN
    RAISE EXCEPTION 'active sender profile not found'
      USING ERRCODE = '22023';
  END IF;

  SELECT support_case.requester_id, support_case.status
    INTO v_case_requester_id, v_case_status
  FROM public.support_cases AS support_case
  WHERE support_case.id = p_case_id
  FOR UPDATE;

  IF NOT FOUND OR v_case_requester_id <> p_sender_id THEN
    RAISE EXCEPTION 'support case not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_case_status = 'closed' THEN
    RAISE EXCEPTION 'closed support cases cannot receive replies'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.support_case_messages (
    case_id,
    sender_id,
    visibility,
    body,
    created_at
  )
  VALUES (
    p_case_id,
    p_sender_id,
    'customer',
    v_body,
    v_now
  )
  RETURNING id INTO v_message_id;

  IF v_case_status IN ('resolved', 'waiting_on_user') THEN
    UPDATE public.support_cases
    SET
      status = 'open',
      resolved_at = NULL,
      updated_at = v_now,
      last_message_at = v_now
    WHERE id = p_case_id;

    INSERT INTO private.support_case_events (
      case_id,
      actor_id,
      event_type,
      metadata,
      created_at
    )
    VALUES (
      p_case_id,
      p_sender_id,
      CASE
        WHEN v_case_status = 'resolved'
          THEN 'case.reopened'
        ELSE 'case.status_changed'
      END,
      jsonb_build_object(
        'from_status', v_case_status,
        'to_status', 'open',
        'reason', 'customer_reply'
      ),
      v_now
    );
  ELSE
    UPDATE public.support_cases
    SET
      updated_at = v_now,
      last_message_at = v_now
    WHERE id = p_case_id;
  END IF;

  INSERT INTO private.support_case_events (
    case_id,
    actor_id,
    event_type,
    metadata,
    created_at
  )
  VALUES (
    p_case_id,
    p_sender_id,
    'case.message_added',
    jsonb_build_object(
      'message_id', v_message_id,
      'visibility', 'customer'
    ),
    v_now
  );

  RETURN v_message_id;
END;
$function$;

COMMENT ON FUNCTION public.agore_add_support_case_message(uuid, uuid, text) IS
  'Atomically adds a customer reply to the requester-owned support case and updates case state and audit history. Restricted to service_role callers.';

REVOKE ALL
  ON FUNCTION public.agore_add_support_case_message(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
  ON FUNCTION public.agore_add_support_case_message(uuid, uuid, text)
  TO service_role;