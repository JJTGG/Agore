import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSupportStaff } from "@/lib/support/staff-auth";

const SUPPORT_STATUSES = [
  "open",
  "in_progress",
  "waiting_on_user",
  "resolved",
  "closed",
] as const;

const ACTIVE_STATUSES = [
  "open",
  "in_progress",
  "waiting_on_user",
] as const;

const SUPPORT_CATEGORIES = [
  "account_access",
  "technical_issue",
  "bug_report",
  "safety",
  "privacy",
  "feedback",
  "other",
] as const;

const SUPPORT_PRIORITIES = [
  "low",
  "normal",
  "high",
  "urgent",
] as const;

const uuidSchema = z.uuid();

type SupportStatus =
  (typeof SUPPORT_STATUSES)[number];

type SupportCaseQueueRow = {
  id: string;
  requester_id: string;
  category: (typeof SUPPORT_CATEGORIES)[number];
  subject: string;
  status: SupportStatus;
  priority: (typeof SUPPORT_PRIORITIES)[number];
  assigned_to: string | null;
  related_report_id: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string;
  resolved_at: string | null;
  closed_at: string | null;
};

type ProfileSummary = {
  id: string;
  username: string;
  display_name: string;
  avatar_path: string | null;
};

const cursorTimestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

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

export async function GET(request: Request) {
  const authorization =
    await requireSupportStaff();

  if (!authorization.ok) {
    return authorization.response;
  }

  const { user, admin } =
    authorization.context;

  const url = new URL(request.url);
  const params = url.searchParams;

  const rawLimit = params.get("limit");
  let limit = 25;

  if (rawLimit !== null) {
    const parsedLimit = Number(rawLimit);

    if (
      !Number.isInteger(parsedLimit) ||
      parsedLimit < 1 ||
      parsedLimit > 50
    ) {
      return privateJson(
        {
          error:
            "Limit must be an integer from 1 to 50.",
        },
        400,
      );
    }

    limit = parsedLimit;
  }

  const rawStatus = params.get("status");
  let status: SupportStatus | "all" | null = null;

  if (rawStatus !== null) {
    if (rawStatus === "all") {
      status = "all";
    } else {
      const parsedStatus =
        z.enum(SUPPORT_STATUSES).safeParse(rawStatus);

      if (!parsedStatus.success) {
        return privateJson(
          { error: "Invalid support case status." },
          400,
        );
      }

      status = parsedStatus.data;
    }
  }

  const rawCategory = params.get("category");
  let category:
    | (typeof SUPPORT_CATEGORIES)[number]
    | null = null;

  if (rawCategory !== null) {
    const parsedCategory =
      z.enum(SUPPORT_CATEGORIES).safeParse(rawCategory);

    if (!parsedCategory.success) {
      return privateJson(
        { error: "Invalid support case category." },
        400,
      );
    }

    category = parsedCategory.data;
  }

  const rawPriority = params.get("priority");
  let priority:
    | (typeof SUPPORT_PRIORITIES)[number]
    | null = null;

  if (rawPriority !== null) {
    const parsedPriority =
      z.enum(SUPPORT_PRIORITIES).safeParse(rawPriority);

    if (!parsedPriority.success) {
      return privateJson(
        { error: "Invalid support case priority." },
        400,
      );
    }

    priority = parsedPriority.data;
  }

  const rawAssignment =
    params.get("assignment") ?? "all";

  if (
    !["all", "mine", "unassigned"].includes(
      rawAssignment,
    )
  ) {
    return privateJson(
      {
        error:
          "Assignment must be all, mine, or unassigned.",
      },
      400,
    );
  }

  const beforeLastMessageAt =
    params.get("beforeLastMessageAt");
  const beforeId = params.get("beforeId");

  if (
    Boolean(beforeLastMessageAt) !== Boolean(beforeId)
  ) {
    return privateJson(
      {
        error:
          "Both beforeLastMessageAt and beforeId are required for pagination.",
      },
      400,
    );
  }

  let cursorTimestamp: string | null = null;
  let cursorId: string | null = null;

  if (beforeLastMessageAt && beforeId) {
    const parsedCursorId =
      uuidSchema.safeParse(beforeId);

    if (
      beforeLastMessageAt.length > 40 ||
      !cursorTimestampPattern.test(
        beforeLastMessageAt,
      ) ||
      !Number.isFinite(
        Date.parse(beforeLastMessageAt),
      ) ||
      !parsedCursorId.success
    ) {
      return privateJson(
        { error: "Invalid support queue cursor." },
        400,
      );
    }

    // Retain the supplied timestamp precision so that
    // keyset pagination does not round cursor timestamps.
    cursorTimestamp = beforeLastMessageAt;
    cursorId = parsedCursorId.data;
  }

  let query = admin
    .from("support_cases")
    .select(
      [
        "id",
        "requester_id",
        "category",
        "subject",
        "status",
        "priority",
        "assigned_to",
        "related_report_id",
        "created_at",
        "updated_at",
        "last_message_at",
        "resolved_at",
        "closed_at",
      ].join(", "),
    )
    .order("last_message_at", {
      ascending: false,
    })
    .order("id", {
      ascending: false,
    });

  if (status === null) {
    query = query.in(
      "status",
      [...ACTIVE_STATUSES],
    );
  } else if (status !== "all") {
    query = query.eq("status", status);
  }

  if (category !== null) {
    query = query.eq("category", category);
  }

  if (priority !== null) {
    query = query.eq("priority", priority);
  }

  if (rawAssignment === "mine") {
    query = query.eq("assigned_to", user.id);
  } else if (rawAssignment === "unassigned") {
    query = query.is("assigned_to", null);
  }

  if (cursorTimestamp && cursorId) {
    query = query.or(
      [
        `last_message_at.lt.${cursorTimestamp}`,
        `and(last_message_at.eq.${cursorTimestamp},id.lt.${cursorId})`,
      ].join(","),
    );
  }

  const {
    data: caseData,
    error: caseError,
  } = await query.limit(limit + 1);

  if (caseError) {
    console.error(
      "Failed to load Agore staff support queue:",
      caseError,
    );

    return privateJson(
      { error: "Unable to load the support queue." },
      500,
    );
  }

  // Generated Supabase types may not yet include these
  // support tables, so the queue uses an explicit local type.
  const rows =
    (caseData ?? []) as unknown as SupportCaseQueueRow[];

  const hasMore = rows.length > limit;
  const visibleCases = rows.slice(0, limit);
  const lastCase =
    visibleCases[visibleCases.length - 1];

  const profileIds = [
    ...new Set(
      visibleCases.flatMap((supportCase) => [
        supportCase.requester_id,
        ...(supportCase.assigned_to
          ? [supportCase.assigned_to]
          : []),
      ]),
    ),
  ];

  let profilesById =
    new Map<string, ProfileSummary>();

  if (profileIds.length > 0) {
    const {
      data: profileData,
      error: profilesError,
    } = await admin
      .from("profiles")
      .select(
        "id, username, display_name, avatar_path",
      )
      .in("id", profileIds);

    if (profilesError) {
      console.error(
        "Failed to load support queue profile summaries:",
        profilesError,
      );

      return privateJson(
        {
          error:
            "Unable to load support queue profiles.",
        },
        500,
      );
    }

    const profileRows =
      (profileData ?? []) as ProfileSummary[];

    profilesById = new Map(
      profileRows.map((profile) => [
        profile.id,
        profile,
      ]),
    );
  }

  const cases = visibleCases.map((supportCase) => ({
    id: supportCase.id,
    category: supportCase.category,
    subject: supportCase.subject,
    status: supportCase.status,
    priority: supportCase.priority,
    assigned_to: supportCase.assigned_to,
    related_report_id:
      supportCase.related_report_id,
    created_at: supportCase.created_at,
    updated_at: supportCase.updated_at,
    last_message_at: supportCase.last_message_at,
    resolved_at: supportCase.resolved_at,
    closed_at: supportCase.closed_at,
    requester:
      profilesById.get(
        supportCase.requester_id,
      ) ?? null,
    assignee: supportCase.assigned_to
      ? profilesById.get(
          supportCase.assigned_to,
        ) ?? null
      : null,
  }));

  return privateJson({
    cases,
    filters: {
      status: status ?? "active",
      category,
      priority,
      assignment: rawAssignment,
    },
    pagination: {
      limit,
      hasMore,
      nextCursor:
        hasMore && lastCase
          ? {
              beforeLastMessageAt:
                lastCase.last_message_at,
              beforeId: lastCase.id,
            }
          : null,
    },
  });
}