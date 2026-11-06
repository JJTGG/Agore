-- Agoré V0: atomic support staff workflow.
-- Staff operations are invoked only from trusted server routes
-- using service_role. Every operation rechecks the actor's role.
--
-- Authorized support roles:
-- founder, super_admin, platform_admin, support_staff.
-- Moderator and Analyst intentionally have no support-case access.

CREATE OR REPLACE FUNCTION public.agore_staff_update_support_case(
  p_case_id uuid,
  p_actor_id uuid,
  p_status text DEFAULT NULL,
  p_priority text DEFAULT NULL,
  p_update_assignee boolean DEFAULT false,
  p_assigned_to uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_case public.support_cases%ROWTYPE;
  v_updated public.support_cases%ROWTYPE;
  v_new_status text;
  v_new_priority text;
  v_new_assigned_to uuid;
  v_now timestamptz := statement_timestamp();
  v_actor_allowed boolean;
BEGIN
  IF p_case_id IS NULL OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'case_id and actor_id are required'
      USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM private.admin_users AS au
    JOIN public.profiles AS profile
      ON profile.id = au.user_id
    WHERE au.user_id = p_actor_id
      AND au.is_active = true
      AND au.role IN (
        'founder',
        'super_admin',
        'platform_admin',
        'support_staff'
      )
      AND profile.account_status = 'active'
  )
  INTO v_actor_allowed;

  IF NOT v_actor_allowed THEN
    RAISE EXCEPTION 'support staff authorization required'
      USING ERRCODE = '42501';
  END IF;

  IF p_status IS NOT NULL AND p_status NOT IN (
    'open',
    'in_progress',
    'waiting_on_user',
    'resolved',
    'closed'
  ) THEN
    RAISE EXCEPTION 'invalid support case status'
      USING ERRCODE = '22023';
  END IF;

  IF p_priority IS NOT NULL AND p_priority NOT IN (
    'low',
    'normal',
    'high',
    'urgent'
  ) THEN
    RAISE EXCEPTION 'invalid support case priority'
      USING ERRCODE = '22023';
  END IF;

  IF p_update_assignee IS NULL THEN
    RAISE EXCEPTION 'update_assignee must be specified'
      USING ERRCODE = '22023';
  END IF;

  IF NOT p_update_assignee AND p_assigned_to IS NOT NULL THEN
    RAISE EXCEPTION 'assigned_to requires update_assignee=true'
      USING ERRCODE = '22023';
  END IF;

  IF p_status IS NULL
     AND p_priority IS NULL
     AND NOT p_update_assignee THEN
    RAISE EXCEPTION 'at least one case change is required'
      USING ERRCODE = '22023';
  END IF;

  IF p_update_assignee AND p_assigned_to IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM private.admin_users AS au
      JOIN public.profiles AS profile
        ON profile.id = au.user_id
      WHERE au.user_id = p_assigned_to
        AND au.is_active = true
        AND au.role IN (
          'founder',
          'super_admin',
          'platform_admin',
          'support_staff'
        )
        AND profile.account_status = 'active'
    ) THEN
      RAISE EXCEPTION 'assignee is not active support staff'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT *
  INTO v_case
  FROM public.support_cases AS support_case
  WHERE support_case.id = p_case_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'support case not found'
      USING ERRCODE = 'P0002';
  END IF;

  v_new_status := COALESCE(p_status, v_case.status);
  v_new_priority := COALESCE(p_priority, v_case.priority);

  v_new_assigned_to := CASE
    WHEN p_update_assignee THEN p_assigned_to
    ELSE v_case.assigned_to
  END;

  UPDATE public.support_cases
  SET
    status = v_new_status,
    priority = v_new_priority,
    assigned_to = v_new_assigned_to,
    updated_at = v_now,

    resolved_at = CASE
      WHEN v_new_status IN ('resolved', 'closed')
        THEN COALESCE(v_case.resolved_at, v_now)
      WHEN v_new_status IN ('open', 'in_progress', 'waiting_on_user')
           AND v_new_status IS DISTINCT FROM v_case.status
        THEN NULL
      ELSE v_case.resolved_at
    END,

    closed_at = CASE
      WHEN v_new_status = 'closed'
        THEN COALESCE(v_case.closed_at, v_now)
      ELSE NULL
    END
  WHERE id = p_case_id
  RETURNING * INTO v_updated;

  -- Log status transitions in the same transaction as the update.
  IF v_new_status IS DISTINCT FROM v_case.status THEN
    INSERT INTO private.support_case_events (
      case_id,
      actor_id,
      event_type,
      metadata,
      created_at
    )
    VALUES (
      p_case_id,
      p_actor_id,
      CASE
        WHEN v_new_status = 'resolved'
          THEN 'case.resolved'
        WHEN v_new_status = 'closed'
          THEN 'case.closed'
        WHEN v_case.status IN ('resolved', 'closed')
             AND v_new_status IN (
               'open',
               'in_progress',
               'waiting_on_user'
             )
          THEN 'case.reopened'
        ELSE 'case.status_changed'
      END,
      jsonb_build_object(
        'from_status', v_case.status,
        'to_status', v_new_status
      ),
      v_now
    );
  END IF;

  IF v_new_priority IS DISTINCT FROM v_case.priority THEN
    INSERT INTO private.support_case_events (
      case_id,
      actor_id,
      event_type,
      metadata,
      created_at
    )
    VALUES (
      p_case_id,
      p_actor_id,
      'case.priority_changed',
      jsonb_build_object(
        'from_priority', v_case.priority,
        'to_priority', v_new_priority
      ),
      v_now
    );
  END IF;

  IF v_new_assigned_to IS DISTINCT FROM v_case.assigned_to THEN
    INSERT INTO private.support_case_events (
      case_id,
      actor_id,
      event_type,
      metadata,
      created_at
    )
    VALUES (
      p_case_id,
      p_actor_id,
      'case.assigned',
      jsonb_build_object(
        'from_assignee_id', v_case.assigned_to,
        'to_assignee_id', v_new_assigned_to
      ),
      v_now
    );
  END IF;

  RETURN to_jsonb(v_updated);
END;
$function$;


CREATE OR REPLACE FUNCTION public.agore_staff_add_support_case_message(
  p_case_id uuid,
  p_sender_id uuid,
  p_body text,
  p_visibility text DEFAULT 'customer'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_case public.support_cases%ROWTYPE;
  v_message_id uuid;
  v_body text;
  v_now timestamptz := statement_timestamp();
  v_actor_allowed boolean;
BEGIN
  IF p_case_id IS NULL OR p_sender_id IS NULL THEN
    RAISE EXCEPTION 'case_id and sender_id are required'
      USING ERRCODE = '22023';
  END IF;

  IF p_visibility IS NULL OR p_visibility NOT IN (
    'customer',
    'internal'
  ) THEN
    RAISE EXCEPTION 'invalid message visibility'
      USING ERRCODE = '22023';
  END IF;

  v_body := btrim(COALESCE(p_body, ''));

  IF char_length(v_body) < 1 OR char_length(v_body) > 5000 THEN
    RAISE EXCEPTION 'message body must be between 1 and 5000 characters'
      USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM private.admin_users AS au
    JOIN public.profiles AS profile
      ON profile.id = au.user_id
    WHERE au.user_id = p_sender_id
      AND au.is_active = true
      AND au.role IN (
        'founder',
        'super_admin',
        'platform_admin',
        'support_staff'
      )
      AND profile.account_status = 'active'
  )
  INTO v_actor_allowed;

  IF NOT v_actor_allowed THEN
    RAISE EXCEPTION 'support staff authorization required'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_case
  FROM public.support_cases AS support_case
  WHERE support_case.id = p_case_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'support case not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- Closed cases may receive internal audit notes, but not
  -- customer-visible replies. Reopen the case before replying.
  IF v_case.status = 'closed' AND p_visibility = 'customer' THEN
    RAISE EXCEPTION 'closed cases cannot receive customer replies'
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
    p_visibility,
    v_body,
    v_now
  )
  RETURNING id INTO v_message_id;

  IF p_visibility = 'customer' THEN
    UPDATE public.support_cases
    SET
      status = 'waiting_on_user',
      resolved_at = NULL,
      closed_at = NULL,
      updated_at = v_now,
      last_message_at = v_now
    WHERE id = p_case_id;

    IF v_case.status IS DISTINCT FROM 'waiting_on_user' THEN
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
          WHEN v_case.status = 'resolved'
            THEN 'case.reopened'
          ELSE 'case.status_changed'
        END,
        jsonb_build_object(
          'from_status', v_case.status,
          'to_status', 'waiting_on_user',
          'reason', 'staff_reply'
        ),
        v_now
      );
    END IF;
  ELSE
    -- Internal notes update the case audit timestamp but do not
    -- change its public conversation ordering timestamp.
    UPDATE public.support_cases
    SET updated_at = v_now
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
      'visibility', p_visibility
    ),
    v_now
  );

  RETURN v_message_id;
END;
$function$;


CREATE OR REPLACE FUNCTION public.agore_list_support_assignees(
  p_actor_id uuid
)
RETURNS TABLE (
  user_id uuid,
  username text,
  display_name text,
  avatar_path text,
  role text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  IF p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM private.admin_users AS au
    JOIN public.profiles AS actor_profile
      ON actor_profile.id = au.user_id
    WHERE au.user_id = p_actor_id
      AND au.is_active = true
      AND au.role IN (
        'founder',
        'super_admin',
        'platform_admin',
        'support_staff'
      )
      AND actor_profile.account_status = 'active'
  ) THEN
    RAISE EXCEPTION 'support staff authorization required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    au.user_id,
    staff_profile.username::text,
    staff_profile.display_name::text,
    staff_profile.avatar_path::text,
    au.role::text
  FROM private.admin_users AS au
  JOIN public.profiles AS staff_profile
    ON staff_profile.id = au.user_id
  WHERE au.is_active = true
    AND au.role IN (
      'founder',
      'super_admin',
      'platform_admin',
      'support_staff'
    )
    AND staff_profile.account_status = 'active'
  ORDER BY
    CASE au.role
      WHEN 'founder' THEN 1
      WHEN 'super_admin' THEN 2
      WHEN 'platform_admin' THEN 3
      WHEN 'support_staff' THEN 4
      ELSE 5
    END,
    staff_profile.username;
END;
$function$;


COMMENT ON FUNCTION public.agore_staff_update_support_case(
  uuid, uuid, text, text, boolean, uuid
) IS
  'Atomically updates support case status, priority, assignment and audit events. Server-only.';

COMMENT ON FUNCTION public.agore_staff_add_support_case_message(
  uuid, uuid, text, text
) IS
  'Atomically adds a staff reply or internal note, updates case state and records audit events. Server-only.';

COMMENT ON FUNCTION public.agore_list_support_assignees(uuid) IS
  'Returns active support-authorized staff for assignment controls. Server-only.';


REVOKE ALL ON FUNCTION public.agore_staff_update_support_case(
  uuid, uuid, text, text, boolean, uuid
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.agore_staff_add_support_case_message(
  uuid, uuid, text, text
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.agore_list_support_assignees(uuid)
  FROM PUBLIC, anon, authenticated;


GRANT EXECUTE ON FUNCTION public.agore_staff_update_support_case(
  uuid, uuid, text, text, boolean, uuid
) TO service_role;

GRANT EXECUTE ON FUNCTION public.agore_staff_add_support_case_message(
  uuid, uuid, text, text
) TO service_role;

GRANT EXECUTE ON FUNCTION public.agore_list_support_assignees(uuid)
  TO service_role;