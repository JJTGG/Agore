export type NotificationVisibilityItem = {
  actor_id: string | null;
  actor: {
    account_status: string;
  } | null;
};

export type NotificationBlockRelationship = {
  blocker_id: string;
  blocked_id: string;
};

export function filterNotificationsByVisibility<
  T extends NotificationVisibilityItem,
>(
  notifications: readonly T[],
  userId: string,
  blocks: readonly NotificationBlockRelationship[],
): T[] {
  const blockedIds = new Set<string>();

  for (const block of blocks) {
    if (block.blocker_id === userId) {
      blockedIds.add(block.blocked_id);
    }

    if (block.blocked_id === userId) {
      blockedIds.add(block.blocker_id);
    }
  }

  return notifications.filter((notification) => {
    if (!notification.actor_id) {
      return true;
    }

    return (
      notification.actor?.account_status === "active" &&
      !blockedIds.has(notification.actor_id)
    );
  });
}