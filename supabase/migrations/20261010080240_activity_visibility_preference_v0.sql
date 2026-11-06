BEGIN;

ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS activity_visibility
  text NOT NULL DEFAULT 'public';

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_settings_activity_visibility_check'
      AND conrelid = 'public.user_settings'::regclass
  ) THEN
    ALTER TABLE public.user_settings
    ADD CONSTRAINT user_settings_activity_visibility_check
    CHECK (
      activity_visibility IN (
        'public',
        'private',
        'confidential'
      )
    );
  END IF;
END;
$migration$;

COMMENT ON COLUMN public.user_settings.activity_visibility IS
  'Controls the user-facing Activity timeline. public permits approved public activity on profiles; private restricts activity history to its owner; confidential suppresses the timeline from all user-facing views. Does not change content visibility or protected system records.';

NOTIFY pgrst, 'reload schema';

COMMIT;