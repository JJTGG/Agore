export type BoundedJsonBodyResult =
  | {
      ok: true;
      value: unknown;
    }
  | {
      ok: false;
      reason: "too_large" | "invalid_json";
    };

export async function readBoundedJsonBody(
  request: Request,
  maxBytes: number,
): Promise<BoundedJsonBodyResult> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError("maxBytes must be a non-negative safe integer.");
  }

  const contentLength = request.headers.get("content-length");

  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) {
      return {
        ok: false,
        reason: "invalid_json",
      };
    }

    const declaredBytes = Number(contentLength);

    if (
      !Number.isSafeInteger(declaredBytes) ||
      declaredBytes > maxBytes
    ) {
      return {
        ok: false,
        reason: "too_large",
      };
    }
  }

  if (!request.body) {
    return {
      ok: false,
      reason: "invalid_json",
    };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      if (value.byteLength > maxBytes - totalBytes) {
        try {
          await reader.cancel();
        } catch {
          // The size limit is already exceeded.
        }

        return {
          ok: false,
          reason: "too_large",
        };
      }

      totalBytes += value.byteLength;
      chunks.push(value);
    }
  } catch {
    return {
      ok: false,
      reason: "invalid_json",
    };
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder("utf-8", {
      fatal: true,
    }).decode(bytes);

    return {
      ok: true,
      value: JSON.parse(text) as unknown,
    };
  } catch {
    return {
      ok: false,
      reason: "invalid_json",
    };
  }
}