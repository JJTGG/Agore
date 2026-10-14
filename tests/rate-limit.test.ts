
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getAgoreRateLimitBucket,
} from "../lib/security/rate-limit";

type RateLimitRequest =
  Parameters<typeof getAgoreRateLimitBucket>[0];

function makeRequest(
  pathname: string,
  method: string,
): RateLimitRequest {
  return {
    nextUrl: { pathname },
    method,
  } as unknown as RateLimitRequest;
}

test("applies dedicated limits to search endpoints", () => {
  assert.equal(
    getAgoreRateLimitBucket(
      makeRequest("/api/search", "GET"),
    ),
    "search",
  );

  assert.equal(
    getAgoreRateLimitBucket(
      makeRequest("/api/users/search", "GET"),
    ),
    "user_search",
  );
});

test("does not rate-limit ordinary read-only requests", () => {
  for (const method of ["GET", "HEAD", "OPTIONS"]) {
    assert.equal(
      getAgoreRateLimitBucket(
        makeRequest("/api/posts", method),
      ),
      null,
    );
  }
});

test("excludes the entire authentication API namespace", () => {
  assert.equal(
    getAgoreRateLimitBucket(
      makeRequest("/api/auth", "POST"),
    ),
    null,
  );

  assert.equal(
    getAgoreRateLimitBucket(
      makeRequest("/api/auth/callback", "POST"),
    ),
    null,
  );
});

test("assigns dedicated buckets to content mutations", () => {
  const cases: Array<[string, string, string]> = [
    ["/api/posts", "POST", "post_create"],
    ["/api/posts/post-1", "PATCH", "post_create"],
    ["/api/posts/post-1/comments", "POST", "comment_create"],
    ["/api/comments/comment-1", "DELETE", "comment_create"],
    ["/api/posts/post-1/reaction", "POST", "post_reaction"],
    ["/api/posts/post-1/repost", "POST", "repost"],
    ["/api/posts/post-1/report", "POST", "report_create"],
  ];

  for (const [pathname, method, expected] of cases) {
    assert.equal(
      getAgoreRateLimitBucket(
        makeRequest(pathname, method),
      ),
      expected,
      `${method} ${pathname}`,
    );
  }
});

test("assigns dedicated buckets to relationship changes", () => {
  assert.equal(
    getAgoreRateLimitBucket(
      makeRequest("/api/users/user-1/follow", "POST"),
    ),
    "relationship_change",
  );

  assert.equal(
    getAgoreRateLimitBucket(
      makeRequest("/api/users/user-1/block", "POST"),
    ),
    "relationship_change",
  );
});

test("assigns dedicated buckets to messaging mutations", () => {
  const cases: Array<[string, string, string]> = [
    [
      "/api/conversations/direct",
      "POST",
      "conversation_create",
    ],
    [
      "/api/conversations/group",
      "POST",
      "group_create",
    ],
    [
      "/api/conversations/conversation-1/messages",
      "POST",
      "message_write",
    ],
    [
      "/api/conversations/conversation-1/messages/message-1/reaction",
      "POST",
      "message_reaction",
    ],
  ];

  for (const [pathname, method, expected] of cases) {
    assert.equal(
      getAgoreRateLimitBucket(
        makeRequest(pathname, method),
      ),
      expected,
      `${method} ${pathname}`,
    );
  }
});

test("uses a generic mutation bucket for other API writes", () => {
  assert.equal(
    getAgoreRateLimitBucket(
      makeRequest("/api/settings/preferences", "PATCH"),
    ),
    "generic_mutation",
  );
});

test("ignores non-API routes", () => {
  assert.equal(
    getAgoreRateLimitBucket(
      makeRequest("/settings", "POST"),
    ),
    null,
  );
});
