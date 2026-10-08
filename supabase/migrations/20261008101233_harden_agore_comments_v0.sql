-- Agore V0 comment hardening.
-- Structural changes remain server-controlled; normal authenticated users can
-- only create valid comments/replies and edit/delete their own comment content.

CREATE INDEX IF NOT EXISTS comments_post_created_at_id_idx
  ON public.comments (post_id, created_at, id);

CREATE INDEX IF NOT EXISTS comments_parent_comment_id_idx
  ON public.comments (parent_comment_id);

CREATE INDEX IF NOT EXISTS comments_author_id_idx
  ON public.comments (author_id);

CREATE OR REPLACE FUNCTION private.agore_validate_comment_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid;
  post_author_id uuid;
  parent_post_id uuid;
  parent_parent_id uuid;
BEGIN
  actor_id := auth.uid();

  -- Trusted server-side/admin operations do not carry a user JWT.
  IF actor_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.author_id IS DISTINCT FROM actor_id THEN
      RAISE EXCEPTION 'Comment author must match the authenticated user.'
        USING ERRCODE = '42501';
    END IF;

    SELECT p.author_id
      INTO post_author_id
    FROM public.posts AS p
    JOIN public.profiles AS post_author
      ON post_author.id = p.author_id
     AND post_author.account_status = 'active'
    WHERE p.id = NEW.post_id
      AND p.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.blocks AS b
        WHERE (b.blocker_id = actor_id AND b.blocked_id = p.author_id)
           OR (b.blocker_id = p.author_id AND b.blocked_id = actor_id)
      );

    IF post_author_id IS NULL THEN
      RAISE EXCEPTION 'Comment target post is not available.'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.parent_comment_id IS NOT NULL THEN
      SELECT c.post_id, c.parent_comment_id
        INTO parent_post_id, parent_parent_id
      FROM public.comments AS c
      JOIN public.profiles AS comment_author
        ON comment_author.id = c.author_id
       AND comment_author.account_status = 'active'
      WHERE c.id = NEW.parent_comment_id
        AND c.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.blocks AS b
          WHERE (b.blocker_id = actor_id AND b.blocked_id = c.author_id)
             OR (b.blocker_id = c.author_id AND b.blocked_id = actor_id)
        );

      IF parent_post_id IS NULL THEN
        RAISE EXCEPTION 'Parent comment is not available.'
          USING ERRCODE = '42501';
      END IF;

      IF parent_post_id IS DISTINCT FROM NEW.post_id THEN
        RAISE EXCEPTION 'Parent comment must belong to the same post.'
          USING ERRCODE = '23514';
      END IF;

      IF parent_parent_id IS NOT NULL THEN
        RAISE EXCEPTION 'Replies cannot be nested beyond one level.'
          USING ERRCODE = '23514';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.author_id IS DISTINCT FROM OLD.author_id
       OR NEW.post_id IS DISTINCT FROM OLD.post_id
       OR NEW.parent_comment_id IS DISTINCT FROM OLD.parent_comment_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Comment identity and thread placement cannot be changed.'
        USING ERRCODE = '42501';
    END IF;

    IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
      RAISE EXCEPTION 'Deleted comments cannot be restored.'
        USING ERRCODE = '42501';
    END IF;

    IF OLD.deleted_at IS NOT NULL
       AND NEW.content IS DISTINCT FROM OLD.content THEN
      RAISE EXCEPTION 'Deleted comments cannot be edited.'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.agore_validate_comment_write() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.agore_validate_comment_write() TO authenticated;

DROP TRIGGER IF EXISTS comments_validate_write ON public.comments;

CREATE TRIGGER comments_validate_write
BEFORE INSERT OR UPDATE ON public.comments
FOR EACH ROW
EXECUTE FUNCTION private.agore_validate_comment_write();

DROP POLICY IF EXISTS comments_select_visible ON public.comments;

CREATE POLICY comments_select_visible
ON public.comments
FOR SELECT
TO authenticated
USING (
  deleted_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.posts AS p
    JOIN public.profiles AS post_author
      ON post_author.id = p.author_id
     AND post_author.account_status = 'active'
    WHERE p.id = comments.post_id
      AND p.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.blocks AS b
        WHERE (b.blocker_id = (SELECT auth.uid()) AND b.blocked_id = p.author_id)
           OR (b.blocker_id = p.author_id AND b.blocked_id = (SELECT auth.uid()))
      )
  )
  AND EXISTS (
    SELECT 1
    FROM public.profiles AS comment_author
    WHERE comment_author.id = comments.author_id
      AND comment_author.account_status = 'active'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.blocks AS b
    WHERE (b.blocker_id = (SELECT auth.uid()) AND b.blocked_id = comments.author_id)
       OR (b.blocker_id = comments.author_id AND b.blocked_id = (SELECT auth.uid()))
  )
);

DROP POLICY IF EXISTS comments_insert_self ON public.comments;

CREATE POLICY comments_insert_self
ON public.comments
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT auth.uid()) = author_id
  AND EXISTS (
    SELECT 1
    FROM public.profiles AS author
    WHERE author.id = author_id
      AND author.account_status = 'active'
  )
);

DROP POLICY IF EXISTS comments_update_self ON public.comments;

CREATE POLICY comments_update_self
ON public.comments
FOR UPDATE
TO authenticated
USING ((SELECT auth.uid()) = author_id)
WITH CHECK ((SELECT auth.uid()) = author_id);

DROP POLICY IF EXISTS comments_delete_self ON public.comments;