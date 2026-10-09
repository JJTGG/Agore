import { NextResponse } from "next/server";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const supportCategories = [
  "account_access",
  "technical_issue",
  "bug_report",
  "safety",
  "privacy",
  "feedback",
  "other",
] as const;

const supportStatuses = [
  "open",
  "in_progress",
  "waiting_on_user",
  "resolved",
  "closed",
] as const;

type SupportCaseSummary = {
  id: string;
  category: (typeof supportCategories)[number];
  subject: string;
  description: string;
  status: (typeof supportStatuses)[number];
  priority: "low" | "normal" | "high" | "urgent";
  created_at: string;
  updated_at: string;
  last_message_at: string;
  resolved_at: string | null;
  closed_at: string | null;
};

const createCaseSchema = z
  .object({
    category: z.enum(supportCategories),
    subject: z.string().trim().min(5).max(160),
    description: z.string().trim().min(10).max(5000),
  })
  .strict();

const statusSchema = z.enum(supportStatuses);
const uuidSchema = z.uuid();

const cursorTimestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function privateJson(
  payload: unknown,
  status = 200,
) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}

async function getAuthenticatedUser() {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

export async function GET(request: Request) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return privateJson(
      { error: "Authentication required." },
      401,
    );
  }

  const url = new URL(request.url);
  const rawLimit = url.searchParams.get("limit");

  let limit = 20;

  if (rawLimit !== null) {
    const parsedLimit = Number(rawLimit);

    if (
      !Number.isInteger(parsedLimit) ||
      parsedLimit < 1 ||
      parsedLimit > 50
    ) {
      return privateJson(
        { error: "Limit must be an integer from 1 to 50." },
        400,
      );
    }

    limit = parsedLimit;
  }

  const rawStatus = url.searchParams.get("status");
  let status: (typeof supportStatuses)[number] | null = null;

  if (rawStatus !== null) {
    const parsedStatus = statusSchema.safeParse(rawStatus);

    if (!parsedStatus.success) {
      return privateJson(
        { error: "Invalid support case status." },
        400,
      );
    }

    status = parsedStatus.data;
  }

  const beforeCreatedAt =
    url.searchParams.get("beforeCreatedAt");
  const beforeId = url.searchParams.get("beforeId");

  if (
    Boolean(beforeCreatedAt) !== Boolean(beforeId)
  ) {
    return privateJson(
      {
        error:
          "Both beforeCreatedAt and beforeId are required for pagination.",
      },
      400,
    );
  }

  let cursorTimestamp: string | null = null;
  let cursorId: string | null = null;

  if (beforeCreatedAt && beforeId) {
    const parsedCursorId = uuidSchema.safeParse(beforeId);

    if (
      !cursorTimestampPattern.test(beforeCreatedAt) ||
      !Number.isFinite(Date.parse(beforeCreatedAt)) ||
      !parsedCursorId.success
    ) {
      return privateJson(
        { error: "Invalid support case cursor." },
        400,
      );
    }

    cursorTimestamp =
      new Date(beforeCreatedAt).toISOString();
    cursorId = parsedCursorId.data;
  }

  const admin = createAdminClient();

  let query = admin
    .from("support_cases")
    .select(
      [
        "id",
        "category",
        "subject",
        "description",
        "status",
        "priority",
        "created_at",
        "updated_at",
        "last_message_at",
        "resolved_at",
        "closed_at",
      ].join(", "),
    )
    .eq("requester_id", user.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  if (cursorTimestamp && cursorId) {
    query = query.or(
      [
        `created_at.lt.${cursorTimestamp}`,
        `and(created_at.eq.${cursorTimestamp},id.lt.${cursorId})`,
      ].join(","),
    );
  }

  const {
    data: cases,
    error,
  } = await query.limit(limit + 1);

  if (error) {
    console.error(
      "Failed to list Agore support cases:",
      error,
    );

    return privateJson(
      { error: "Unable to load support cases." },
      500,
    );
  }

  // The generated Supabase database types do not yet describe
  // these newly introduced support tables. Keep an explicit,
  // local response type until the database types are regenerated.
  const rows = (cases ?? []) as unknown as SupportCaseSummary[];

  const hasMore = rows.length > limit;
  const visibleCases = rows.slice(0, limit);
  const lastCase =
    visibleCases[visibleCases.length - 1];

  return privateJson({
    cases: visibleCases,
    pagination: {
      limit,
      hasMore,
      nextCursor:
        hasMore && lastCase
          ? {
              beforeCreatedAt: lastCase.created_at,
              beforeId: lastCase.id,
            }
          : null,
    },
  });
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return privateJson(
      { error: "Authentication required." },
      401,
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return privateJson(
      { error: "Invalid JSON request body." },
      400,
    );
  }

  const parsedBody = createCaseSchema.safeParse(body);

  if (!parsedBody.success) {
    return privateJson(
      {
        error:
          "Provide a valid category, subject, and description.",
        details: parsedBody.error.flatten(),
      },
      400,
    );
  }

  const {
    category,
    subject,
    description,
  } = parsedBody.data;

  const admin = createAdminClient();

  // Derive ownership from the authenticated session.
  // Never accept requester_id from client-supplied JSON.
  const {
    data: profile,
    error: profileError,
  } = await admin
    .from("profiles")
    .select("id, account_status")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error(
      "Failed to verify Agore support requester:",
      profileError,
    );

    return privateJson(
      { error: "Unable to create a support case." },
      500,
    );
  }

  if (!profile || profile.account_status !== "active") {
    return privateJson(
      { error: "An active profile is required." },
      403,
    );
  }

  // The database function atomically creates the case,
  // opening customer message, and corresponding audit events.
  const {
    data: caseId,
    error: createError,
  } = await admin.rpc(
    "agore_create_support_case",
    {
      p_requester_id: user.id,
      p_category: category,
      p_subject: subject,
      p_description: description,
    },
  );

  if (createError || typeof caseId !== "string") {
    console.error(
      "Failed to create Agore support case:",
      createError,
    );

    return privateJson(
      { error: "Unable to create a support case." },
      500,
    );
  }

  return privateJson(
    {
      case: {
        id: caseId,
        category,
        subject,
        status: "open",
        priority: "normal",
      },
    },
    201,
  );
}