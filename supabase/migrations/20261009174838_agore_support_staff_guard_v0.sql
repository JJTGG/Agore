-- Agoré V0: server-only support staff authorization check.
-- The function is callable only by trusted server-side service_role clients.
-- It does not grant a user any role; membership remains in private.admin_users.

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
    );
$function$;

COMMENT ON FUNCTION public.agore_is_support_staff(uuid) IS
  'Server-only staff membership check. Execution is restricted to service_role; never call this from browser clients.';

REVOKE ALL
  ON FUNCTION public.agore_is_support_staff(uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
  ON FUNCTION public.agore_is_support_staff(uuid)
  TO service_role;