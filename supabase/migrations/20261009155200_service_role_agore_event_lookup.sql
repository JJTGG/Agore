BEGIN;

-- Provide the server-side notification helper with a PostgREST
-- lookup path while keeping the authoritative event log private.
CREATE OR REPLACE VIEW public.agore_events AS
SELECT
  event_id,
  event_sequence,
  event_type,
  actor_id,
  subject_id,
  target_id,
  visibility_class,
  source_table,
  source_operation,
  source_key,
  transaction_id,
  data,
  occurred_at
FROM private.agore_events;

-- Only the server-side service role may read this view.
REVOKE ALL
ON TABLE public.agore_events
FROM PUBLIC, anon, authenticated;

GRANT SELECT
ON TABLE public.agore_events
TO service_role;

COMMENT ON VIEW public.agore_events IS
  'Server-only lookup view for authoritative Agore event processing.';

-- Refresh the PostgREST schema cache so the view is discoverable.
NOTIFY pgrst, 'reload schema';

COMMIT;