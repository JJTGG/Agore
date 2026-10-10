-- Keep the internal event ledger closed to API roles.
REVOKE EXECUTE
ON FUNCTION public.rls_auto_enable()
FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE private.agore_events
ENABLE ROW LEVEL SECURITY;

REVOKE ALL
ON TABLE private.agore_events
FROM PUBLIC, anon, authenticated, service_role;