BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS profile_links jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_location_length_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_location_length_check
  CHECK (
    location IS NULL
    OR char_length(btrim(location)) BETWEEN 1 AND 100
  );

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_profile_links_shape_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_profile_links_shape_check
  CHECK (
    CASE
      WHEN jsonb_typeof(profile_links) = 'array'
      THEN jsonb_array_length(profile_links) <= 5
      ELSE FALSE
    END
  );

COMMENT ON COLUMN public.profiles.location IS
  'Optional public profile location.';

COMMENT ON COLUMN public.profiles.profile_links IS
  'Optional public profile links as an ordered JSON array of label and URL objects; application validation limits it to five links.';

COMMIT;