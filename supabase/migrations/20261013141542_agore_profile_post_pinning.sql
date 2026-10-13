-- Agoré: allow one post to be pinned to its author's profile.
-- Pin ownership is enforced by RLS.
-- Soft-deleting a post automatically clears its pin.

CREATE TABLE IF NOT EXISTS public.profile_pinned_posts (
  user_id uuid PRIMARY KEY
    REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id uuid NOT NULL
    REFERENCES public.posts(id) ON DELETE CASCADE,
  pinned_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profile_pinned_posts_post_id_idx
  ON public.profile_pinned_posts(post_id);

ALTER TABLE public.profile_pinned_posts
  ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.profile_pinned_posts
  TO authenticated;

-- Users can read their own pin. Other active users can read
-- a pin only when the profile and post are visible to them.
DROP POLICY IF EXISTS profile_pinned_posts_select_visible
  ON public.profile_pinned_posts;

CREATE POLICY profile_pinned_posts_select_visible
ON public.profile_pinned_posts
FOR SELECT
TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR (
    EXISTS (
      SELECT 1
      FROM public.profiles AS viewer
      WHERE viewer.id = (SELECT auth.uid())
        AND viewer.account_status = 'active'
    )
    AND EXISTS (
      SELECT 1
      FROM public.profiles AS pinned_profile
      JOIN public.posts AS pinned_post
        ON pinned_post.id = profile_pinned_posts.post_id
       AND pinned_post.author_id = profile_pinned_posts.user_id
       AND pinned_post.deleted_at IS NULL
      WHERE pinned_profile.id = profile_pinned_posts.user_id
        AND pinned_profile.account_status = 'active'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.blocks AS b
      WHERE (
        b.blocker_id = (SELECT auth.uid())
        AND b.blocked_id = profile_pinned_posts.user_id
      )
      OR (
        b.blocked_id = (SELECT auth.uid())
        AND b.blocker_id = profile_pinned_posts.user_id
      )
    )
  )
);

-- A user may pin only their own active, non-deleted post.
DROP POLICY IF EXISTS profile_pinned_posts_insert_own
  ON public.profile_pinned_posts;

CREATE POLICY profile_pinned_posts_insert_own
ON public.profile_pinned_posts
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.profiles AS owner
    JOIN public.posts AS target
      ON target.author_id = owner.id
    WHERE owner.id = (SELECT auth.uid())
      AND owner.account_status = 'active'
      AND target.id = profile_pinned_posts.post_id
      AND target.deleted_at IS NULL
  )
);

DROP POLICY IF EXISTS profile_pinned_posts_update_own
  ON public.profile_pinned_posts;

CREATE POLICY profile_pinned_posts_update_own
ON public.profile_pinned_posts
FOR UPDATE
TO authenticated
USING (
  user_id = (SELECT auth.uid())
)
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.profiles AS owner
    JOIN public.posts AS target
      ON target.author_id = owner.id
    WHERE owner.id = (SELECT auth.uid())
      AND owner.account_status = 'active'
      AND target.id = profile_pinned_posts.post_id
      AND target.deleted_at IS NULL
  )
);

DROP POLICY IF EXISTS profile_pinned_posts_delete_own
  ON public.profile_pinned_posts;

CREATE POLICY profile_pinned_posts_delete_own
ON public.profile_pinned_posts
FOR DELETE
TO authenticated
USING (
  user_id = (SELECT auth.uid())
);

-- Keep the pin table consistent when a post is soft-deleted.
CREATE OR REPLACE FUNCTION
  public.agore_clear_profile_pin_for_deleted_post()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  DELETE FROM public.profile_pinned_posts
  WHERE post_id = NEW.id;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION
  public.agore_clear_profile_pin_for_deleted_post()
  FROM PUBLIC;

DROP TRIGGER IF EXISTS posts_clear_profile_pin_after_soft_delete
  ON public.posts;

CREATE TRIGGER posts_clear_profile_pin_after_soft_delete
AFTER UPDATE OF deleted_at ON public.posts
FOR EACH ROW
WHEN (
  OLD.deleted_at IS NULL
  AND NEW.deleted_at IS NOT NULL
)
EXECUTE FUNCTION
  public.agore_clear_profile_pin_for_deleted_post();

COMMENT ON TABLE public.profile_pinned_posts IS
  'Stores the single post pinned to each Agoré profile.';