-- The cleanup function is intended to run through its posts trigger,
-- not as a callable API function.

REVOKE ALL PRIVILEGES
  ON FUNCTION public.agore_clear_profile_pin_for_deleted_post()
  FROM PUBLIC, anon, authenticated;