
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notifications";

type NotifyPostMentionsInput = {
  actorId: string;
  postId: string;
  content: string;
  previousContent?: string;
};

export function extractMentionUsernames(content: string) {
  const usernames = new Set<string>();

  for (const match of content.matchAll(
    /(^|[^\w@])@([A-Za-z0-9_]{2,30})\b/g,
  )) {
    usernames.add(match[2].toLowerCase());
  }

  return Array.from(usernames);
}

export async function notifyPostMentions({
  actorId,
  postId,
  content,
  previousContent,
}: NotifyPostMentionsInput): Promise<void> {
  try {
    const currentUsernames = extractMentionUsernames(content);

    const previousUsernames = new Set(
      previousContent === undefined
        ? []
        : extractMentionUsernames(previousContent),
    );

    // Only notify on newly added usernames during post edits.
    const usernamesToNotify = currentUsernames.filter(
      (username) => !previousUsernames.has(username),
    );

    if (usernamesToNotify.length === 0) {
      return;
    }

    const admin = createAdminClient();

    const {
      data: profiles,
      error: profilesError,
    } = await admin
      .from("profiles")
      .select("id, username")
      .eq("account_status", "active")
      .in("username", usernamesToNotify)
      .neq("id", actorId);

    if (profilesError) {
      console.error(
        "Unable to resolve Agoré post mentions:",
        profilesError,
      );
      return;
    }

    if (!profiles || profiles.length === 0) {
      return;
    }

    // Fail closed if block status cannot be checked.
    const {
      data: relationships,
      error: blocksError,
    } = await admin
      .from("blocks")
      .select("blocker_id, blocked_id")
      .or(
        `blocker_id.eq.${actorId},blocked_id.eq.${actorId}`,
      );

    if (blocksError) {
      console.error(
        "Unable to check blocks for Agoré mentions:",
        blocksError,
      );
      return;
    }

    const blockedUserIds = new Set<string>();

    for (const relationship of relationships ?? []) {
      if (relationship.blocker_id === actorId) {
        blockedUserIds.add(relationship.blocked_id);
      }

      if (relationship.blocked_id === actorId) {
        blockedUserIds.add(relationship.blocker_id);
      }
    }

    const recipients = profiles.filter(
      (profile) =>
        profile.id !== actorId &&
        !blockedUserIds.has(profile.id),
    );

    await Promise.all(
      recipients.map(async (profile) => {
        try {
          await createNotification({
            recipientId: profile.id,
            actorId,
            type: "mention",
            entityId: postId,
            data: {
              postId,
              username: profile.username,
            },
          });
        } catch (error) {
          // A notification failure must not undo a published post.
          console.error(
            "Failed to notify an Agoré mention recipient:",
            error,
          );
        }
      }),
    );
  } catch (error) {
    // The post itself should remain saved if mention processing fails.
    console.error(
      "Agoré post mention processing failed:",
      error,
    );
  }
}
