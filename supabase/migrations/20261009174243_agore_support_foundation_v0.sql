-- Agoré V0: private support and moderation case foundation.
-- All reads/writes are performed by trusted server routes using service_role.
-- The browser must never query these tables directly.

CREATE TABLE public.support_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL
    REFERENCES public.profiles(id) ON DELETE RESTRICT,
  category text NOT NULL
    CHECK (category IN (
      'account_access',
      'technical_issue',
      'bug_report',
      'safety',
      'privacy',
      'feedback',
      'other'
    )),
  subject text NOT NULL
    CHECK (char_length(btrim(subject)) BETWEEN 5 AND 160),
  description text NOT NULL
    CHECK (char_length(btrim(description)) BETWEEN 10 AND 5000),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN (
      'open',
      'in_progress',
      'waiting_on_user',
      'resolved',
      'closed'
    )),
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assigned_to uuid
    REFERENCES private.admin_users(user_id) ON DELETE SET NULL,
  related_report_id uuid
    REFERENCES public.reports(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  closed_at timestamptz,
  CONSTRAINT support_cases_resolved_timestamp_check
    CHECK (resolved_at IS NULL OR status IN ('resolved', 'closed')),
  CONSTRAINT support_cases_closed_timestamp_check
    CHECK (closed_at IS NULL OR status = 'closed')
);

COMMENT ON TABLE public.support_cases IS
  'Private Agoré user-support cases and staff-managed case workflow. Accessible only through trusted server routes.';
COMMENT ON COLUMN public.support_cases.related_report_id IS
  'Optional link to an existing moderation report. Reports remain canonical in public.reports.';
COMMENT ON COLUMN public.support_cases.assigned_to IS
  'Assigned support staff member; the referenced profile must exist in private.admin_users.';

CREATE TABLE public.support_case_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL
    REFERENCES public.support_cases(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL
    REFERENCES public.profiles(id) ON DELETE RESTRICT,
  visibility text NOT NULL DEFAULT 'customer'
    CHECK (visibility IN ('customer', 'internal')),
  body text NOT NULL
    CHECK (char_length(btrim(body)) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.support_case_messages IS
  'Support case replies. Internal staff notes are marked internal and must never be included in requester responses.';

CREATE TABLE private.support_case_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL
    REFERENCES public.support_cases(id) ON DELETE RESTRICT,
  actor_id uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type text NOT NULL
    CHECK (event_type IN (
      'case.created',
      'case.status_changed',
      'case.priority_changed',
      'case.assigned',
      'case.message_added',
      'case.resolved',
      'case.closed',
      'case.reopened',
      'case.linked_report'
    )),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE private.support_case_events IS
  'Append-oriented audit trail for support case and staff actions. Not exposed to public client roles.';

CREATE INDEX support_cases_requester_created_idx
  ON public.support_cases (requester_id, created_at DESC, id DESC);
CREATE INDEX support_cases_status_created_idx
  ON public.support_cases (status, created_at ASC, id ASC);
CREATE INDEX support_cases_assignee_status_idx
  ON public.support_cases (assigned_to, status, updated_at DESC)
  WHERE assigned_to IS NOT NULL;
CREATE UNIQUE INDEX support_cases_related_report_unique_idx
  ON public.support_cases (related_report_id)
  WHERE related_report_id IS NOT NULL;
CREATE INDEX support_case_messages_case_created_idx
  ON public.support_case_messages (case_id, created_at ASC, id ASC);
CREATE INDEX support_case_events_case_created_idx
  ON private.support_case_events (case_id, created_at DESC, id DESC);

ALTER TABLE public.support_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_case_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.support_case_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.support_cases
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.support_case_messages
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE private.support_case_events
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.support_cases TO service_role;
GRANT SELECT, INSERT ON TABLE public.support_case_messages TO service_role;
GRANT SELECT, INSERT ON TABLE private.support_case_events TO service_role;