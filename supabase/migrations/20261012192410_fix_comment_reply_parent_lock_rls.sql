-- Keep the parent-row lock and visibility checks in the comment trigger,
-- but allow the trigger to inspect the parent safely without being filtered
-- by the caller's own-comment UPDATE policy.
ALTER FUNCTION private.agore_validate_comment_write()
  SECURITY DEFINER;

-- Pin the search path and keep execution restricted to the roles that need it.
ALTER FUNCTION private.agore_validate_comment_write()
  SET search_path = pg_catalog, public;

REVOKE ALL
ON FUNCTION private.agore_validate_comment_write()
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION private.agore_validate_comment_write()
TO authenticated;