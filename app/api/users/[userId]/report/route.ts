import { NextResponse } from "next/server";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const userIdSchema = z.uuid();

const reportSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1)
    .max(100),
  details: z
    .string()
    .trim()
    .max(2000)
    .nullable()
    .optional(),
});

type RouteContext = {
  params: Promise<{
    userId: string;
  }>;
};

export async function POST(
  request: Request,
  context: RouteContext,
) {
  const supabase =
    await createClient();

  const {
    data: { user },
    error: userError,
  } =
    await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      {
        error:
          "Authentication required.",
      },
      {
        status: 401,
      },
    );
  }

  const { userId } =
    await context.params;

  const parsedUserId =
    userIdSchema.safeParse(
      userId,
    );

  if (!parsedUserId.success) {
    return NextResponse.json(
      {
        error:
          "Invalid user ID.",
      },
      {
        status: 400,
      },
    );
  }

  const targetUserId =
    parsedUserId.data;

  if (targetUserId === user.id) {
    return NextResponse.json(
      {
        error:
          "You cannot report your own profile.",
      },
      {
        status: 400,
      },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error:
          "Invalid request body.",
      },
      {
        status: 400,
      },
    );
  }

  const parsedBody =
    reportSchema.safeParse(
      body,
    );

  if (!parsedBody.success) {
    return NextResponse.json(
      {
        error:
          "A valid report reason is required.",
      },
      {
        status: 400,
      },
    );
  }

  const {
    reason,
    details = null,
  } = parsedBody.data;

  const admin =
    createAdminClient();

  const {
    data: targetProfile,
    error: targetProfileError,
  } = await admin
    .from("profiles")
    .select(
      "id, account_status",
    )
    .eq(
      "id",
      targetUserId,
    )
    .maybeSingle();

  if (targetProfileError) {
    console.error(
      "Failed to load Agore profile for report:",
      targetProfileError,
    );

    return NextResponse.json(
      {
        error:
          "Unable to report this profile.",
      },
      {
        status: 500,
      },
    );
  }

  if (
    !targetProfile ||
    targetProfile.account_status !==
      "active"
  ) {
    return NextResponse.json(
      {
        error:
          "Profile not found.",
      },
      {
        status: 404,
      },
    );
  }

  const {
    data: existingReport,
    error: existingReportError,
  } = await supabase
    .from("reports")
    .select("id")
    .eq(
      "reporter_id",
      user.id,
    )
    .eq(
      "target_type",
      "profile",
    )
    .eq(
      "target_id",
      targetUserId,
    )
    .in("status", [
      "pending",
      "reviewed",
      "actioned",
    ])
    .limit(1)
    .maybeSingle();

  if (existingReportError) {
    console.error(
      "Failed to check existing Agore profile report:",
      existingReportError,
    );

    return NextResponse.json(
      {
        error:
          "Unable to report this profile.",
      },
      {
        status: 500,
      },
    );
  }

  if (existingReport) {
    return NextResponse.json(
      {
        error:
          "You have already reported this profile.",
      },
      {
        status: 409,
      },
    );
  }

  const {
    data: report,
    error: reportError,
  } = await supabase
    .from("reports")
    .insert({
      reporter_id:
        user.id,
      target_type:
        "profile",
      target_id:
        targetUserId,
      reason,
      details,
    })
    .select(
      "id, target_type, target_id, reason, status, created_at",
    )
    .single();

  if (reportError) {
    console.error(
      "Failed to create Agore profile report:",
      reportError,
    );

    return NextResponse.json(
      {
        error:
          "Unable to submit the report.",
      },
      {
        status: 500,
      },
    );
  }

  return NextResponse.json(
    {
      report,
    },
    {
      status: 201,
    },
  );
}