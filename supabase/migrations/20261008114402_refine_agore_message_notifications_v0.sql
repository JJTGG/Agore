CREATE OR REPLACE FUNCTION private.agore_notify_from_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  recipient_id_value uuid;
  post_author_id uuid;
  comment_post_id uuid;
  comment_parent_id uuid;
  parent_author_id uuid;
  conversation_type_value text;
  target_user_id uuid;
  message_conversation_id uuid;
  message_content text;
BEGIN
  IF NEW.event_type = 'follow.created' THEN

    PERFORM private.agore_insert_notification_from_event(
      NEW.event_id,
      NEW.target_id,
      NEW.actor_id,
      'follow',
      NEW.target_id,
      NEW.data
    );

  ELSIF NEW.event_type = 'post.reaction.added' THEN

    SELECT p.author_id
      INTO post_author_id
    FROM public.posts AS p
    WHERE p.id = NEW.subject_id;

    PERFORM private.agore_insert_notification_from_event(
      NEW.event_id,
      post_author_id,
      NEW.actor_id,
      'reaction',
      NEW.subject_id,
      NEW.data
    );

  ELSIF NEW.event_type = 'repost.created' THEN

    SELECT p.author_id
      INTO post_author_id
    FROM public.posts AS p
    WHERE p.id = NEW.subject_id;

    PERFORM private.agore_insert_notification_from_event(
      NEW.event_id,
      post_author_id,
      NEW.actor_id,
      'repost',
      NEW.subject_id,
      NEW.data
    );

  ELSIF NEW.event_type = 'comment.created' THEN

    comment_post_id :=
      COALESCE(
        NULLIF(NEW.data ->> 'post_id', '')::uuid,
        NEW.target_id
      );

    SELECT
      p.author_id,
      c.parent_comment_id
    INTO
      post_author_id,
      comment_parent_id
    FROM public.comments AS c
    JOIN public.posts AS p
      ON p.id = c.post_id
    WHERE c.id = NEW.subject_id;

    PERFORM private.agore_insert_notification_from_event(
      NEW.event_id,
      post_author_id,
      NEW.actor_id,
      'comment',
      comment_post_id,
      NEW.data
    );

    IF comment_parent_id IS NOT NULL THEN
      SELECT c.author_id
        INTO parent_author_id
      FROM public.comments AS c
      WHERE c.id = comment_parent_id
        AND c.deleted_at IS NULL;

      IF parent_author_id IS NOT NULL
         AND parent_author_id IS DISTINCT FROM post_author_id
      THEN
        PERFORM private.agore_insert_notification_from_event(
          NEW.event_id,
          parent_author_id,
          NEW.actor_id,
          'comment',
          comment_post_id,
          jsonb_build_object(
            'comment_id',
            NEW.subject_id,
            'post_id',
            comment_post_id,
            'parent_comment_id',
            comment_parent_id,
            'is_reply',
            true
          )
        );
      END IF;
    END IF;

  ELSIF NEW.event_type = 'message.created' THEN

    SELECT
      m.conversation_id,
      m.content
    INTO
      message_conversation_id,
      message_content
    FROM public.messages AS m
    WHERE m.id = NEW.subject_id
      AND m.deleted_at IS NULL;

    -- Media, voice and attachment messages are initially inserted
    -- as NULL-content placeholders. Their notification is emitted
    -- from message.media_added after finalization.
    IF message_conversation_id IS NOT NULL
       AND message_content IS NOT NULL
    THEN
      FOR recipient_id_value IN
        SELECT cm.user_id
        FROM public.conversation_members AS cm
        JOIN public.profiles AS p
          ON p.id = cm.user_id
         AND p.account_status = 'active'
        WHERE cm.conversation_id = message_conversation_id
          AND cm.left_at IS NULL
          AND cm.user_id IS DISTINCT FROM NEW.actor_id
      LOOP
        PERFORM private.agore_insert_notification_from_event(
          NEW.event_id,
          recipient_id_value,
          NEW.actor_id,
          'message',
          message_conversation_id,
          NEW.data
        );
      END LOOP;
    END IF;

  ELSIF NEW.event_type = 'message.media_added' THEN

    SELECT
      m.conversation_id
    INTO
      message_conversation_id
    FROM public.messages AS m
    WHERE m.id = NEW.subject_id
      AND m.deleted_at IS NULL;

    IF message_conversation_id IS NOT NULL THEN
      FOR recipient_id_value IN
        SELECT cm.user_id
        FROM public.conversation_members AS cm
        JOIN public.profiles AS p
          ON p.id = cm.user_id
         AND p.account_status = 'active'
        WHERE cm.conversation_id = message_conversation_id
          AND cm.left_at IS NULL
          AND cm.user_id IS DISTINCT FROM NEW.actor_id
      LOOP
        PERFORM private.agore_insert_notification_from_event(
          NEW.event_id,
          recipient_id_value,
          NEW.actor_id,
          'message',
          message_conversation_id,
          NEW.data
        );
      END LOOP;
    END IF;

  ELSIF NEW.event_type IN (
    'conversation.member_added',
    'conversation.member_removed',
    'conversation.member_role_changed',
    'conversation.updated'
  ) THEN

    SELECT c.type
      INTO conversation_type_value
    FROM public.conversations AS c
    WHERE c.id = NEW.subject_id;

    IF conversation_type_value = 'group' THEN

      target_user_id :=
        NULLIF(
          NEW.data ->> 'user_id',
          ''
        )::uuid;

      FOR recipient_id_value IN
        SELECT cm.user_id
        FROM public.conversation_members AS cm
        JOIN public.profiles AS p
          ON p.id = cm.user_id
         AND p.account_status = 'active'
        WHERE cm.conversation_id = NEW.subject_id
          AND cm.left_at IS NULL
          AND (
            cm.user_id IS DISTINCT FROM NEW.actor_id
            OR NEW.actor_id IS NULL
          )
      LOOP
        PERFORM private.agore_insert_notification_from_event(
          NEW.event_id,
          recipient_id_value,
          NEW.actor_id,
          'group_activity',
          NEW.subject_id,
          NEW.data
        );
      END LOOP;

    END IF;
  END IF;

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING
      'Agore notification event consumer failed for event %: %',
      NEW.event_id,
      SQLERRM;

    RETURN NEW;
END;
$function$;

REVOKE ALL
ON FUNCTION private.agore_notify_from_event()
FROM PUBLIC, anon, authenticated;