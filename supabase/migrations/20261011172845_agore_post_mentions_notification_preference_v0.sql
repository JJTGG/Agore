ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS mentions boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.notification_preferences.mentions IS
  'Whether this account receives in-app and push notifications when mentioned in a post.';