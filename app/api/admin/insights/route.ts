
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
  const days = Number(url.searchParams.get("days") ?? "30");

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
    const [insightsResult, retentionResult] = await Promise.all([
      admin.rpc("agore_admin_get_insights", {
        p_actor_id: user.id,
        p_days: days,
      }),
      admin.rpc("agore_admin_get_retention", {
        p_actor_id: user.id,
      }),
    ]);

    const errors = [
      insightsResult.error,
      retentionResult.error,
    ].filter(Boolean);

    if (errors.length > 0) {
      const denied = errors.some((error) => error?.code === "42501");

      if (denied) {
        return privateJson(
          { error: "Administrative access required." },
          403,
        );
      }

      const invalid = errors.some((error) => error?.code === "22023");

      if (invalid) {
        return privateJson(
          { error: "Invalid reporting parameters." },
          400,
        );
      }

      console.error("Failed to load Agoré Insights:", errors);

      return privateJson(
        { error: "Unable to load platform analytics." },
        500,
      );
    }

    const data = insightsResult.data;
    const retention = retentionResult.data;

    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      !retention ||
      typeof retention !== "object" ||
      Array.isArray(retention)
    ) {
      return privateJson(
        { error: "The analytics response was invalid." },
        500,
      );
    }

    return privateJson({
      ...(data as Record<string, unknown>),
      retention,
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
