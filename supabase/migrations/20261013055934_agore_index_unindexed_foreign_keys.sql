CREATE INDEX IF NOT EXISTS support_case_events_actor_id_idx
  ON private.support_case_events (actor_id);
CREATE INDEX IF NOT EXISTS conversation_calls_ended_by_idx
  ON public.conversation_calls (ended_by);
CREATE INDEX IF NOT EXISTS profile_verifications_granted_by_idx
  ON public.profile_verifications (granted_by);
CREATE INDEX IF NOT EXISTS support_case_messages_sender_id_idx
  ON public.support_case_messages (sender_id);
