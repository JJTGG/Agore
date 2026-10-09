
-- Agoré: explicit staff roles and support access control.
-- No staff member is provisioned by this migration.

ALTER TABLE private.admin_users
  ADD COLUMN role text;

ALTER TABLE private.admin_users
  ADD COLUMN is_active boolean NOT NULL DEFAULT true;

-- Existing staff memberships must be explicitly reviewed before
-- this role model can be enabled. The live table was verified empty.
DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM private.admin_users
    WHERE role IS NULL
  ) THEN
    RAISE EXCEPTION
      'Assign an explicit staff role before completing this migration.';
  END IF;
END;
$migration$;

ALTER TABLE private.admin_users
  ALTER COLUMN role SET NOT NULL;

ALTER TABLE private.admin_users
  ADD CONSTRAINT admin_users_role_check
  CHECK (
    role IN (
      'founder',
      'super_admin',
      'platform_admin',
      'moderator',
      'support_staff',
      'analyst'
    )
  );

COMMENT ON COLUMN private.admin_users.role IS
  'Explicit Agoré administrative role; role assignment is privileged.';

COMMENT ON COLUMN private.admin_users.is_active IS
  'Inactive staff members cannot use staff-only application capabilities.';

CREATE INDEX admin_users_active_role_idx
  ON private.admin_users (role)
  WHERE is_active = true;

-- Support access is separate from general administrative membership.
-- Moderators and analysts do not automatically receive access to every
-- customer support conversation.
CREATE OR REPLACE FUNCTION public.agore_is_support_staff(
  candidate_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT
    candidate_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM private.admin_users AS admin_user
      WHERE admin_user.user_id = candidate_user_id
        AND admin_user.is_active = true
        AND admin_user.role IN (
          'founder',
          'super_admin',
          'platform_admin',
          'support_staff'
        )
    );
$function$;

COMMENT ON FUNCTION public.agore_is_support_staff(uuid) IS
  'Server-only check for active staff explicitly authorized to access customer support.';

REVOKE ALL
  ON FUNCTION public.agore_is_support_staff(uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
  ON FUNCTION public.agore_is_support_staff(uuid)
  TO service_role;
