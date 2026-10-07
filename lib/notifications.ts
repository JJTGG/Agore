import { createAdminClient } from "@/lib/supabase/admin";

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

  if (actorId && actorId === recipientId) {
    return false;
  }

  const admin = createAdminClient();
  const preferenceColumn = preferenceByType[type];

  const { data: preferences, error: preferencesError } = await admin
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

  const { error: notificationError } = await admin
    .from("notifications")
    .insert({
      recipient_id: recipientId,
      actor_id: actorId,
      type,
      entity_id: entityId,
      data,
    });

  if (notificationError) {
    console.error(
      "Failed to create Agore notification:",
      notificationError,
    );
    return false;
  }

  return true;
}