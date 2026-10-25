import assert from "node:assert/strict";
import { test } from "node:test";

import { readBoundedJsonBody } from "../lib/security/bounded-json";

const endpoint = "https://agore.test/api/analytics/pageview";
const maxBytes = 2048;

test("accepts valid JSON within the byte limit", async () => {
  const request = new Request(endpoint, {
    method: "POST",
    body: JSON.stringify({ path: "/home", device: "mobile" }),
  });

  const result = await readBoundedJsonBody(request, maxBytes);

  assert.equal(result.ok, true);

  if (result.ok) {
    assert.deepEqual(result.value, {
      path: "/home",
      device: "mobile",
    });
  }
});

test("rejects an oversized declared Content-Length", async () => {
  const request = new Request(endpoint, {
    method: "POST",
    headers: {
      "content-length": String(maxBytes + 1),
    },
    body: "{}",
  });

  const result = await readBoundedJsonBody(request, maxBytes);

  assert.deepEqual(result, {
    ok: false,
    reason: "too_large",
  });
});

test("rejects an oversized streamed body without Content-Length", async () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(maxBytes + 1));
      controller.close();
    },
  });

  const request = new Request(endpoint, {
    method: "POST",
    body,
    duplex: "half",
  } as RequestInit);

  assert.equal(request.headers.get("content-length"), null);

  const result = await readBoundedJsonBody(request, maxBytes);

  assert.deepEqual(result, {
    ok: false,
    reason: "too_large",
  });
});

test("enforces the limit in UTF-8 bytes, not JavaScript string length", async () => {
  const request = new Request(endpoint, {
    method: "POST",
    body: JSON.stringify("é".repeat(1025)),
  });

  const result = await readBoundedJsonBody(request, maxBytes);

  assert.deepEqual(result, {
    ok: false,
    reason: "too_large",
  });
});

test("rejects malformed JSON", async () => {
  const request = new Request(endpoint, {
    method: "POST",
    body: '{"path":',
  });

  const result = await readBoundedJsonBody(request, maxBytes);

  assert.deepEqual(result, {
    ok: false,
    reason: "invalid_json",
  });
});

test("rejects invalid UTF-8", async () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([0xc3, 0x28]));
      controller.close();
    },
  });

  const request = new Request(endpoint, {
    method: "POST",
    body,
    duplex: "half",
  } as RequestInit);

  const result = await readBoundedJsonBody(request, maxBytes);

  assert.deepEqual(result, {
    ok: false,
    reason: "invalid_json",
  });
});