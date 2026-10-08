import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

type RateLimitResult = {
  allowed: boolean;
  limit_count: number;
  remaining: number;
  retry_after_seconds: number;
};

export function getAgoreRateLimitBucket(
  request: NextRequest,
): string | null {
  const { pathname } = request.nextUrl;
  const method = request.method.toUpperCase();

  if (
    pathname === "/api/search" &&
    method === "GET"
  ) {
    return "search";
  }

  if (
    pathname === "/api/users/search" &&
    method === "GET"
  ) {
    return "user_search";
  }

  if (!pathname.startsWith("/api/")) {
    return null;
  }

  if (pathname.startsWith("/api/auth/")) {
    return null;
  }

  if (
    pathname.endsWith("/read") ||
    pathname.endsWith("/read-status")
  ) {
    return null;
  }

  if (
    method === "GET" ||
    method === "HEAD" ||
    method === "OPTIONS"
  ) {
    return null;
  }

  if (
    pathname === "/api/onboarding" &&
    method === "POST"
  ) {
    return "onboarding";
  }

  if (
    pathname === "/api/posts" &&
    method === "POST"
  ) {
    return "post_create";
  }

  if (
    /^\/api\/posts\/[^/]+$/.test(pathname)
  ) {
    return "post_create";
  }

  if (
    /^\/api\/posts\/[^/]+\/comments$/.test(
      pathname,
    )
  ) {
    return "comment_create";
  }

  if (
    /^\/api\/comments\/[^/]+$/.test(
      pathname,
    )
  ) {
    return "comment_create";
  }

  if (
    /^\/api\/posts\/[^/]+\/reaction$/.test(
      pathname,
    )
  ) {
    return "post_reaction";
  }

  if (
    /^\/api\/posts\/[^/]+\/repost$/.test(
      pathname,
    )
  ) {
    return "repost";
  }

  if (
    /^\/api\/posts\/[^/]+\/report$/.test(
      pathname,
    )
  ) {
    return "report_create";
  }

  if (
    /^\/api\/posts\/[^/]+\/media$/.test(
      pathname,
    )
  ) {
    return "media_prepare";
  }

  if (
    /^\/api\/users\/[^/]+\/follow$/.test(
      pathname,
    ) ||
    /^\/api\/users\/[^/]+\/block$/.test(
      pathname,
    )
  ) {
    return "relationship_change";
  }

  if (
    /^\/api\/users\/[^/]+\/report$/.test(
      pathname,
    )
  ) {
    return "report_create";
  }

  if (
    pathname === "/api/conversations/direct"
  ) {
    return "conversation_create";
  }

  if (
    pathname === "/api/conversations/group"
  ) {
    return "group_create";
  }

  if (
    /^\/api\/conversations\/[^/]+\/members$/.test(
      pathname,
    )
  ) {
    return "member_change";
  }

  if (
    /^\/api\/conversations\/[^/]+\/messages$/.test(
      pathname,
    )
  ) {
    return "message_write";
  }

  if (
    /^\/api\/conversations\/[^/]+\/messages\/[^/]+$/.test(
      pathname,
    )
  ) {
    return "message_write";
  }

  if (
    /^\/api\/conversations\/[^/]+\/messages\/[^/]+\/forward$/.test(
      pathname,
    )
  ) {
    return "message_write";
  }

  if (
    /^\/api\/conversations\/[^/]+\/messages\/[^/]+\/reaction$/.test(
      pathname,
    )
  ) {
    return "message_reaction";
  }

  if (
    /^\/api\/conversations\/[^/]+\/media$/.test(
      pathname,
    )
  ) {
    return "media_prepare";
  }

  if (
    /^\/api\/conversations\/[^/]+\/voice$/.test(
      pathname,
    )
  ) {
    return "voice_prepare";
  }

  if (
    /^\/api\/conversations\/[^/]+\/group-image$/.test(
      pathname,
    )
  ) {
    return "media_prepare";
  }

  if (
    pathname === "/api/profile" ||
    pathname === "/api/profile/avatar"
  ) {
    return "profile_write";
  }

  return "generic_mutation";
}

export async function checkAgoreRateLimit(
  supabase: Pick<SupabaseClient, "rpc">,
  bucket: string,
): Promise<
  | {
      result: RateLimitResult;
      error: null;
    }
  | {
      result: null;
      error: Error;
    }
> {
  const { data, error } = await supabase.rpc(
    "agore_rate_limit",
    {
      p_bucket: bucket,
    },
  );

  if (error) {
    return {
      result: null,
      error: new Error(
        error.message ??
          "Unable to evaluate Agore rate limit.",
      ),
    };
  }

  const row = Array.isArray(data)
    ? data[0]
    : data;

  if (
    !row ||
    typeof row !== "object"
  ) {
    return {
      result: null,
      error: new Error(
        "Agore rate limiter returned an invalid response.",
      ),
    };
  }

  const record =
    row as Record<string, unknown>;

  if (
    typeof record.allowed !== "boolean" ||
    typeof record.limit_count !== "number" ||
    typeof record.remaining !== "number" ||
    typeof record.retry_after_seconds !==
      "number"
  ) {
    return {
      result: null,
      error: new Error(
        "Agore rate limiter returned an invalid response.",
      ),
    };
  }

  return {
    result: {
      allowed: record.allowed,
      limit_count: Math.max(
        0,
        Math.trunc(
          record.limit_count,
        ),
      ),
      remaining: Math.max(
        0,
        Math.trunc(
          record.remaining,
        ),
      ),
      retry_after_seconds: Math.max(
        1,
        Math.trunc(
          record.retry_after_seconds,
        ),
      ),
    },
    error: null,
  };
}