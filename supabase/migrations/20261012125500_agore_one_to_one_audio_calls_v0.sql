-- Agoré V0: one-to-one audio-call foundation.
--
-- Call records are accessed through authenticated server routes.
-- WebRTC signalling uses authenticated private Realtime channels.
-- Only active members of unblocked direct conversations may use
-- the conversation's audio-call signalling topic.

CREATE TABLE public.conversation_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  conversation_id uuid NOT NULL
    REFERENCES public.conversations(id)
    ON DELETE CASCADE,

  caller_id uuid NOT NULL
    REFERENCES public.profiles(id),

  callee_id uuid NOT NULL
    REFERENCES public.profiles(id),

  status text NOT NULL DEFAULT 'ringing'
    CHECK (
      status IN (
        'ringing',
        'accepted',
        'completed',
        'declined',
        'missed',
        'cancelled',
        'failed'
      )
    ),

  created_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  ended_at timestamptz,

  duration_seconds integer
    CHECK (
      duration_seconds IS NULL
      OR duration_seconds >= 0
    ),

  ended_by uuid
    REFERENCES public.profiles(id),

  failure_reason text
    CHECK (
      failure_reason IS NULL
      OR char_length(failure_reason) <= 240
    ),

  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT conversation_calls_distinct_participants
    CHECK (caller_id <> callee_id),

  CONSTRAINT conversation_calls_valid_ender
    CHECK (
      ended_by IS NULL
      OR ended_by IN (caller_id, callee_id)
    ),

  CONSTRAINT conversation_calls_answered_status
    CHECK (
      status NOT IN ('accepted', 'completed')
      OR answered_at IS NOT NULL
    ),

  CONSTRAINT conversation_calls_terminal_timestamp
    CHECK (
      status NOT IN (
        'completed',
        'declined',
        'missed',
        'cancelled',
        'failed'
      )
      OR ended_at IS NOT NULL
    ),

  CONSTRAINT conversation_calls_valid_timing
    CHECK (
      answered_at IS NULL
      OR ended_at IS NULL
      OR ended_at >= answered_at
    )
);

COMMENT ON TABLE public.conversation_calls IS
  'Private history of one-to-one Agoré audio calls. Access through trusted server routes.';

CREATE INDEX conversation_calls_conversation_history_idx
  ON public.conversation_calls (
    conversation_id,
    created_at DESC
  );

CREATE INDEX conversation_calls_participant_history_idx
  ON public.conversation_calls (
    caller_id,
    created_at DESC
  );

CREATE INDEX conversation_calls_recipient_history_idx
  ON public.conversation_calls (
    callee_id,
    created_at DESC
  );

-- Prevent multiple simultaneous calls within the same conversation.
-- Stale ringing calls must be finalized before a new call can begin.
CREATE UNIQUE INDEX conversation_calls_one_active_per_conversation_idx
  ON public.conversation_calls (conversation_id)
  WHERE status IN ('ringing', 'accepted');

-- The browser must not query or modify call records directly.
-- Trusted API routes use the Supabase service-role client.
ALTER TABLE public.conversation_calls
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL
  ON TABLE public.conversation_calls
  FROM anon, authenticated;

GRANT ALL
  ON TABLE public.conversation_calls
  TO service_role;


-- Permit private audio-call signalling only within an active,
-- unblocked direct conversation.
--
-- Topic format:
-- conversation:<conversation UUID>:call

DROP POLICY IF EXISTS agore_audio_calls_receive_direct_member
  ON realtime.messages;

CREATE POLICY agore_audio_calls_receive_direct_member
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    extension = 'broadcast'

    AND (
      SELECT realtime.topic()
    ) ~ '^conversation:[0-9a-fA-F-]{36}:call$'

    AND EXISTS (
      SELECT 1
      FROM public.conversations AS c
      JOIN public.conversation_members AS cm
        ON cm.conversation_id = c.id
      WHERE c.id = (
        split_part(
          (SELECT realtime.topic()),
          ':',
          2
        )
      )::uuid
        AND c.type = 'direct'
        AND cm.user_id = (SELECT auth.uid())
        AND cm.left_at IS NULL
        AND NOT private.agore_direct_conversation_blocked(
          c.id,
          (SELECT auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS agore_audio_calls_send_direct_member
  ON realtime.messages;

CREATE POLICY agore_audio_calls_send_direct_member
  ON realtime.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    extension = 'broadcast'

    AND (
      SELECT realtime.topic()
    ) ~ '^conversation:[0-9a-fA-F-]{36}:call$'

    AND EXISTS (
      SELECT 1
      FROM public.conversations AS c
      JOIN public.conversation_members AS cm
        ON cm.conversation_id = c.id
      WHERE c.id = (
        split_part(
          (SELECT realtime.topic()),
          ':',
          2
        )
      )::uuid
        AND c.type = 'direct'
        AND cm.user_id = (SELECT auth.uid())
        AND cm.left_at IS NULL
        AND NOT private.agore_direct_conversation_blocked(
          c.id,
          (SELECT auth.uid())
        )
    )
  );