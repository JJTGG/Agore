
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canViewerSeeActivityEvent,
  type ActivityEventForVisibility,
  type ActivityVisibilityContext,
} from "../lib/activity/visibility";

const publicEvent: ActivityEventForVisibility = {
  event_type: "post.created",
  actor_id: "owner-1",
  visibility_class: "PUBLIC",
};

const publicContext: ActivityVisibilityContext = {
  viewerId: "viewer-1",
  activityOwnerId: "owner-1",
  hasBlockingRelationship: false,
  referencedContentVisible: true,
};

test("allows an approved public event when all visibility checks pass", () => {
  assert.equal(
    canViewerSeeActivityEvent(
      publicEvent,
      publicContext,
    ),
    true,
  );
});

test("denies unapproved event types even when marked public", () => {
  assert.equal(
    canViewerSeeActivityEvent(
      {
        ...publicEvent,
        event_type: "message.sent",
      },
      publicContext,
    ),
    false,
  );
});

test("allows private follow events only to the activity owner", () => {
  const event: ActivityEventForVisibility = {
    event_type: "follow.created",
    actor_id: "owner-1",
    visibility_class: "PRIVATE",
  };

  const ownerContext: ActivityVisibilityContext = {
    ...publicContext,
    viewerId: "owner-1",
  };

  assert.equal(
    canViewerSeeActivityEvent(event, ownerContext),
    true,
  );

  assert.equal(
    canViewerSeeActivityEvent(event, publicContext),
    false,
  );
});

test("denies confidential and restricted events", () => {
  for (const visibilityClass of [
    "CONFIDENTIAL",
    "RESTRICTED",
  ]) {
    assert.equal(
      canViewerSeeActivityEvent(
        {
          ...publicEvent,
          visibility_class: visibilityClass,
        },
        publicContext,
      ),
      false,
    );
  }
});

test("denies otherwise-public events when a blocking relationship exists", () => {
  assert.equal(
    canViewerSeeActivityEvent(
      publicEvent,
      {
        ...publicContext,
        hasBlockingRelationship: true,
      },
    ),
    false,
  );
});

test("denies events when the referenced content is not visible", () => {
  assert.equal(
    canViewerSeeActivityEvent(
      publicEvent,
      {
        ...publicContext,
        referencedContentVisible: false,
      },
    ),
    false,
  );
});

test("denies events attributed to someone other than the activity owner", () => {
  assert.equal(
    canViewerSeeActivityEvent(
      {
        ...publicEvent,
        actor_id: "another-user",
      },
      publicContext,
    ),
    false,
  );
});

test("denies missing viewer, owner, or event actor identifiers", () => {
  assert.equal(
    canViewerSeeActivityEvent(
      publicEvent,
      {
        ...publicContext,
        viewerId: "",
      },
    ),
    false,
  );

  assert.equal(
    canViewerSeeActivityEvent(
      publicEvent,
      {
        ...publicContext,
        activityOwnerId: "",
      },
    ),
    false,
  );

  assert.equal(
    canViewerSeeActivityEvent(
      {
        ...publicEvent,
        actor_id: null,
      },
      publicContext,
    ),
    false,
  );
});
