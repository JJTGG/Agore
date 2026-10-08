-- Agore V0 messaging hardening.
--
-- This migration:
--   1. validates message ownership and conversation placement;
--   2. prevents replies across conversations;
--   3. prevents replies to deleted messages;
--   4. prevents editing/restoring deleted messages;
--   5. validates message-media ownership and membership;
--   6. verifies message-media metadata against Storage;
--   7. prevents reactions from targeting deleted/inaccessible messages;
--   8. prevents reaction BOLA by requiring active conversation membership;
--   9. hides deleted messages from normal message reads.

CREATE OR REPLACE FUNCTION private.agore_validate_message_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  actor_id uuid;
  conversation_type text;
  participant_a uuid;
  participant_b uuid;
  reply_conversation_id uuid;
  reply_deleted_at timestamptz;
BEGIN
  actor_id := auth.uid();

  -- Trusted server-side/admin writes do not carry a user JWT.
  IF actor_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.sender_id IS DISTINCT FROM actor_id THEN
      RAISE EXCEPTION 'Message sender must match the authenticated user.'
        USING ERRCODE = '42501';
    END IF;

    SELECT
      c.type,
      c.direct_participant_a,
      c.direct_participant_b
    INTO
      conversation_type,
      participant_a,
      participant_b
    FROM public.conversations AS c
    WHERE c.id = NEW.conversation_id;

    IF conversation_type IS NULL THEN
      RAISE EXCEPTION 'Conversation not found.'
        USING ERRCODE = '23503';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.conversation_members AS cm
      WHERE cm.conversation_id = NEW.conversation_id
        AND cm.user_id = actor_id
        AND cm.left_at IS NULL
    ) THEN
      RAISE EXCEPTION 'You are not an active member of this conversation.'
        USING ERRCODE = '42501';
    END IF;

    IF conversation_type = 'direct'
       AND private.agore_direct_conversation_blocked(
         NEW.conversation_id,
         actor_id
       )
    THEN
      RAISE EXCEPTION
        'Messaging is unavailable because one of the participants has blocked the other.'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.reply_to_message_id IS NOT NULL THEN
      SELECT
        m.conversation_id,
        m.deleted_at
      INTO
        reply_conversation_id,
        reply_deleted_at
      FROM public.messages AS m
      WHERE m.id = NEW.reply_to_message_id;

      IF reply_conversation_id IS NULL THEN
        RAISE EXCEPTION 'Reply target message was not found.'
          USING ERRCODE = '23503';
      END IF;

      IF reply_conversation_id IS DISTINCT FROM NEW.conversation_id THEN
        RAISE EXCEPTION 'Reply target must belong to the same conversation.'
          USING ERRCODE = '23514';
      END IF;

      IF reply_deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'Deleted messages cannot be replied to.'
          USING ERRCODE = '23514';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.sender_id IS DISTINCT FROM OLD.sender_id
       OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
       OR NEW.reply_to_message_id IS DISTINCT FROM OLD.reply_to_message_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION
        'Message identity and conversation placement cannot be changed.'
        USING ERRCODE = '42501';
    END IF;

    IF actor_id IS NOT NULL
       AND private.agore_direct_conversation_blocked(
         NEW.conversation_id,
         actor_id
       )
    THEN
      RAISE EXCEPTION
        'Messaging is unavailable because one of the participants has blocked the other.'
        USING ERRCODE = '42501';
    END IF;

    IF OLD.deleted_at IS NOT NULL
       AND NEW.deleted_at IS NULL
    THEN
      RAISE EXCEPTION 'Deleted messages cannot be restored.'
        USING ERRCODE = '42501';
    END IF;

    IF OLD.deleted_at IS NOT NULL
       AND NEW.content IS DISTINCT FROM OLD.content
    THEN
      RAISE EXCEPTION 'Deleted messages cannot be edited.'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL
ON FUNCTION private.agore_validate_message_write()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION private.agore_validate_message_write()
TO authenticated;


CREATE OR REPLACE FUNCTION private.agore_validate_message_media_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private', 'storage'
AS $function$
DECLARE
  actor_id uuid;
  message_sender_id uuid;
  message_conversation_id uuid;
  message_deleted_at timestamptz;
  object_size bigint;
  object_mime text;
BEGIN
  actor_id := auth.uid();

  SELECT
    m.sender_id,
    m.conversation_id,
    m.deleted_at
  INTO
    message_sender_id,
    message_conversation_id,
    message_deleted_at
  FROM public.messages AS m
  WHERE m.id = NEW.message_id;

  IF message_sender_id IS NULL
     OR message_conversation_id IS NULL
  THEN
    RAISE EXCEPTION 'Message not found.'
      USING ERRCODE = '23503';
  END IF;

  IF message_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Deleted messages cannot receive media.'
      USING ERRCODE = '42501';
  END IF;

  IF actor_id IS NOT NULL THEN
    IF message_sender_id IS DISTINCT FROM actor_id THEN
      RAISE EXCEPTION
        'Message media owner must match the authenticated user.'
        USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.conversation_members AS cm
      WHERE cm.conversation_id = message_conversation_id
        AND cm.user_id = actor_id
        AND cm.left_at IS NULL
    ) THEN
      RAISE EXCEPTION
        'You are not an active member of this conversation.'
        USING ERRCODE = '42501';
    END IF;

    IF private.agore_direct_conversation_blocked(
      message_conversation_id,
      actor_id
    ) THEN
      RAISE EXCEPTION
        'Messaging is unavailable because one of the participants has blocked the other.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.size_bytes > 15 * 1024 * 1024 THEN
    RAISE EXCEPTION
      'Message media exceeds the 15 MB limit.'
      USING ERRCODE = '22003';
  END IF;

  SELECT
    (o.metadata ->> 'size')::bigint,
    lower(o.metadata ->> 'mimetype')
  INTO
    object_size,
    object_mime
  FROM storage.objects AS o
  WHERE o.bucket_id = 'message-media'
    AND o.name = NEW.storage_path
  LIMIT 1;

  IF object_size IS NULL
     OR object_mime IS NULL
  THEN
    RAISE EXCEPTION
      'The referenced message media object does not exist.'
      USING ERRCODE = '23503';
  END IF;

  IF object_size IS DISTINCT FROM NEW.size_bytes THEN
    RAISE EXCEPTION
      'Message media size does not match the stored object.'
      USING ERRCODE = '22000';
  END IF;

  IF object_mime IS DISTINCT FROM lower(NEW.mime_type) THEN
    RAISE EXCEPTION
      'Message media MIME type does not match the stored object.'
      USING ERRCODE = '22000';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL
ON FUNCTION private.agore_validate_message_media_write()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION private.agore_validate_message_media_write()
TO authenticated;


DROP TRIGGER IF EXISTS messages_validate_write
ON public.messages;

CREATE TRIGGER messages_validate_write
BEFORE INSERT OR UPDATE
ON public.messages
FOR EACH ROW
EXECUTE FUNCTION private.agore_validate_message_write();


DROP TRIGGER IF EXISTS message_media_validate_write
ON public.message_media;

CREATE TRIGGER message_media_validate_write
BEFORE INSERT OR UPDATE
ON public.message_media
FOR EACH ROW
EXECUTE FUNCTION private.agore_validate_message_media_write();


DROP POLICY IF EXISTS messages_select_member
ON public.messages;

CREATE POLICY messages_select_member
ON public.messages
FOR SELECT
TO authenticated
USING (
  deleted_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.conversation_members AS cm
    WHERE cm.conversation_id = messages.conversation_id
      AND cm.user_id = (SELECT auth.uid())
      AND cm.left_at IS NULL
  )
  AND NOT private.agore_direct_conversation_blocked(
    conversation_id,
    (SELECT auth.uid())
  )
);


DROP POLICY IF EXISTS message_reactions_select_member
ON public.message_reactions;

CREATE POLICY message_reactions_select_member
ON public.message_reactions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.messages AS m
    JOIN public.conversation_members AS cm
      ON cm.conversation_id = m.conversation_id
    WHERE m.id = message_reactions.message_id
      AND m.deleted_at IS NULL
      AND cm.user_id = (SELECT auth.uid())
      AND cm.left_at IS NULL
      AND NOT private.agore_direct_conversation_blocked(
        m.conversation_id,
        (SELECT auth.uid())
      )
  )
);


DROP POLICY IF EXISTS message_reactions_insert_self
ON public.message_reactions;

CREATE POLICY message_reactions_insert_self
ON public.message_reactions
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.messages AS m
    JOIN public.conversation_members AS cm
      ON cm.conversation_id = m.conversation_id
    WHERE m.id = message_reactions.message_id
      AND m.deleted_at IS NULL
      AND cm.user_id = (SELECT auth.uid())
      AND cm.left_at IS NULL
      AND NOT private.agore_direct_conversation_blocked(
        m.conversation_id,
        (SELECT auth.uid())
      )
  )
);


DROP POLICY IF EXISTS message_reactions_update_self
ON public.message_reactions;

CREATE POLICY message_reactions_update_self
ON public.message_reactions
FOR UPDATE
TO authenticated
USING (
  user_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.messages AS m
    JOIN public.conversation_members AS cm
      ON cm.conversation_id = m.conversation_id
    WHERE m.id = message_reactions.message_id
      AND m.deleted_at IS NULL
      AND cm.user_id = (SELECT auth.uid())
      AND cm.left_at IS NULL
      AND NOT private.agore_direct_conversation_blocked(
        m.conversation_id,
        (SELECT auth.uid())
      )
  )
)
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.messages AS m
    JOIN public.conversation_members AS cm
      ON cm.conversation_id = m.conversation_id
    WHERE m.id = message_reactions.message_id
      AND m.deleted_at IS NULL
      AND cm.user_id = (SELECT auth.uid())
      AND cm.left_at IS NULL
      AND NOT private.agore_direct_conversation_blocked(
        m.conversation_id,
        (SELECT auth.uid())
      )
  )
);


DROP POLICY IF EXISTS message_reactions_delete_self
ON public.message_reactions;

CREATE POLICY message_reactions_delete_self
ON public.message_reactions
FOR DELETE
TO authenticated
USING (
  user_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.messages AS m
    JOIN public.conversation_members AS cm
      ON cm.conversation_id = m.conversation_id
    WHERE m.id = message_reactions.message_id
      AND m.deleted_at IS NULL
      AND cm.user_id = (SELECT auth.uid())
      AND cm.left_at IS NULL
      AND NOT private.agore_direct_conversation_blocked(
        m.conversation_id,
        (SELECT auth.uid())
      )
  )
);