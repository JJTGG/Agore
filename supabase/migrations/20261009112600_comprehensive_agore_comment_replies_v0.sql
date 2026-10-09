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
  parent_created_at timestamptz;
BEGIN
  actor_id := auth.uid();

  -- Trusted administrative operations do not necessarily carry a user JWT.
  IF actor_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.author_id IS DISTINCT FROM actor_id THEN
      RAISE EXCEPTION
        'Comment author must match the authenticated user.'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.content IS NULL
       OR char_length(btrim(NEW.content)) < 1
       OR char_length(btrim(NEW.content)) > 1000
    THEN
      RAISE EXCEPTION
        'Comments must contain between 1 and 1000 characters.'
        USING ERRCODE = '23514';
    END IF;

    -- Server-owned timestamps prevent clients from manipulating comment
    -- ordering. The post's existing RLS rules remain in effect.
    NEW.created_at := clock_timestamp();
    NEW.updated_at := NEW.created_at;

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
        WHERE (
          b.blocker_id = actor_id
          AND b.blocked_id = p.author_id
        )
        OR (
          b.blocker_id = p.author_id
          AND b.blocked_id = actor_id
        )
      );

    IF post_author_id IS NULL THEN
      RAISE EXCEPTION
        'Comment target post is not available.'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.parent_comment_id IS NOT NULL THEN
      SELECT
        c.post_id,
        c.parent_comment_id,
        c.created_at
      INTO
        parent_post_id,
        parent_parent_id,
        parent_created_at
      FROM public.comments AS c
      JOIN public.profiles AS comment_author
        ON comment_author.id = c.author_id
       AND comment_author.account_status = 'active'
      WHERE c.id = NEW.parent_comment_id
        AND c.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.blocks AS b
          WHERE (
            b.blocker_id = actor_id
            AND b.blocked_id = c.author_id
          )
          OR (
            b.blocker_id = c.author_id
            AND b.blocked_id = actor_id
          )
        )
      FOR KEY SHARE OF c;

      IF parent_post_id IS NULL THEN
        RAISE EXCEPTION
          'Parent comment is not available.'
          USING ERRCODE = '42501';
      END IF;

      IF parent_post_id IS DISTINCT FROM NEW.post_id THEN
        RAISE EXCEPTION
          'Parent comment must belong to the same post.'
          USING ERRCODE = '23514';
      END IF;

      IF parent_parent_id IS NOT NULL THEN
        RAISE EXCEPTION
          'Replies cannot be nested beyond one level.'
          USING ERRCODE = '23514';
      END IF;

      -- Guarantee that a reply sorts after its parent, including when
      -- timestamps would otherwise be identical.
      NEW.created_at := GREATEST(
        NEW.created_at,
        parent_created_at + interval '1 microsecond'
      );

      NEW.updated_at := NEW.created_at;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.author_id IS DISTINCT FROM OLD.author_id
       OR NEW.post_id IS DISTINCT FROM OLD.post_id
       OR NEW.parent_comment_id IS DISTINCT FROM OLD.parent_comment_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION
        'Comment identity and thread placement cannot be changed.'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.content IS DISTINCT FROM OLD.content THEN
      IF NEW.content IS NULL
         OR char_length(btrim(NEW.content)) < 1
         OR char_length(btrim(NEW.content)) > 1000
      THEN
        RAISE EXCEPTION
          'Comments must contain between 1 and 1000 characters.'
          USING ERRCODE = '23514';
      END IF;
    END IF;

    IF OLD.deleted_at IS NOT NULL
       AND NEW.deleted_at IS NULL
    THEN
      RAISE EXCEPTION
        'Deleted comments cannot be restored.'
        USING ERRCODE = '42501';
    END IF;

    IF OLD.deleted_at IS NOT NULL
       AND NEW.content IS DISTINCT FROM OLD.content
    THEN
      RAISE EXCEPTION
        'Deleted comments cannot be edited.'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION private.agore_validate_comment_write()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION private.agore_validate_comment_write()
TO authenticated;


CREATE OR REPLACE FUNCTION public.agore_delete_comment_tree_v0(
  p_comment_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  target_author_id uuid;
  target_post_id uuid;
  target_parent_comment_id uuid;
  target_deleted_at timestamptz;

  child_ids uuid[] := ARRAY[]::uuid[];
  deleted_ids uuid[] := ARRAY[]::uuid[];

  deletion_time timestamptz := clock_timestamp();
BEGIN
  IF p_comment_id IS NULL OR p_actor_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'invalid_request',
      'deletedCommentIds', '[]'::jsonb
    );
  END IF;

  SELECT
    c.author_id,
    c.post_id,
    c.parent_comment_id,
    c.deleted_at
  INTO
    target_author_id,
    target_post_id,
    target_parent_comment_id,
    target_deleted_at
  FROM public.comments AS c
  WHERE c.id = p_comment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'deletedCommentIds', '[]'::jsonb
    );
  END IF;

  IF target_author_id IS DISTINCT FROM p_actor_id THEN
    RETURN jsonb_build_object(
      'status', 'forbidden',
      'deletedCommentIds', '[]'::jsonb
    );
  END IF;

  -- The API has already authenticated this user. Expose that identity to
  -- database event triggers for the duration of this transaction.
  PERFORM set_config(
    'request.jwt.claim.sub',
    p_actor_id::text,
    true
  );

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', p_actor_id::text,
      'role', 'authenticated'
    )::text,
    true
  );

  IF target_parent_comment_id IS NULL THEN
    -- Include already-deleted replies as well so the client can remove
    -- stale thread items without depending on which pages it has loaded.
    SELECT COALESCE(
      array_agg(c.id ORDER BY c.created_at, c.id),
      ARRAY[]::uuid[]
    )
    INTO child_ids
    FROM public.comments AS c
    WHERE c.parent_comment_id = p_comment_id;

    -- Replies and parent are changed within the same transaction.
    -- Any failure rolls the complete operation back.
    UPDATE public.comments
    SET deleted_at = deletion_time
    WHERE parent_comment_id = p_comment_id
      AND deleted_at IS NULL;

    UPDATE public.comments
    SET deleted_at = deletion_time
    WHERE id = p_comment_id
      AND deleted_at IS NULL;

    deleted_ids := child_ids || ARRAY[p_comment_id];
  ELSE
    UPDATE public.comments
    SET deleted_at = deletion_time
    WHERE id = p_comment_id
      AND deleted_at IS NULL;

    deleted_ids := ARRAY[p_comment_id];
  END IF;

  RETURN jsonb_build_object(
    'status', 'deleted',
    'postId', target_post_id,
    'deletedCommentIds', to_jsonb(deleted_ids)
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.agore_delete_comment_tree_v0(uuid, uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.agore_delete_comment_tree_v0(uuid, uuid)
TO service_role;