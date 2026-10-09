
import { NextResponse } from "next/server";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{
    caseId: string;
  }>;
};

type SupportCaseSummary = {
  id: string;
  category: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
  last_message_at: string;
  resolved_at: string | null;
  closed_at: string | null;
};

type SupportCaseMessage = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

const uuidSchema = z.uuid();

const cursorTimestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

function privateJson(payload: unknown, status = 200) {
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

export async function GET(
  request: Request,
  context: RouteContext,
) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return privateJson(
      { error: "Authentication required." },
      401,
    );
  }

  const { caseId } = await context.params;
  const parsedCaseId = uuidSchema.safeParse(caseId);

  if (!parsedCaseId.success) {
    return privateJson(
      { error: "Invalid support case ID." },
      400,
    );
  }

  const url = new URL(request.url);
  const rawLimit = url.searchParams.get("limit");

  let limit = 50;

  if (rawLimit !== null) {
    const parsedLimit = Number(rawLimit);

    if (
      !Number.isInteger(parsedLimit) ||
      parsedLimit < 1 ||
      parsedLimit > 100
    ) {
      return privateJson(
        { error: "Limit must be an integer from 1 to 100." },
        400,
      );
    }

    limit = parsedLimit;
  }

  const beforeCreatedAt =
    url.searchParams.get("beforeCreatedAt");
  const beforeId = url.searchParams.get("beforeId");

  if (Boolean(beforeCreatedAt) !== Boolean(beforeId)) {
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
      beforeCreatedAt.length > 40 ||
      !cursorTimestampPattern.test(beforeCreatedAt) ||
      !Number.isFinite(Date.parse(beforeCreatedAt)) ||
      !parsedCursorId.success
    ) {
      return privateJson(
        { error: "Invalid support message cursor." },
        400,
      );
    }

    cursorTimestamp =
      new Date(beforeCreatedAt).toISOString();
    cursorId = parsedCursorId.data;
  }

  const admin = createAdminClient();

  // Ownership is enforced directly in the database query.
  const {
    data: supportCase,
    error: caseError,
  } = await admin
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
    .eq("id", parsedCaseId.data)
    .eq("requester_id", user.id)
    .maybeSingle();

  if (caseError) {
    console.error(
      "Failed to load Agore support case:",
      caseError,
    );

    return privateJson(
      { error: "Unable to load support case." },
      500,
    );
  }

  if (!supportCase) {
    return privateJson(
      { error: "Support case not found." },
      404,
    );
  }

  let messagesQuery = admin
    .from("support_case_messages")
    .select("id, sender_id, body, created_at")
    .eq("case_id", parsedCaseId.data)
    .eq("visibility", "customer")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (cursorTimestamp && cursorId) {
    messagesQuery = messagesQuery.or(
      [
        `created_at.lt.${cursorTimestamp}`,
        `and(created_at.eq.${cursorTimestamp},id.lt.${cursorId})`,
      ].join(","),
    );
  }

  const {
    data: messageData,
    error: messagesError,
  } = await messagesQuery.limit(limit + 1);

  if (messagesError) {
    console.error(
      "Failed to load Agore support messages:",
      messagesError,
    );

    return privateJson(
      { error: "Unable to load support conversation." },
      500,
    );
  }

  // Local types are used until generated Supabase types
  // include the new support tables.
  const rows = (
    messageData ?? []
  ) as unknown as SupportCaseMessage[];

  const hasMore = rows.length > limit;
  const visibleRows = rows.slice(0, limit);
  const oldestVisible =
    visibleRows[visibleRows.length - 1];

  // Return messages chronologically for the conversation UI.
  const messages = visibleRows
    .slice()
    .reverse()
    .map((message) => ({
      id: message.id,
      body: message.body,
      created_at: message.created_at,
      sender:
        message.sender_id === user.id
          ? "you"
          : "support",
    }));

  return privateJson({
    // Fix: Supabase's current generated type requires
    // casting through unknown for this locally defined type.
    case: supportCase as unknown as SupportCaseSummary,
    messages,
    pagination: {
      limit,
      hasMore,
      nextCursor:
        hasMore && oldestVisible
          ? {
              beforeCreatedAt: oldestVisible.created_at,
              beforeId: oldestVisible.id,
            }
          : null,
    },
  });
}
