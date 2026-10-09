
-- Agoré V0: server-managed verification foundation.
-- A profile's account_type determines its standard badge design/colour.
-- Verification is separate from account_type; a category alone never grants a badge.
-- Only trusted server-side code using the service role may read or write grants.

CREATE TABLE public.profile_verifications (
  user_id uuid PRIMARY KEY
    REFERENCES public.profiles(id)
    ON DELETE CASCADE,
  verification_kind text NOT NULL
    CHECK (verification_kind IN ('official', 'paid')),
  verified_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  granted_by uuid
    REFERENCES public.profiles(id)
    ON DELETE SET NULL,
  internal_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profile_verifications_expiration_check
    CHECK (
      (verification_kind = 'official' AND expires_at IS NULL)
      OR
      (verification_kind = 'paid' AND expires_at IS NOT NULL)
    ),
  CONSTRAINT profile_verifications_revocation_check
    CHECK (
      revoked_at IS NULL
      OR revoked_at >= verified_at
    )
);

COMMENT ON TABLE public.profile_verifications IS
  'Server-managed current verification grant. Absence of a row means no verification. Account type alone never grants verification.';

COMMENT ON COLUMN public.profile_verifications.verification_kind IS
  'official grants permanent first-party Agoré Official status; paid is reserved for future paid verification and must expire.';

COMMENT ON COLUMN public.profile_verifications.expires_at IS
  'NULL only for permanent official grants. Paid grants require an explicit expiry.';

COMMENT ON COLUMN public.profile_verifications.internal_note IS
  'Private administrative note; must never be returned by public profile APIs.';

ALTER TABLE public.profile_verifications
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.profile_verifications
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.profile_verifications
  TO service_role;
