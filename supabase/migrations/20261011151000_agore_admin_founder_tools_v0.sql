-- Founder-only management of staff assignments, verification badges, and audit history.

ALTER TABLE private.admin_audit_events
  DROP CONSTRAINT IF EXISTS admin_audit_events_action_type_check;

ALTER TABLE private.admin_audit_events
  ADD CONSTRAINT admin_audit_events_action_type_check
  CHECK (action_type IN (
    'report.reviewed', 'report.dismissed', 'report.actioned',
    'user.disabled', 'user.reactivated',
    'admin.staff_granted', 'admin.staff_role_changed',
    'admin.staff_revoked', 'verification.granted', 'verification.revoked'
  ));

CREATE OR REPLACE FUNCTION public.agore_admin_list_staff(
  p_actor_id uuid,
  p_query text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF public.agore_get_admin_role(p_actor_id) IS DISTINCT FROM 'founder' THEN
    RAISE EXCEPTION 'Founder access required' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'staff',
    (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', p.id,
        'display_name', p.display_name,
        'username', p.username,
        'account_type', p.account_type,
        'account_status', p.account_status,
        'created_at', p.created_at,
        'role', au.role,
        'is_active', au.is_active
      ) ORDER BY au.role, p.username), '[]'::jsonb)
      FROM private.admin_users au
      JOIN public.profiles p ON p.id = au.user_id
    ),
    'candidates',
    (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', c.id,
        'display_name', c.display_name,
        'username', c.username,
        'account_type', c.account_type,
        'account_status', c.account_status,
        'created_at', c.created_at
      ) ORDER BY c.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT p.id, p.display_name, p.username, p.account_type,
               p.account_status, p.created_at
        FROM public.profiles p
        WHERE p.account_status = 'active'
          AND p_query IS NOT NULL
          AND pg_catalog.char_length(pg_catalog.btrim(p_query)) >= 2
          AND (
            p.username ILIKE '%' || pg_catalog.btrim(p_query) || '%'
            OR p.display_name ILIKE '%' || pg_catalog.btrim(p_query) || '%'
          )
          AND NOT EXISTS (
            SELECT 1
            FROM private.admin_users au
            WHERE au.user_id = p.id
          )
        ORDER BY p.created_at DESC
        LIMIT 50
      ) c
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.agore_admin_list_staff(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agore_admin_list_staff(uuid, text)
  TO service_role;


CREATE OR REPLACE FUNCTION public.agore_admin_manage_staff(
  p_actor_id uuid,
  p_target_user_id uuid,
  p_action text,
  p_role text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_target_status text;
  v_existing_role text;
  v_existing_active boolean;
  v_has_membership boolean := false;
  v_event_action text;
  v_note text;
BEGIN
  IF public.agore_get_admin_role(p_actor_id) IS DISTINCT FROM 'founder' THEN
    RAISE EXCEPTION 'Founder access required' USING ERRCODE = '42501';
  END IF;

  IF p_action IS NULL
     OR p_action NOT IN ('grant', 'change_role', 'revoke') THEN
    RAISE EXCEPTION 'Invalid staff action' USING ERRCODE = '22023';
  END IF;

  IF p_note IS NOT NULL AND pg_catalog.char_length(p_note) > 1000 THEN
    RAISE EXCEPTION 'The audit note is too long' USING ERRCODE = '22023';
  END IF;

  IF p_target_user_id = p_actor_id THEN
    RAISE EXCEPTION 'You cannot change your own staff access'
      USING ERRCODE = '55000';
  END IF;

  SELECT p.account_status
  INTO v_target_status
  FROM public.profiles p
  WHERE p.id = p_target_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target account was not found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT au.role, au.is_active
  INTO v_existing_role, v_existing_active
  FROM private.admin_users au
  WHERE au.user_id = p_target_user_id
  FOR UPDATE;

  v_has_membership := FOUND;

  IF v_has_membership AND v_existing_role = 'founder' THEN
    RAISE EXCEPTION 'Founder memberships are protected'
      USING ERRCODE = '55000';
  END IF;

  IF p_action = 'revoke' THEN
    IF NOT v_has_membership THEN
      RAISE EXCEPTION 'This account has no staff membership'
        USING ERRCODE = 'P0002';
    END IF;

    IF NOT v_existing_active THEN
      RETURN jsonb_build_object(
        'user_id', p_target_user_id,
        'role', v_existing_role,
        'is_active', false,
        'unchanged', true
      );
    END IF;

    UPDATE private.admin_users
    SET is_active = false
    WHERE user_id = p_target_user_id;

    v_note := pg_catalog.left(pg_catalog.btrim(COALESCE(p_note, '')), 1000);

    INSERT INTO private.admin_audit_events (
      actor_id, action_type, target_type, target_id, metadata
    )
    VALUES (
      p_actor_id, 'admin.staff_revoked', 'profile', p_target_user_id,
      jsonb_build_object(
        'previous_role', v_existing_role,
        'new_role', v_existing_role,
        'previous_active', true,
        'new_active', false,
        'note', v_note
      )
    );

    RETURN jsonb_build_object(
      'user_id', p_target_user_id,
      'role', v_existing_role,
      'is_active', false,
      'unchanged', false
    );
  END IF;

  IF v_target_status <> 'active' THEN
    RAISE EXCEPTION 'Only active accounts can receive staff access'
      USING ERRCODE = '55000';
  END IF;

  IF p_role IS NULL OR p_role NOT IN (
    'super_admin', 'platform_admin', 'moderator', 'support_staff', 'analyst'
  ) THEN
    RAISE EXCEPTION 'Invalid staff role' USING ERRCODE = '22023';
  END IF;

  IF p_action = 'change_role' AND NOT v_has_membership THEN
    RAISE EXCEPTION 'This account has no staff membership to change'
      USING ERRCODE = 'P0002';
  END IF;

  v_note := pg_catalog.left(pg_catalog.btrim(COALESCE(p_note, '')), 1000);

  IF v_has_membership THEN
    IF v_existing_active AND v_existing_role = p_role THEN
      RETURN jsonb_build_object(
        'user_id', p_target_user_id,
        'role', v_existing_role,
        'is_active', true,
        'unchanged', true
      );
    END IF;

    UPDATE private.admin_users
    SET role = p_role, is_active = true
    WHERE user_id = p_target_user_id;

    IF v_existing_active THEN
      v_event_action := 'admin.staff_role_changed';
    ELSE
      v_event_action := 'admin.staff_granted';
    END IF;
  ELSE
    INSERT INTO private.admin_users (user_id, role, is_active)
    VALUES (p_target_user_id, p_role, true);

    v_event_action := 'admin.staff_granted';
  END IF;

  INSERT INTO private.admin_audit_events (
    actor_id, action_type, target_type, target_id, metadata
  )
  VALUES (
    p_actor_id, v_event_action, 'profile', p_target_user_id,
    jsonb_build_object(
      'previous_role', v_existing_role,
      'new_role', p_role,
      'previous_active', COALESCE(v_existing_active, false),
      'new_active', true,
      'note', v_note
    )
  );

  RETURN jsonb_build_object(
    'user_id', p_target_user_id,
    'role', p_role,
    'is_active', true,
    'unchanged', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.agore_admin_manage_staff(
  uuid, uuid, text, text, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.agore_admin_manage_staff(
  uuid, uuid, text, text, text
) TO service_role;


CREATE OR REPLACE FUNCTION public.agore_admin_manage_verification(
  p_actor_id uuid,
  p_target_user_id uuid,
  p_action text,
  p_kind text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_target_status text;
  v_old_kind text;
  v_old_expiry timestamptz;
  v_old_revoked_at timestamptz;
  v_has_grant boolean := false;
  v_note text;
BEGIN
  IF public.agore_get_admin_role(p_actor_id) IS DISTINCT FROM 'founder' THEN
    RAISE EXCEPTION 'Founder access required' USING ERRCODE = '42501';
  END IF;

  IF p_action IS NULL OR p_action NOT IN ('grant', 'revoke') THEN
    RAISE EXCEPTION 'Invalid verification action' USING ERRCODE = '22023';
  END IF;

  IF p_note IS NOT NULL AND pg_catalog.char_length(p_note) > 1000 THEN
    RAISE EXCEPTION 'The verification note is too long' USING ERRCODE = '22023';
  END IF;

  SELECT p.account_status
  INTO v_target_status
  FROM public.profiles p
  WHERE p.id = p_target_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target account was not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT v.verification_kind, v.expires_at, v.revoked_at
  INTO v_old_kind, v_old_expiry, v_old_revoked_at
  FROM public.profile_verifications v
  WHERE v.user_id = p_target_user_id
  FOR UPDATE;

  v_has_grant := FOUND;

  IF p_action = 'revoke' THEN
    IF NOT v_has_grant THEN
      RAISE EXCEPTION 'This account has no verification record'
        USING ERRCODE = 'P0002';
    END IF;

    IF v_old_revoked_at IS NOT NULL THEN
      RETURN jsonb_build_object(
        'user_id', p_target_user_id,
        'kind', v_old_kind,
        'revoked', true,
        'unchanged', true
      );
    END IF;

    UPDATE public.profile_verifications
    SET revoked_at = pg_catalog.now()
    WHERE user_id = p_target_user_id;

    INSERT INTO private.admin_audit_events (
      actor_id, action_type, target_type, target_id, metadata
    )
    VALUES (
      p_actor_id, 'verification.revoked', 'profile', p_target_user_id,
      jsonb_build_object(
        'previous_kind', v_old_kind,
        'previous_expires_at', v_old_expiry,
        'note', pg_catalog.left(pg_catalog.btrim(COALESCE(p_note, '')), 1000)
      )
    );

    RETURN jsonb_build_object(
      'user_id', p_target_user_id,
      'kind', v_old_kind,
      'revoked', true,
      'unchanged', false
    );
  END IF;

  IF v_target_status <> 'active' THEN
    RAISE EXCEPTION 'Only active accounts can receive verification'
      USING ERRCODE = '55000';
  END IF;

  IF p_kind IS NULL OR p_kind NOT IN ('agore_official', 'paid') THEN
    RAISE EXCEPTION 'Invalid verification type' USING ERRCODE = '22023';
  END IF;

  IF p_kind = 'agore_official' AND p_expires_at IS NOT NULL THEN
    RAISE EXCEPTION 'Agoré Official verification cannot expire'
      USING ERRCODE = '22023';
  END IF;

  IF p_kind = 'paid'
     AND (p_expires_at IS NULL OR p_expires_at <= pg_catalog.now()) THEN
    RAISE EXCEPTION 'Paid verification requires a future expiry'
      USING ERRCODE = '22023';
  END IF;

  v_note := pg_catalog.left(pg_catalog.btrim(COALESCE(p_note, '')), 1000);

  INSERT INTO public.profile_verifications (
    user_id, verification_kind, verified_at, expires_at,
    revoked_at, granted_by, internal_note
  )
  VALUES (
    p_target_user_id, p_kind, pg_catalog.now(), p_expires_at,
    NULL, p_actor_id, NULLIF(v_note, '')
  )
  ON CONFLICT (user_id)
  DO UPDATE SET
    verification_kind = EXCLUDED.verification_kind,
    verified_at = pg_catalog.now(),
    expires_at = EXCLUDED.expires_at,
    revoked_at = NULL,
    granted_by = EXCLUDED.granted_by,
    internal_note = EXCLUDED.internal_note;

  INSERT INTO private.admin_audit_events (
    actor_id, action_type, target_type, target_id, metadata
  )
  VALUES (
    p_actor_id, 'verification.granted', 'profile', p_target_user_id,
    jsonb_build_object(
      'previous_kind', v_old_kind,
      'previous_expires_at', v_old_expiry,
      'new_kind', p_kind,
      'new_expires_at', p_expires_at,
      'previously_revoked', v_old_revoked_at IS NOT NULL,
      'note', v_note
    )
  );

  RETURN jsonb_build_object(
    'user_id', p_target_user_id,
    'kind', p_kind,
    'expires_at', p_expires_at,
    'revoked', false,
    'unchanged', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.agore_admin_manage_verification(
  uuid, uuid, text, text, timestamptz, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.agore_admin_manage_verification(
  uuid, uuid, text, text, timestamptz, text
) TO service_role;


CREATE OR REPLACE FUNCTION public.agore_admin_list_audit_events(
  p_actor_id uuid,
  p_limit integer DEFAULT 75
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 75), 1), 100);
BEGIN
  IF public.agore_get_admin_role(p_actor_id) IS DISTINCT FROM 'founder' THEN
    RAISE EXCEPTION 'Founder access required' USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT COALESCE(
      jsonb_agg(events.payload ORDER BY events.created_at DESC),
      '[]'::jsonb
    )
    FROM (
      SELECT a.created_at, jsonb_build_object(
        'id', a.id,
        'created_at', a.created_at,
        'actor_id', a.actor_id,
        'actor_username', actor.username,
        'actor_display_name', actor.display_name,
        'action_type', a.action_type,
        'target_type', a.target_type,
        'target_id', a.target_id,
        'target_username', target.username,
        'target_display_name', target.display_name,
        'metadata', a.metadata
      ) AS payload
      FROM private.admin_audit_events a
      LEFT JOIN public.profiles actor ON actor.id = a.actor_id
      LEFT JOIN public.profiles target
        ON a.target_type = 'profile' AND target.id = a.target_id
      ORDER BY a.created_at DESC
      LIMIT v_limit
    ) events
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.agore_admin_list_audit_events(uuid, integer)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.agore_admin_list_audit_events(uuid, integer)
  TO service_role;