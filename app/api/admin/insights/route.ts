
import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin/admin-auth";

export const dynamic = "force-dynamic";

function privateJson(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawDays = url.searchParams.get("days") ?? "30";
  const days = Number(rawDays);

  if (![7, 30, 90].includes(days)) {
    return privateJson(
      { error: "Choose a reporting period of 7, 30, or 90 days." },
      400,
    );
  }

  const authorization = await requireAdminAccess("overview");

  if (!authorization.ok) {
    return authorization.response;
  }

  const { admin, role, user } = authorization.context;

  try {
    const { data, error } = await admin.rpc(
      "agore_admin_get_insights",
      {
        p_actor_id: user.id,
        p_days: days,
      },
    );

    if (error) {
      if (error.code === "42501") {
        return privateJson(
          { error: "Administrative access required." },
          403,
        );
      }

      if (error.code === "22023") {
        return privateJson(
          { error: "Invalid reporting period." },
          400,
        );
      }

      console.error("Failed to load Agoré Insights:", error);

      return privateJson(
        { error: "Unable to load platform analytics." },
        500,
      );
    }

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return privateJson(
        { error: "The analytics response was invalid." },
        500,
      );
    }

    return privateJson({
      ...(data as Record<string, unknown>),
      role,
    });
  } catch (error) {
    console.error("Agoré Insights API failed:", error);

    return privateJson(
      { error: "Unable to load platform analytics." },
      500,
    );
  }
}
