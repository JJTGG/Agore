
-- Agoré Platform Administration V0
-- Privileged operations and an append-only administrative audit trail.

CREATE TABLE IF NOT EXISTS private.admin_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL
    REFERENCES public.profiles(id) ON DELETE RESTRICT,
  action_type text NOT NULL
    CHECK (
      action_type IN (
        'report.reviewed',
        'report.dismissed',
        'report.actioned',
        'user.disabled',
        'user.reactivated'
      )
    ),
  target_type text NOT NULL
    CHECK (
      target_type IN (
        'profile',
        'post',
        'comment',
        'message',
        'group'
      )
    ),
  target_id uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE private.admin_audit_events
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE private.admin_audit_events
  FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS admin_audit_events_created_idx
  ON private.admin_audit_events (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS admin_audit_events_actor_idx
  ON private.admin_audit_events (actor_id, created_at DESC);

-- Return a role only for active, provisioned administrative accounts.
-- The browser never gets direct access to private.admin_users.

CREATE OR REPLACE FUNCTION public.agore_get_admin_role(
  candidate_user_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT admin_user.role
  FROM private.admin_users AS admin_user
  JOIN public.profiles AS profile
    ON profile.id = admin_user.user_id
  WHERE admin_user.user_id = candidate_user_id
    AND admin_user.is_active = true
    AND profile.account_status = 'active'
  LIMIT 1;
$function$;

REVOKE ALL
  ON FUNCTION public.agore_get_admin_role(uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
  ON FUNCTION public.agore_get_admin_role(uuid)
  TO service_role;

-- Process report decisions and write the audit entry in the same
-- database transaction.

CREATE OR REPLACE FUNCTION public.agore_admin_apply_report_action(
  p_actor_id uuid,
  p_report_id uuid,
  p_action text,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_role text;
  v_report public.reports%ROWTYPE;
  v_new_status text;
  v_event_action text;
  v_note text;
BEGIN
  SELECT admin_user.role
  INTO v_role
  FROM private.admin_users AS admin_user
  JOIN public.profiles AS profile
    ON profile.id = admin_user.user_id
  WHERE admin_user.user_id = p_actor_id
    AND admin_user.is_active = true
    AND profile.account_status = 'active'
  LIMIT 1;

  IF v_role IS NULL
     OR v_role NOT IN (
       'founder',
       'super_admin',
       'platform_admin',
       'moderator'
     )
  THEN
    RAISE EXCEPTION 'Report moderation access required'
      USING ERRCODE = '42501';
  END IF;

  IF p_action NOT IN (
    'review',
    'dismiss',
    'remove_content',
    'disable_account'
  ) THEN
    RAISE EXCEPTION 'Invalid report action'
      USING ERRCODE = '22023';
  END IF;

  IF p_note IS NOT NULL
     AND pg_catalog.char_length(p_note) > 1000
  THEN
    RAISE EXCEPTION 'The audit note is too long'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_report
  FROM public.reports
  WHERE id = p_report_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_report.status IN ('actioned', 'dismissed') THEN
    RAISE EXCEPTION 'This report has already been resolved'
      USING ERRCODE = '55000';
  END IF;

  v_note := pg_catalog.left(
    pg_catalog.btrim(COALESCE(p_note, '')),
    1000
  );

  IF p_action = 'review' THEN
    v_new_status := 'reviewed';
    v_event_action := 'report.reviewed';

  ELSIF p_action = 'dismiss' THEN
    v_new_status := 'dismissed';
    v_event_action := 'report.dismissed';

  ELSIF p_action = 'remove_content' THEN
    IF v_report.target_type NOT IN (
      'post',
      'comment',
      'message'
    ) THEN
      RAISE EXCEPTION 'This report target cannot be removed with this action'
        USING ERRCODE = '22023';
    END IF;

    IF v_report.target_type = 'post' THEN
      UPDATE public.posts
      SET deleted_at = COALESCE(deleted_at, pg_catalog.now()),
          updated_at = pg_catalog.now()
      WHERE id = v_report.target_id;

    ELSIF v_report.target_type = 'comment' THEN
      UPDATE public.comments
      SET deleted_at = COALESCE(deleted_at, pg_catalog.now()),
          updated_at = pg_catalog.now()
      WHERE id = v_report.target_id;

    ELSIF v_report.target_type = 'message' THEN
      UPDATE public.messages
      SET deleted_at = COALESCE(deleted_at, pg_catalog.now()),
          updated_at = pg_catalog.now()
      WHERE id = v_report.target_id;
    END IF;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Reported content was not found'
        USING ERRCODE = 'P0002';
    END IF;

    v_new_status := 'actioned';
    v_event_action := 'report.actioned';

  ELSIF p_action = 'disable_account' THEN
    IF v_role NOT IN (
      'founder',
      'super_admin',
      'platform_admin'
    ) THEN
      RAISE EXCEPTION 'Account management access required'
        USING ERRCODE = '42501';
    END IF;

    IF v_report.target_type <> 'profile' THEN
      RAISE EXCEPTION 'This report does not target an account'
        USING ERRCODE = '22023';
    END IF;

    IF v_report.target_id = p_actor_id THEN
      RAISE EXCEPTION 'You cannot disable your own account'
        USING ERRCODE = '55000';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM private.admin_users AS admin_user
      WHERE admin_user.user_id = v_report.target_id
    ) THEN
      RAISE EXCEPTION 'Administrative accounts require a separate review'
        USING ERRCODE = '55000';
    END IF;

    UPDATE public.profiles
    SET account_status = 'disabled',
        updated_at = pg_catalog.now()
    WHERE id = v_report.target_id
      AND account_status <> 'deleted';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Reported account was not found or cannot be disabled'
        USING ERRCODE = 'P0002';
    END IF;

    v_new_status := 'actioned';
    v_event_action := 'report.actioned';
  END IF;

  UPDATE public.reports
  SET status = v_new_status,
      updated_at = pg_catalog.now()
  WHERE id = v_report.id;

  INSERT INTO private.admin_audit_events (
    actor_id,
    action_type,
    target_type,
    target_id,
    metadata
  )
  VALUES (
    p_actor_id,
    v_event_action,
    v_report.target_type,
    v_report.target_id,
    pg_catalog.jsonb_build_object(
      'report_id', v_report.id,
      'report_action', p_action,
      'previous_status', v_report.status,
      'new_status', v_new_status,
      'report_reason', v_report.reason,
      'note', v_note
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'report_id', v_report.id,
    'status', v_new_status,
    'action', p_action
  );
END;
$function$;

REVOKE ALL
  ON FUNCTION public.agore_admin_apply_report_action(
    uuid, uuid, text, text
  )
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
  ON FUNCTION public.agore_admin_apply_report_action(
    uuid, uuid, text, text
  )
  TO service_role;

-- Update regular account status while protecting the administrative
-- membership table from changes through this endpoint.

CREATE OR REPLACE FUNCTION public.agore_admin_set_account_status(
  p_actor_id uuid,
  p_target_user_id uuid,
  p_new_status text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_role text;
  v_current_status text;
  v_event_action text;
  v_reason text;
BEGIN
  SELECT admin_user.role
  INTO v_role
  FROM private.admin_users AS admin_user
  JOIN public.profiles AS profile
    ON profile.id = admin_user.user_id
  WHERE admin_user.user_id = p_actor_id
    AND admin_user.is_active = true
    AND profile.account_status = 'active'
  LIMIT 1;

  IF v_role IS NULL
     OR v_role NOT IN (
       'founder',
       'super_admin',
       'platform_admin'
     )
  THEN
    RAISE EXCEPTION 'Account management access required'
      USING ERRCODE = '42501';
  END IF;

  IF p_new_status NOT IN ('active', 'disabled') THEN
    RAISE EXCEPTION 'Only active and disabled account states are supported'
      USING ERRCODE = '22023';
  END IF;

  IF p_actor_id = p_target_user_id THEN
    RAISE EXCEPTION 'You cannot change your own account status here'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM private.admin_users AS admin_user
    WHERE admin_user.user_id = p_target_user_id
  ) THEN
    RAISE EXCEPTION 'Administrative accounts require a separate review'
      USING ERRCODE = '55000';
  END IF;

  SELECT account_status
  INTO v_current_status
  FROM public.profiles
  WHERE id = p_target_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_current_status = 'deleted' THEN
    RAISE EXCEPTION 'Deleted accounts cannot be reactivated here'
      USING ERRCODE = '55000';
  END IF;

  v_reason := pg_catalog.left(
    pg_catalog.btrim(COALESCE(p_reason, '')),
    1000
  );

  IF v_current_status = p_new_status THEN
    RETURN pg_catalog.jsonb_build_object(
      'user_id', p_target_user_id,
      'account_status', v_current_status,
      'unchanged', true
    );
  END IF;

  UPDATE public.profiles
  SET account_status = p_new_status,
      updated_at = pg_catalog.now()
  WHERE id = p_target_user_id;

  IF p_new_status = 'disabled' THEN
    v_event_action := 'user.disabled';
  ELSE
    v_event_action := 'user.reactivated';
  END IF;

  INSERT INTO private.admin_audit_events (
    actor_id,
    action_type,
    target_type,
    target_id,
    metadata
  )
  VALUES (
    p_actor_id,
    v_event_action,
    'profile',
    p_target_user_id,
    pg_catalog.jsonb_build_object(
      'previous_status', v_current_status,
      'new_status', p_new_status,
      'reason', v_reason
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'user_id', p_target_user_id,
    'account_status', p_new_status,
    'unchanged', false
  );
END;
$function$;

REVOKE ALL
  ON FUNCTION public.agore_admin_set_account_status(
    uuid, uuid, text, text
  )
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
  ON FUNCTION public.agore_admin_set_account_status(
    uuid, uuid, text, text
  )
  TO service_role;
