CREATE TABLE IF NOT EXISTS private.agore_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE NOT NULL,
  event_type text NOT NULL,
  actor_id uuid,
  subject_id uuid,
  target_id uuid,
  visibility_class text NOT NULL
    CHECK (
      visibility_class IN (
        'PUBLIC',
        'PRIVATE',
        'CONFIDENTIAL',
        'RESTRICTED'
      )
    ),
  source_table text NOT NULL,
  source_operation text NOT NULL
    CHECK (
      source_operation IN (
        'INSERT',
        'UPDATE',
        'DELETE'
      )
    ),
  source_key text NOT NULL,
  transaction_id bigint NOT NULL DEFAULT txid_current(),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS agore_events_idempotency_idx
  ON private.agore_events (
    source_table,
    source_operation,
    source_key,
    event_type,
    transaction_id
  );

CREATE INDEX IF NOT EXISTS agore_events_sequence_idx
  ON private.agore_events (event_sequence);

CREATE INDEX IF NOT EXISTS agore_events_type_time_idx
  ON private.agore_events (event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS agore_events_actor_time_idx
  ON private.agore_events (actor_id, occurred_at DESC)
  WHERE actor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS agore_events_subject_time_idx
  ON private.agore_events (subject_id, occurred_at DESC)
  WHERE subject_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS agore_events_target_time_idx
  ON private.agore_events (target_id, occurred_at DESC)
  WHERE target_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.agore_emit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  event_type_value text;
  actor_id_value uuid;
  subject_id_value uuid;
  target_id_value uuid;
  visibility_value text;
  source_key_value text;
  event_data jsonb := '{}'::jsonb;
  now_actor_id uuid;
BEGIN
  now_actor_id := auth.uid();

  CASE TG_TABLE_NAME

    WHEN 'posts' THEN
      source_key_value := COALESCE(NEW.id, OLD.id)::text;
      subject_id_value := COALESCE(NEW.id, OLD.id);
      actor_id_value := COALESCE(
        now_actor_id,
        COALESCE(NEW.author_id, OLD.author_id)
      );
      visibility_value := 'PUBLIC';

      IF TG_OP = 'INSERT' THEN
        event_type_value := 'post.created';
        event_data := jsonb_build_object(
          'post_id', NEW.id,
          'author_id', NEW.author_id
        );
      ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.deleted_at IS NULL
           AND NEW.deleted_at IS NOT NULL
        THEN
          event_type_value := 'post.deleted';
          event_data := jsonb_build_object(
            'post_id', NEW.id,
            'author_id', NEW.author_id
          );
        ELSIF NEW.content IS DISTINCT FROM OLD.content THEN
          event_type_value := 'post.updated';
          event_data := jsonb_build_object(
            'post_id', NEW.id,
            'author_id', NEW.author_id
          );
        END IF;
      ELSIF TG_OP = 'DELETE' THEN
        event_type_value := 'post.deleted';
        event_data := jsonb_build_object(
          'post_id', OLD.id,
          'author_id', OLD.author_id
        );
      END IF;

    WHEN 'post_reactions' THEN
      source_key_value :=
        COALESCE(NEW.post_id, OLD.post_id)::text
        || ':'
        || COALESCE(NEW.user_id, OLD.user_id)::text;
      subject_id_value :=
        COALESCE(NEW.post_id, OLD.post_id);
      actor_id_value :=
        COALESCE(
          now_actor_id,
          COALESCE(NEW.user_id, OLD.user_id)
        );
      visibility_value := 'PUBLIC';

      IF TG_OP = 'INSERT' THEN
        event_type_value := 'post.reaction.added';
        event_data := jsonb_build_object(
          'post_id', NEW.post_id,
          'user_id', NEW.user_id,
          'reaction_type', NEW.reaction_type
        );
      ELSIF TG_OP = 'UPDATE'
            AND NEW.reaction_type IS DISTINCT FROM OLD.reaction_type
      THEN
        event_type_value := 'post.reaction.changed';
        event_data := jsonb_build_object(
          'post_id', NEW.post_id,
          'user_id', NEW.user_id,
          'from', OLD.reaction_type,
          'to', NEW.reaction_type
        );
      ELSIF TG_OP = 'DELETE' THEN
        event_type_value := 'post.reaction.removed';
        event_data := jsonb_build_object(
          'post_id', OLD.post_id,
          'user_id', OLD.user_id,
          'reaction_type', OLD.reaction_type
        );
      END IF;

    WHEN 'comments' THEN
      source_key_value := COALESCE(NEW.id, OLD.id)::text;
      subject_id_value := COALESCE(NEW.id, OLD.id);
      actor_id_value :=
        COALESCE(
          now_actor_id,
          COALESCE(NEW.author_id, OLD.author_id)
        );
      target_id_value :=
        COALESCE(NEW.post_id, OLD.post_id);
      visibility_value := 'PUBLIC';

      IF TG_OP = 'INSERT' THEN
        event_type_value := 'comment.created';
        event_data := jsonb_build_object(
          'comment_id', NEW.id,
          'post_id', NEW.post_id,
          'author_id', NEW.author_id,
          'parent_comment_id', NEW.parent_comment_id
        );
      ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.deleted_at IS NULL
           AND NEW.deleted_at IS NOT NULL
        THEN
          event_type_value := 'comment.deleted';
          event_data := jsonb_build_object(
            'comment_id', NEW.id,
            'post_id', NEW.post_id,
            'author_id', NEW.author_id
          );
        ELSIF NEW.content IS DISTINCT FROM OLD.content THEN
          event_type_value := 'comment.updated';
          event_data := jsonb_build_object(
            'comment_id', NEW.id,
            'post_id', NEW.post_id,
            'author_id', NEW.author_id
          );
        END IF;
      ELSIF TG_OP = 'DELETE' THEN
        event_type_value := 'comment.deleted';
        event_data := jsonb_build_object(
          'comment_id', OLD.id,
          'post_id', OLD.post_id,
          'author_id', OLD.author_id
        );
      END IF;

    WHEN 'reposts' THEN
      source_key_value :=
        COALESCE(NEW.post_id, OLD.post_id)::text
        || ':'
        || COALESCE(NEW.user_id, OLD.user_id)::text;
      subject_id_value := COALESCE(NEW.post_id, OLD.post_id);
      actor_id_value :=
        COALESCE(
          now_actor_id,
          COALESCE(NEW.user_id, OLD.user_id)
        );
      visibility_value := 'PUBLIC';

      IF TG_OP = 'INSERT' THEN
        event_type_value := 'repost.created';
        event_data := jsonb_build_object(
          'post_id', NEW.post_id,
          'user_id', NEW.user_id
        );
      ELSIF TG_OP = 'DELETE' THEN
        event_type_value := 'repost.deleted';
        event_data := jsonb_build_object(
          'post_id', OLD.post_id,
          'user_id', OLD.user_id
        );
      END IF;

    WHEN 'follows' THEN
      source_key_value :=
        COALESCE(NEW.follower_id, OLD.follower_id)::text
        || ':'
        || COALESCE(NEW.following_id, OLD.following_id)::text;
      actor_id_value :=
        COALESCE(
          now_actor_id,
          COALESCE(NEW.follower_id, OLD.follower_id)
        );
      target_id_value :=
        COALESCE(NEW.following_id, OLD.following_id);
      visibility_value := 'PRIVATE';

      IF TG_OP = 'INSERT' THEN
        event_type_value := 'follow.created';
        event_data := jsonb_build_object(
          'follower_id', NEW.follower_id,
          'following_id', NEW.following_id
        );
      ELSIF TG_OP = 'DELETE' THEN
        event_type_value := 'follow.deleted';
        event_data := jsonb_build_object(
          'follower_id', OLD.follower_id,
          'following_id', OLD.following_id
        );
      END IF;

    WHEN 'blocks' THEN
      source_key_value :=
        COALESCE(NEW.blocker_id, OLD.blocker_id)::text
        || ':'
        || COALESCE(NEW.blocked_id, OLD.blocked_id)::text;
      actor_id_value :=
        COALESCE(
          now_actor_id,
          COALESCE(NEW.blocker_id, OLD.blocker_id)
        );
      target_id_value :=
        COALESCE(NEW.blocked_id, OLD.blocked_id);
      visibility_value := 'RESTRICTED';

      IF TG_OP = 'INSERT' THEN
        event_type_value := 'block.created';
        event_data := jsonb_build_object(
          'blocker_id', NEW.blocker_id,
          'blocked_id', NEW.blocked_id
        );
      ELSIF TG_OP = 'DELETE' THEN
        event_type_value := 'block.deleted';
        event_data := jsonb_build_object(
          'blocker_id', OLD.blocker_id,
          'blocked_id', OLD.blocked_id
        );
      END IF;

    WHEN 'conversations' THEN
      source_key_value := COALESCE(NEW.id, OLD.id)::text;
      subject_id_value := COALESCE(NEW.id, OLD.id);
      actor_id_value :=
        COALESCE(
          now_actor_id,
          COALESCE(NEW.created_by, OLD.created_by)
        );
      visibility_value := 'PRIVATE';

      IF TG_OP = 'INSERT' THEN
        event_type_value := 'conversation.created';
        event_data := jsonb_build_object(
          'conversation_id', NEW.id,
          'conversation_type', NEW.type,
          'created_by', NEW.created_by
        );
      ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.name IS DISTINCT FROM OLD.name
           OR NEW.description IS DISTINCT FROM OLD.description
           OR NEW.image_path IS DISTINCT FROM OLD.image_path
           OR NEW.direct_participant_a IS DISTINCT FROM OLD.direct_participant_a
           OR NEW.direct_participant_b IS DISTINCT FROM OLD.direct_participant_b
        THEN
          event_type_value := 'conversation.updated';
          event_data := jsonb_build_object(
            'conversation_id', NEW.id,
            'conversation_type', NEW.type
          );
        END IF;
      ELSIF TG_OP = 'DELETE' THEN
        event_type_value := 'conversation.deleted';
        event_data := jsonb_build_object(
          'conversation_id', OLD.id,
          'conversation_type', OLD.type
        );
      END IF;

    WHEN 'conversation_members' THEN
      source_key_value :=
        COALESCE(NEW.conversation_id, OLD.conversation_id)::text
        || ':'
        || COALESCE(NEW.user_id, OLD.user_id)::text;
      subject_id_value :=
        COALESCE(NEW.conversation_id, OLD.conversation_id);
      target_id_value :=
        COALESCE(NEW.user_id, OLD.user_id);
      actor_id_value := now_actor_id;
      visibility_value := 'PRIVATE';

      IF TG_OP = 'INSERT' THEN
        event_type_value := 'conversation.member_added';
        event_data := jsonb_build_object(
          'conversation_id', NEW.conversation_id,
          'user_id', NEW.user_id,
          'role', NEW.role
        );
      ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.left_at IS NULL
           AND NEW.left_at IS NOT NULL
        THEN
          event_type_value := 'conversation.member_removed';
          event_data := jsonb_build_object(
            'conversation_id', NEW.conversation_id,
            'user_id', NEW.user_id,
            'role', NEW.role
          );
        ELSIF OLD.left_at IS NOT NULL
              AND NEW.left_at IS NULL
        THEN
          event_type_value := 'conversation.member_added';
          event_data := jsonb_build_object(
            'conversation_id', NEW.conversation_id,
            'user_id', NEW.user_id,
            'role', NEW.role
          );
        ELSIF NEW.role IS DISTINCT FROM OLD.role THEN
          event_type_value := 'conversation.member_role_changed';
          event_data := jsonb_build_object(
            'conversation_id', NEW.conversation_id,
            'user_id', NEW.user_id,
            'from', OLD.role,
            'to', NEW.role
          );
        END IF;
      ELSIF TG_OP = 'DELETE' THEN
        event_type_value := 'conversation.member_removed';
        event_data := jsonb_build_object(
          'conversation_id', OLD.conversation_id,
          'user_id', OLD.user_id,
          'role', OLD.role
        );
      END IF;

    WHEN 'messages' THEN
      source_key_value := COALESCE(NEW.id, OLD.id)::text;
      subject_id_value := COALESCE(NEW.id, OLD.id);
      actor_id_value :=
        COALESCE(
          now_actor_id,
          COALESCE(NEW.sender_id, OLD.sender_id)
        );
      target_id_value :=
        COALESCE(NEW.conversation_id, OLD.conversation_id);
      visibility_value := 'PRIVATE';

      IF TG_OP = 'INSERT' THEN
        event_type_value := 'message.created';
        event_data := jsonb_build_object(
          'message_id', NEW.id,
          'conversation_id', NEW.conversation_id,
          'sender_id', NEW.sender_id,
          'reply_to_message_id', NEW.reply_to_message_id,
          'forwarded_from_message_id', NEW.forwarded_from_message_id
        );
      ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.deleted_at IS NULL
           AND NEW.deleted_at IS NOT NULL
        THEN
          event_type_value := 'message.deleted';
          event_data := jsonb_build_object(
            'message_id', NEW.id,
            'conversation_id', NEW.conversation_id,
            'sender_id', NEW.sender_id
          );
        ELSIF NEW.content IS DISTINCT FROM OLD.content THEN
          event_type_value := 'message.updated';
          event_data := jsonb_build_object(
            'message_id', NEW.id,
            'conversation_id', NEW.conversation_id,
            'sender_id', NEW.sender_id
          );
        END IF;
      ELSIF TG_OP = 'DELETE' THEN
        event_type_value := 'message.deleted';
        event_data := jsonb_build_object(
          'message_id', OLD.id,
          'conversation_id', OLD.conversation_id,
          'sender_id', OLD.sender_id
        );
      END IF;

    WHEN 'message_media' THEN
      source_key_value := COALESCE(NEW.id, OLD.id)::text;
      subject_id_value :=
        COALESCE(NEW.message_id, OLD.message_id);
      actor_id_value := now_actor_id;
      visibility_value := 'PRIVATE';

      IF actor_id_value IS NULL THEN
        SELECT m.sender_id
          INTO actor_id_value
        FROM public.messages AS m
        WHERE m.id = COALESCE(NEW.message_id, OLD.message_id);
      END IF;

      IF TG_OP = 'INSERT' THEN
        event_type_value := 'message.media_added';
        event_data := jsonb_build_object(
          'media_id', NEW.id,
          'message_id', NEW.message_id,
          'media_type', NEW.media_type,
          'mime_type', NEW.mime_type,
          'size_bytes', NEW.size_bytes
        );
      ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.storage_path IS DISTINCT FROM OLD.storage_path
           OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
           OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes
           OR NEW.width IS DISTINCT FROM OLD.width
           OR NEW.height IS DISTINCT FROM OLD.height
           OR NEW.duration_ms IS DISTINCT FROM OLD.duration_ms
        THEN
          event_type_value := 'message.media_updated';
          event_data := jsonb_build_object(
            'media_id', NEW.id,
            'message_id', NEW.message_id,
            'media_type', NEW.media_type
          );
        END IF;
      ELSIF TG_OP = 'DELETE' THEN
        event_type_value := 'message.media_removed';
        event_data := jsonb_build_object(
          'media_id', OLD.id,
          'message_id', OLD.message_id,
          'media_type', OLD.media_type
        );
      END IF;

    WHEN 'message_reactions' THEN
      source_key_value :=
        COALESCE(NEW.message_id, OLD.message_id)::text
        || ':'
        || COALESCE(NEW.user_id, OLD.user_id)::text;
      subject_id_value :=
        COALESCE(NEW.message_id, OLD.message_id);
      actor_id_value :=
        COALESCE(
          now_actor_id,
          COALESCE(NEW.user_id, OLD.user_id)
        );
      visibility_value := 'PRIVATE';

      IF TG_OP = 'INSERT' THEN
        event_type_value := 'message.reaction.added';
        event_data := jsonb_build_object(
          'message_id', NEW.message_id,
          'user_id', NEW.user_id,
          'reaction_type', NEW.reaction_type
        );
      ELSIF TG_OP = 'UPDATE'
            AND NEW.reaction_type IS DISTINCT FROM OLD.reaction_type
      THEN
        event_type_value := 'message.reaction.changed';
        event_data := jsonb_build_object(
          'message_id', NEW.message_id,
          'user_id', NEW.user_id,
          'from', OLD.reaction_type,
          'to', NEW.reaction_type
        );
      ELSIF TG_OP = 'DELETE' THEN
        event_type_value := 'message.reaction.removed';
        event_data := jsonb_build_object(
          'message_id', OLD.message_id,
          'user_id', OLD.user_id,
          'reaction_type', OLD.reaction_type
        );
      END IF;

    WHEN 'profiles' THEN
      source_key_value := COALESCE(NEW.id, OLD.id)::text;
      subject_id_value := COALESCE(NEW.id, OLD.id);
      actor_id_value :=
        COALESCE(
          now_actor_id,
          COALESCE(NEW.id, OLD.id)
        );
      visibility_value := 'PUBLIC';

      IF TG_OP = 'UPDATE'
         AND (
           NEW.username IS DISTINCT FROM OLD.username
           OR NEW.display_name IS DISTINCT FROM OLD.display_name
           OR NEW.bio IS DISTINCT FROM OLD.bio
           OR NEW.avatar_path IS DISTINCT FROM OLD.avatar_path
           OR NEW.account_status IS DISTINCT FROM OLD.account_status
         )
      THEN
        event_type_value := 'profile.updated';
        event_data := jsonb_build_object(
          'profile_id', NEW.id
        );
      END IF;

    WHEN 'reports' THEN
      source_key_value := COALESCE(NEW.id, OLD.id)::text;
      subject_id_value :=
        COALESCE(NEW.target_id, OLD.target_id);
      actor_id_value :=
        COALESCE(
          now_actor_id,
          COALESCE(NEW.reporter_id, OLD.reporter_id)
        );
      visibility_value := 'RESTRICTED';

      IF TG_OP = 'INSERT' THEN
        event_type_value := 'report.created';
        event_data := jsonb_build_object(
          'report_id', NEW.id,
          'reporter_id', NEW.reporter_id,
          'target_type', NEW.target_type,
          'target_id', NEW.target_id
        );
      ELSIF TG_OP = 'UPDATE'
            AND NEW.status IS DISTINCT FROM OLD.status
      THEN
        event_type_value := 'report.updated';
        event_data := jsonb_build_object(
          'report_id', NEW.id,
          'status', NEW.status
        );
      END IF;

  END CASE;

  IF event_type_value IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    RETURN NEW;
  END IF;

  INSERT INTO private.agore_events (
    event_type,
    actor_id,
    subject_id,
    target_id,
    visibility_class,
    source_table,
    source_operation,
    source_key,
    transaction_id,
    data
  )
  VALUES (
    event_type_value,
    actor_id_value,
    subject_id_value,
    target_id_value,
    visibility_value,
    TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
    TG_OP,
    source_key_value,
    txid_current(),
    event_data
  )
  ON CONFLICT (
    source_table,
    source_operation,
    source_key,
    event_type,
    transaction_id
  )
  DO NOTHING;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL
ON TABLE private.agore_events
FROM PUBLIC, anon, authenticated;

REVOKE ALL
ON FUNCTION private.agore_emit_event()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS posts_emit_event
ON public.posts;

CREATE TRIGGER posts_emit_event
AFTER INSERT OR UPDATE OR DELETE
ON public.posts
FOR EACH ROW
EXECUTE FUNCTION private.agore_emit_event();

DROP TRIGGER IF EXISTS post_reactions_emit_event
ON public.post_reactions;

CREATE TRIGGER post_reactions_emit_event
AFTER INSERT OR UPDATE OR DELETE
ON public.post_reactions
FOR EACH ROW
EXECUTE FUNCTION private.agore_emit_event();

DROP TRIGGER IF EXISTS comments_emit_event
ON public.comments;

CREATE TRIGGER comments_emit_event
AFTER INSERT OR UPDATE OR DELETE
ON public.comments
FOR EACH ROW
EXECUTE FUNCTION private.agore_emit_event();

DROP TRIGGER IF EXISTS reposts_emit_event
ON public.reposts;

CREATE TRIGGER reposts_emit_event
AFTER INSERT OR DELETE
ON public.reposts
FOR EACH ROW
EXECUTE FUNCTION private.agore_emit_event();

DROP TRIGGER IF EXISTS follows_emit_event
ON public.follows;

CREATE TRIGGER follows_emit_event
AFTER INSERT OR DELETE
ON public.follows
FOR EACH ROW
EXECUTE FUNCTION private.agore_emit_event();

DROP TRIGGER IF EXISTS blocks_emit_event
ON public.blocks;

CREATE TRIGGER blocks_emit_event
AFTER INSERT OR DELETE
ON public.blocks
FOR EACH ROW
EXECUTE FUNCTION private.agore_emit_event();

DROP TRIGGER IF EXISTS conversations_emit_event
ON public.conversations;

CREATE TRIGGER conversations_emit_event
AFTER INSERT OR UPDATE OR DELETE
ON public.conversations
FOR EACH ROW
EXECUTE FUNCTION private.agore_emit_event();

DROP TRIGGER IF EXISTS conversation_members_emit_event
ON public.conversation_members;

CREATE TRIGGER conversation_members_emit_event
AFTER INSERT OR UPDATE OR DELETE
ON public.conversation_members
FOR EACH ROW
EXECUTE FUNCTION private.agore_emit_event();

DROP TRIGGER IF EXISTS messages_emit_event
ON public.messages;

CREATE TRIGGER messages_emit_event
AFTER INSERT OR UPDATE OR DELETE
ON public.messages
FOR EACH ROW
EXECUTE FUNCTION private.agore_emit_event();

DROP TRIGGER IF EXISTS message_media_emit_event
ON public.message_media;

CREATE TRIGGER message_media_emit_event
AFTER INSERT OR UPDATE OR DELETE
ON public.message_media
FOR EACH ROW
EXECUTE FUNCTION private.agore_emit_event();

DROP TRIGGER IF EXISTS message_reactions_emit_event
ON public.message_reactions;

CREATE TRIGGER message_reactions_emit_event
AFTER INSERT OR UPDATE OR DELETE
ON public.message_reactions
FOR EACH ROW
EXECUTE FUNCTION private.agore_emit_event();

DROP TRIGGER IF EXISTS profiles_emit_event
ON public.profiles;

CREATE TRIGGER profiles_emit_event
AFTER UPDATE
ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION private.agore_emit_event();

DROP TRIGGER IF EXISTS reports_emit_event
ON public.reports;

CREATE TRIGGER reports_emit_event
AFTER INSERT OR UPDATE
ON public.reports
FOR EACH ROW
EXECUTE FUNCTION private.agore_emit_event();