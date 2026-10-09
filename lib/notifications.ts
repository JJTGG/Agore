import { createAdminClient } from "@/lib/supabase/admin";
import {
  isPushConfigured,
  sendPushNotification,
} from "@/lib/push";

export type NotificationType =
  | "follow"
  | "reaction"
  | "comment"
  | "repost"
  | "message"
  | "group_activity";

type NotificationInput = {
  recipientId: string;
  actorId?: string | null;
  type: NotificationType;
  entityId?: string | null;
  data?: Record<string, unknown>;
};

type NotificationPreferences = {
  follows: boolean;
  reactions: boolean;
  comments: boolean;
  reposts: boolean;
  messages: boolean;
  group_activity: boolean;
};

const preferenceByType: Record<
  NotificationType,
  keyof NotificationPreferences
> = {
  follow: "follows",
  reaction: "reactions",
  comment: "comments",
  repost: "reposts",
  message: "messages",
  group_activity: "group_activity",
};

function getEventTypes(
  type: NotificationType,
  data: Record<string, unknown>,
): string[] {
  switch (type) {
    case "follow":
      return ["follow.created"];

    case "reaction":
      return ["post.reaction.added"];

    case "comment":
      return ["comment.created"];

    case "repost":
      return ["repost.created"];

    case "message":
      return [
        "message.created",
        "message.media_added",
      ];

    case "group_activity":
      if (
        data.eventType &&
        typeof data.eventType === "string"
      ) {
        return [data.eventType];
      }

      return [
        "conversation.member_added",
        "conversation.member_removed",
        "conversation.member_role_changed",
        "conversation.updated",
      ];
  }
}

async function findAuthoritativeEventId({
  admin,
  actorId,
  type,
  entityId,
  data,
}: {
  admin: ReturnType<typeof createAdminClient>;
  actorId: string | null;
  type: NotificationType;
  entityId: string | null;
  data: Record<string, unknown>;
}) {
  const eventTypes = getEventTypes(type, data);
  let messageId: string | null = null;

  if (type === "message") {
    messageId =
      typeof data.messageId === "string"
        ? data.messageId
        : null;

    if (!messageId) {
      console.error(
        "Agore message notification requires a message ID.",
        {
          actorId,
          entityId,
        },
      );

      return null;
    }

    const {
      data: sourceMessage,
      error: sourceMessageError,
    } = await admin
      .from("messages")
      .select("content")
      .eq("id", messageId)
      .maybeSingle();

    if (sourceMessageError) {
      console.error(
        "Failed to resolve Agore notification message:",
        sourceMessageError,
      );

      return null;
    }

    if (!sourceMessage) {
      console.error(
        "Agore notification message was not found.",
        { messageId },
      );

      return null;
    }

    if (sourceMessage.content === null) {
      eventTypes.splice(
        0,
        eventTypes.length,
        "message.media_added",
      );
    } else {
      eventTypes.splice(
        0,
        eventTypes.length,
        "message.created",
      );
    }
  }

  let query = admin
    .from("agore_events")
    .select("event_id")
    .in("event_type", eventTypes)
    .order("event_sequence", {
      ascending: false,
    })
    .limit(25);

  if (actorId) {
    query = query.eq("actor_id", actorId);
  }

  if (type === "message" && messageId) {
    // Match the exact message instead of selecting an unrelated
    // event from the same conversation.
    query = query.eq("subject_id", messageId);

    // Text-message events store the conversation in target_id.
    // Media events store the message ID in subject_id but leave
    // target_id null, so filter by conversation only for text.
    if (
      entityId &&
      eventTypes.includes("message.created")
    ) {
      query = query.eq("target_id", entityId);
    }
  } else if (entityId) {
    if (type === "follow") {
      query = query.eq("target_id", entityId);
    } else if (type === "comment") {
      const commentId =
        typeof data.commentId === "string"
          ? data.commentId
          : null;

      if (commentId) {
        query = query.eq("subject_id", commentId);
      } else {
        query = query.eq("target_id", entityId);
      }
    } else {
      query = query.eq("subject_id", entityId);
    }
  }

  const {
    data: events,
    error,
  } = await query;

  if (error) {
    console.error(
      "Failed to resolve authoritative Agore notification event:",
      error,
    );

    return null;
  }

  return events?.[0]?.event_id ?? null;
}

function getPushPresentation({
  type,
  actorName,
  entityId,
  data,
}: {
  type: NotificationType;
  actorName: string;
  entityId: string | null;
  data: Record<string, unknown>;
}) {
  switch (type) {
    case "follow":
      return {
        title: "New follower",
        body: `${actorName} followed you.`,
        url: data.actorId
          ? `/profile/${encodeURIComponent(
              String(data.actorId),
            )}`
          : "/notifications",
      };

    case "reaction":
      return {
        title: "New reaction",
        body: `${actorName} reacted to your post.`,
        url: entityId
          ? `/post/${encodeURIComponent(entityId)}`
          : "/notifications",
      };

    case "comment":
      return {
        title:
          data.is_reply === true
            ? "New reply"
            : "New comment",
        body:
          data.is_reply === true
            ? `${actorName} replied to your comment.`
            : `${actorName} commented on your post.`,
        url: entityId
          ? `/post/${encodeURIComponent(entityId)}`
          : "/notifications",
      };

    case "repost":
      return {
        title: "New repost",
        body: `${actorName} reposted your post.`,
        url: entityId
          ? `/post/${encodeURIComponent(entityId)}`
          : "/notifications",
      };

    case "message":
      return {
        title: "New message",
        body: `${actorName} sent you a message.`,
        url: entityId
          ? `/messages/${encodeURIComponent(entityId)}`
          : "/messages",
      };

    case "group_activity":
      return {
        title: "Group activity",
        body: `${actorName} updated a group conversation.`,
        url: entityId
          ? `/messages/${encodeURIComponent(entityId)}`
          : "/messages",
      };
  }
}

export async function createNotification({
  recipientId,
  actorId = null,
  type,
  entityId = null,
  data = {},
}: NotificationInput) {
  if (!recipientId) {
    return false;
  }

  if (
    actorId &&
    actorId === recipientId
  ) {
    return false;
  }

  const admin = createAdminClient();

  const preferenceColumn = preferenceByType[type];

  const {
    data: preferences,
    error: preferencesError,
  } = await admin
    .from("notification_preferences")
    .select(
      "follows, reactions, comments, reposts, messages, group_activity",
    )
    .eq("user_id", recipientId)
    .maybeSingle();

  if (preferencesError) {
    console.error(
      "Failed to load Agore notification preferences:",
      preferencesError,
    );

    return false;
  }

  const typedPreferences =
    (preferences as NotificationPreferences | null) ?? null;

  if (
    typedPreferences &&
    typedPreferences[preferenceColumn] === false
  ) {
    return false;
  }

  const eventId = await findAuthoritativeEventId({
    admin,
    actorId,
    type,
    entityId,
    data,
  });

  if (!eventId) {
    console.error(
      "Agore notification could not resolve an authoritative event.",
      {
        recipientId,
        actorId,
        type,
        entityId,
      },
    );

    return false;
  }

  const {
    data: existingNotification,
    error: existingError,
  } = await admin
    .from("notifications")
    .select(`
      id,
      event_id,
      recipient_id,
      actor_id,
      type,
      entity_id,
      data,
      push_sent_at
    `)
    .eq("event_id", eventId)
    .eq("recipient_id", recipientId)
    .maybeSingle();

  if (existingError) {
    console.error(
      "Failed to check Agore notification:",
      existingError,
    );

    return false;
  }

  let notification = existingNotification;

  if (!notification) {
    const {
      data: insertedNotification,
      error: insertError,
    } = await admin
      .from("notifications")
      .insert({
        event_id: eventId,
        recipient_id: recipientId,
        actor_id: actorId,
        type,
        entity_id: entityId,
        data,
      })
      .select(`
        id,
        event_id,
        recipient_id,
        actor_id,
        type,
        entity_id,
        data,
        push_sent_at
      `)
      .single();

    if (insertError) {
      console.error(
        "Failed to create Agore notification:",
        insertError,
      );

      return false;
    }

    notification = insertedNotification;
  }

  if (
    isPushConfigured() &&
    notification &&
    !notification.push_sent_at
  ) {
    const {
      data: actorProfile,
    } = actorId
      ? await admin
          .from("profiles")
          .select("display_name")
          .eq("id", actorId)
          .maybeSingle()
      : {
          data: null,
        };

    const actorName =
      actorProfile?.display_name ?? "Someone";

    const presentation = getPushPresentation({
      type,
      actorName,
      entityId,
      data: {
        ...data,
        actorId,
      },
    });

    try {
      const sent = await sendPushNotification(
        {
          recipientId,
        },
        presentation,
      );

      if (sent) {
        await admin
          .from("notifications")
          .update({
            push_sent_at: new Date().toISOString(),
          })
          .eq("id", notification.id)
          .is("push_sent_at", null);
      }
    } catch (pushError) {
      console.error(
        "Failed to send Agore push notification:",
        pushError,
      );
    }
  }

  return true;
}