import assert from "node:assert/strict";
import { test } from "node:test";

import {
  filterNotificationsByVisibility,
  type NotificationBlockRelationship,
  type NotificationVisibilityItem,
} from "../lib/notification-visibility";

type Notification = NotificationVisibilityItem & {
  id: string;
};

const viewerId = "viewer-1";

function notification(
  id: string,
  actorId: string | null,
  accountStatus: string | null = "active",
): Notification {
  return {
    id,
    actor_id: actorId,
    actor:
      actorId && accountStatus
        ? { account_status: accountStatus }
        : null,
  };
}

test("hides notifications from users blocked in either direction", () => {
  const notifications = [
    notification("viewer-blocked-actor", "actor-blocked-by-viewer"),
    notification("actor-blocked-viewer", "actor-who-blocked-viewer"),
    notification("unblocked-actor", "safe-actor"),
  ];

  const blocks: NotificationBlockRelationship[] = [
    {
      blocker_id: viewerId,
      blocked_id: "actor-blocked-by-viewer",
    },
    {
      blocker_id: "actor-who-blocked-viewer",
      blocked_id: viewerId,
    },
  ];

  const visible = filterNotificationsByVisibility(
    notifications,
    viewerId,
    blocks,
  );

  assert.deepEqual(
    visible.map((item) => item.id),
    ["unblocked-actor"],
  );
});

test("keeps actor-less system notifications but hides inactive or missing actors", () => {
  const notifications = [
    notification("system", null),
    notification("inactive", "inactive-actor", "disabled"),
    notification("missing-profile", "deleted-actor", null),
    notification("active", "active-actor"),
  ];

  const visible = filterNotificationsByVisibility(
    notifications,
    viewerId,
    [],
  );

  assert.deepEqual(
    visible.map((item) => item.id),
    ["system", "active"],
  );
});

test("preserves the complete notification object when filtering", () => {
  const notifications = [
    {
      ...notification("one", "active-actor"),
      type: "comment",
      entity_id: "post-1",
      read_at: null,
    },
  ];

  const visible = filterNotificationsByVisibility(
    notifications,
    viewerId,
    [],
  );

  assert.deepEqual(visible, notifications);
});