-- Agoré V0: account-type foundation.
-- Account type describes the account's category, not its trust status.

ALTER TABLE public.profiles
  ADD COLUMN account_type text NOT NULL DEFAULT 'personal';

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_account_type_check
  CHECK (
    account_type IN (
      'personal',
      'creator',
      'business',
      'organization',
      'institution'
    )
  );

COMMENT ON COLUMN public.profiles.account_type IS
  'Descriptive account category. This field does not grant permissions or confer verification status.';