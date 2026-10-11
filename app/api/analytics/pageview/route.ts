
import { NextResponse } from "next/server";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const eventSchema = z
  .object({
    pageviewId: z.uuid(),
    visitorId: z.uuid(),
    sessionId: z.uuid(),
    path: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(/^\/[^?#\s]*$/, "Invalid page path."),
    referrerHost: z
      .string()
      .trim()
      .min(1)
      .max(253)
      .regex(/^(direct|[a-zA-Z0-9.-]+)$/i, "Invalid referrer host."),
    deviceType: z.enum(["mobile", "tablet", "desktop", "unknown"]),
  })
  .strict();

function response(status = 202, accepted = true) {
  return NextResponse.json(
    { accepted },
    {
      status,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    const rawBody = await request.text();

    if (rawBody.length > 2048) {
      return response(413, false);
    }

    body = JSON.parse(rawBody);
  } catch {
    return response(400, false);
  }

  const parsed = eventSchema.safeParse(body);

  if (!parsed.success) {
    return response(400, false);
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    // Anonymous page views are valid. A failed session lookup must never
    // cause a client-supplied user ID to be trusted.
    const actorId = authError ? null : user?.id ?? null;

    const rawCountry = request.headers
      .get("x-vercel-ip-country")
      ?.trim()
      .toUpperCase();

    const countryCode =
      rawCountry && /^[A-Z]{2}$/.test(rawCountry)
        ? rawCountry
        : null;

    const { error } = await createAdminClient().rpc(
      "agore_analytics_record_pageview",
      {
        p_pageview_id: parsed.data.pageviewId,
        p_visitor_id: parsed.data.visitorId,
        p_session_id: parsed.data.sessionId,
        p_user_id: actorId,
        p_path: parsed.data.path,
        p_referrer_host: parsed.data.referrerHost.toLowerCase(),
        p_device_type: parsed.data.deviceType,
        p_country_code: countryCode,
      },
    );

    if (error) {
      console.error("Agoré page-view ingestion failed:", error);
      return response(503, false);
    }

    return response(202, true);
  } catch (error) {
    console.error("Agoré analytics endpoint failed:", error);
    return response(503, false);
  }
}
