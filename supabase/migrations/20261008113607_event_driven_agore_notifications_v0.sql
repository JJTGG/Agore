ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS event_id uuid,
  ADD COLUMN IF NOT EXISTS push_sent_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notifications_event_id_fkey'
      AND conrelid = 'public.notifications'::regclass
  ) THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_event_id_fkey
      FOREIGN KEY (event_id)
      REFERENCES private.agore_events(event_id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_event_recipient_uidx
  ON public.notifications (event_id, recipient_id)
  WHERE event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS notifications_event_idx
  ON public.notifications (event_id)
  WHERE event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS notifications_recipient_created_at_idx
  ON public.notifications (recipient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh_key text NOT NULL,
  auth_key text NOT NULL,
  expiration_time bigint,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.push_subscriptions
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subscriptions_select_self
ON public.push_subscriptions;

CREATE POLICY push_subscriptions_select_self
ON public.push_subscriptions
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS push_subscriptions_insert_self
ON public.push_subscriptions;

CREATE POLICY push_subscriptions_insert_self
ON public.push_subscriptions
FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS push_subscriptions_update_self
ON public.push_subscriptions;

CREATE POLICY push_subscriptions_update_self
ON public.push_subscriptions
FOR UPDATE
TO authenticated
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS push_subscriptions_delete_self
ON public.push_subscriptions;

CREATE POLICY push_subscriptions_delete_self
ON public.push_subscriptions
FOR DELETE
TO authenticated
USING ((SELECT auth.uid()) = user_id);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
  ON public.push_subscriptions (user_id);

DROP TRIGGER IF EXISTS push_subscriptions_set_updated_at
ON public.push_subscriptions;

CREATE TRIGGER push_subscriptions_set_updated_at
BEFORE UPDATE
ON public.push_subscriptions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION private.agore_insert_notification_from_event(
  p_event_id uuid,
  p_recipient_id uuid,
  p_actor_id uuid,
  p_type text,
  p_entity_id uuid,
  p_data jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  notifications_enabled boolean;
BEGIN
  IF p_recipient_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_actor_id IS NOT NULL
     AND p_actor_id = p_recipient_id
  THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = p_recipient_id
      AND p.account_status = 'active'
  ) THEN
    RETURN false;
  END IF;

  SELECT CASE p_type
    WHEN 'follow' THEN np.follows
    WHEN 'reaction' THEN np.reactions
    WHEN 'comment' THEN np.comments
    WHEN 'repost' THEN np.reposts
    WHEN 'message' THEN np.messages
    WHEN 'group_activity' THEN np.group_activity
    ELSE false
  END
  INTO notifications_enabled
  FROM public.notification_preferences AS np
  WHERE np.user_id = p_recipient_id;

  notifications_enabled :=
    COALESCE(notifications_enabled, true);

  IF NOT notifications_enabled THEN
    RETURN false;
  END IF;

  IF p_actor_id IS NOT NULL
     AND p_type IN (
       'follow',
       'reaction',
       'comment',
       'repost'
     )
     AND EXISTS (
       SELECT 1
       FROM public.blocks AS b
       WHERE (b.blocker_id = p_recipient_id
              AND b.blocked_id = p_actor_id)
          OR (b.blocker_id = p_actor_id
              AND b.blocked_id = p_recipient_id)
     )
  THEN
    RETURN false;
  END IF;

  IF p_type = 'message'
     AND EXISTS (
       SELECT 1
       FROM public.conversations AS c
       WHERE c.id = p_entity_id
         AND c.type = 'direct'
         AND private.agore_direct_conversation_blocked(
           c.id,
           p_recipient_id
         )
     )
  THEN
    RETURN false;
  END IF;

  INSERT INTO public.notifications (
    event_id,
    recipient_id,
    actor_id,
    type,
    entity_id,
    data
  )
  VALUES (
    p_event_id,
    p_recipient_id,
    p_actor_id,
    p_type,
    p_entity_id,
    COALESCE(p_data, '{}'::jsonb)
  )
  ON CONFLICT (
    event_id,
    recipient_id
  )
  WHERE event_id IS NOT NULL
  DO NOTHING;

  RETURN true;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING
      'Agore notification derivation failed for event %: %',
      p_event_id,
      SQLERRM;

    RETURN false;
END;
$function$;

REVOKE ALL
ON FUNCTION private.agore_insert_notification_from_event(
  uuid,
  uuid,
  uuid,
  text,
  uuid,
  jsonb
)
FROM PUBLIC, anon, authenticated;

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

DROP TRIGGER IF EXISTS agore_notify_from_event
ON private.agore_events;

CREATE TRIGGER agore_notify_from_event
AFTER INSERT
ON private.agore_events
FOR EACH ROW
EXECUTE FUNCTION private.agore_notify_from_event();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime
      ADD TABLE public.notifications;
  END IF;
END
$$;