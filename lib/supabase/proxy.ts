import { createServerClient } from "@supabase/ssr";
import {
  NextResponse,
  type NextRequest,
} from "next/server";

import {
  checkAgoreRateLimit,
  getAgoreRateLimitBucket,
} from "@/lib/security/rate-limit";

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

  const bucket =
    getAgoreRateLimitBucket(
      request,
    );

  const userId =
    typeof claimsData?.claims?.sub ===
    "string"
      ? claimsData.claims.sub
      : null;

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

  return response;
}