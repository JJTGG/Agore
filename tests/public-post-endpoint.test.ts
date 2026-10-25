import assert from "node:assert/strict";
import { test } from "node:test";

import { GET } from "../app/api/public/posts/[postId]/route";

const postId = "11111111-1111-4111-8111-111111111111";

test("public post endpoint remains closed and returns no post data", async () => {
  const response = await GET(
    new Request(`https://agore.test/api/public/posts/${postId}`),
    {
      params: Promise.resolve({ postId }),
    },
  );

  assert.equal(response.status, 404);

  assert.equal(
    response.headers.get("Cache-Control"),
    "no-store, max-age=0",
  );

  assert.equal(
    response.headers.get("X-Robots-Tag"),
    "noindex, nofollow",
  );

  assert.deepEqual(await response.json(), {
    error: "Public post previews are temporarily unavailable.",
  });
});