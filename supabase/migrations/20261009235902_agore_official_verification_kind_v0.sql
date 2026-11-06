
-- RECONSTRUCTED HISTORICAL MIGRATION
-- Original SQL source was not recovered from the accessible Git history.
--
-- Evidence:
--   Previous migration: 20261009171254_agore_verification_foundation_v0.sql
--   Production constraints allow: agore_official, paid
--   Production values currently contain both kinds.
--
-- This migration is for reproducing the historical schema in a clean
-- development database. It must not be replayed against production,
-- where this migration is already recorded as applied.

BEGIN;

-- Remove the original constraints before changing the stored value.
ALTER TABLE public.profile_verifications
  DROP CONSTRAINT IF EXISTS profile_verifications_verification_kind_check;

ALTER TABLE public.profile_verifications
  DROP CONSTRAINT IF EXISTS profile_verifications_expiration_check;

-- Rename the original permanent verification kind.
UPDATE public.profile_verifications
SET verification_kind = 'agore_official'
WHERE verification_kind = 'official';

-- Restore the current allowed verification kinds.
ALTER TABLE public.profile_verifications
  ADD CONSTRAINT profile_verifications_verification_kind_check
  CHECK (verification_kind IN ('agore_official', 'paid'));

-- Agoré Official is permanent; paid verification must expire.
ALTER TABLE public.profile_verifications
  ADD CONSTRAINT profile_verifications_expiration_check
  CHECK (
    (
      verification_kind = 'agore_official'
      AND expires_at IS NULL
    )
    OR
    (
      verification_kind = 'paid'
      AND expires_at IS NOT NULL
    )
  );

COMMIT;
