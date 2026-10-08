import { createServerClient } from "@supabase/ssr";
import {
  NextResponse,
  type NextRequest,
} from "next/server";

import {
  getConversationMessagingAccess,
} from "@/lib/messaging/conversation-access";
import {
  checkAgoreRateLimit,
  getAgoreRateLimitBucket,
} from "@/lib/security/rate-limit";

function getConversationIdFromPath(
  pathname: string,
) {
  const match = pathname.match(
    /^\/api\/conversations\/([^/]+)(?:\/|$)/,
  );

  const conversationId = match?.[1];

  if (
    !conversationId ||
    !/^[0-9a-fA-F-]{36}$/.test(
      conversationId,
    )
  ) {
    return null;
  }

  return conversationId;
}

export async function updateSession(
  request: NextRequest,
) {
  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env
      .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(
            ({ name, value }) => {
              request.cookies.set(
                name,
                value,
              );
            },
          );

          response = NextResponse.next({
            request,
          });

          cookiesToSet.forEach(
            ({
              name,
              value,
              options,
            }) => {
              response.cookies.set(
                name,
                value,
                options,
              );
            },
          );
        },
      },
    },
  );

  const {
    data: claimsData,
  } = await supabase.auth.getClaims();

  const userId =
    typeof claimsData?.claims?.sub ===
    "string"
      ? claimsData.claims.sub
      : null;

  const bucket =
    getAgoreRateLimitBucket(
      request,
    );

  if (bucket && userId) {
    const {
      result,
      error,
    } = await checkAgoreRateLimit(
      supabase,
      bucket,
    );

    if (error) {
      console.error(
        "Agore rate limiter failed:",
        error,
      );

      const headers = new Headers(
        response.headers,
      );

      headers.set(
        "content-type",
        "application/json",
      );

      return new NextResponse(
        JSON.stringify({
          error:
            "Rate limiting is temporarily unavailable.",
        }),
        {
          status: 503,
          headers,
        },
      );
    }

    response.headers.set(
      "X-RateLimit-Limit",
      String(result.limit_count),
    );

    response.headers.set(
      "X-RateLimit-Remaining",
      String(result.remaining),
    );

    response.headers.set(
      "X-RateLimit-Reset",
      String(
        result.retry_after_seconds,
      ),
    );

    if (!result.allowed) {
      const headers = new Headers(
        response.headers,
      );

      headers.set(
        "content-type",
        "application/json",
      );

      headers.set(
        "Retry-After",
        String(
          result.retry_after_seconds,
        ),
      );

      return new NextResponse(
        JSON.stringify({
          error:
            "Too many requests. Please try again shortly.",
        }),
        {
          status: 429,
          headers,
        },
      );
    }
  }

  /*
   * Every conversation-scoped API request must pass
   * the same messaging access boundary.
   *
   * /api/conversations/direct
   * /api/conversations/group
   * and /api/conversations (list)
   * intentionally do not have a conversation UUID
   * in their pathname and are handled by their own routes.
   */
  if (userId) {
    const conversationId =
      getConversationIdFromPath(
        request.nextUrl.pathname,
      );

    if (conversationId) {
      const access =
        await getConversationMessagingAccess(
          conversationId,
          userId,
        );

      if (!access.ok) {
        const headers = new Headers(
          response.headers,
        );

        headers.set(
          "content-type",
          "application/json",
        );

        return new NextResponse(
          JSON.stringify({
            error: access.error,
          }),
          {
            status: access.status,
            headers,
          },
        );
      }
    }
  }

  return response;
}