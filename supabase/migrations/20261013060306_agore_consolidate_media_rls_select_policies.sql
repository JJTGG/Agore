-- Remove redundant permissive SELECT paths while preserving the original access predicates.
-- message_media: the member SELECT policy already includes the active, unblocked sender.
DROP POLICY IF EXISTS message_media_manage_own_message ON public.message_media;

CREATE POLICY message_media_insert_own_message
ON public.message_media
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.messages m
    WHERE m.id = message_media.message_id
      AND m.sender_id = (SELECT auth.uid())
      AND m.deleted_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM public.conversation_members cm
        WHERE cm.conversation_id = m.conversation_id
          AND cm.user_id = (SELECT auth.uid())
          AND cm.left_at IS NULL
      )
      AND NOT private.agore_direct_conversation_blocked(
        m.conversation_id,
        (SELECT auth.uid())
      )
  )
);

CREATE POLICY message_media_update_own_message
ON public.message_media
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.messages m
    WHERE m.id = message_media.message_id
      AND m.sender_id = (SELECT auth.uid())
      AND m.deleted_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM public.conversation_members cm
        WHERE cm.conversation_id = m.conversation_id
          AND cm.user_id = (SELECT auth.uid())
          AND cm.left_at IS NULL
      )
      AND NOT private.agore_direct_conversation_blocked(
        m.conversation_id,
        (SELECT auth.uid())
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.messages m
    WHERE m.id = message_media.message_id
      AND m.sender_id = (SELECT auth.uid())
      AND m.deleted_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM public.conversation_members cm
        WHERE cm.conversation_id = m.conversation_id
          AND cm.user_id = (SELECT auth.uid())
          AND cm.left_at IS NULL
      )
      AND NOT private.agore_direct_conversation_blocked(
        m.conversation_id,
        (SELECT auth.uid())
      )
  )
);

CREATE POLICY message_media_delete_own_message
ON public.message_media
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.messages m
    WHERE m.id = message_media.message_id
      AND m.sender_id = (SELECT auth.uid())
      AND m.deleted_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM public.conversation_members cm
        WHERE cm.conversation_id = m.conversation_id
          AND cm.user_id = (SELECT auth.uid())
          AND cm.left_at IS NULL
      )
      AND NOT private.agore_direct_conversation_blocked(
        m.conversation_id,
        (SELECT auth.uid())
      )
  )
);

-- post_media: retain the author's existing SELECT access (including their own deleted posts)
-- while combining it with the previous visible-post rule for everyone else.
DROP POLICY IF EXISTS post_media_manage_own_post ON public.post_media;
DROP POLICY IF EXISTS post_media_select_visible_post ON public.post_media;

CREATE POLICY post_media_select_visible_or_owner
ON public.post_media
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.posts p
    WHERE p.id = post_media.post_id
      AND (
        p.author_id = (SELECT auth.uid())
        OR (
          p.deleted_at IS NULL
          AND EXISTS (
            SELECT 1
            FROM public.profiles pr
            WHERE pr.id = p.author_id
              AND pr.account_status = 'active'
          )
        )
      )
  )
);

CREATE POLICY post_media_insert_own_post
ON public.post_media
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.posts p
    WHERE p.id = post_media.post_id
      AND p.author_id = (SELECT auth.uid())
  )
);

CREATE POLICY post_media_update_own_post
ON public.post_media
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.posts p
    WHERE p.id = post_media.post_id
      AND p.author_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.posts p
    WHERE p.id = post_media.post_id
      AND p.author_id = (SELECT auth.uid())
  )
);

CREATE POLICY post_media_delete_own_post
ON public.post_media
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.posts p
    WHERE p.id = post_media.post_id
      AND p.author_id = (SELECT auth.uid())
  )
);
