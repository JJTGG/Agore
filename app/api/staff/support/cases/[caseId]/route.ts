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

const SUPPORT_PRIORITIES = [
  "low",
  "normal",
  "high",
  "urgent",
] as const;

type SupportCaseRow = {
  id: string;
  requester_id: string;
  category: string;
  subject: string;
  description: string;
  status: (typeof SUPPORT_STATUSES)[number];
  priority: (typeof SUPPORT_PRIORITIES)[number];
  assigned_to: string | null;
  related_report_id: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string;
  resolved_at: string | null;
  closed_at: string | null;
};

type SupportMessageRow = {
  id: string;
  case_id: string;
  sender_id: string;
  visibility: "customer" | "internal";
  body: string;
  created_at: string;
};

type ProfileSummary = {
  id: string;
  username: string;
  display_name: string;
  avatar_path: string | null;
};

type RouteContext = {
  params: Promise<{
    caseId: string;
  }>;
};

const uuidSchema = z.uuid();

const cursorTimestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

const updateCaseSchema = z
  .object({
    status: z.enum(SUPPORT_STATUSES).optional(),
    priority: z.enum(SUPPORT_PRIORITIES).optional(),
    assignedTo: z.union([
      z.uuid(),
      z.null(),
    ]).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.status !== undefined ||
      value.priority !== undefined ||
      value.assignedTo !== undefined,
    {
      message: "At least one case update is required.",
    },
  );

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

function parseLimit(rawLimit: string | null) {
  if (rawLimit === null) {
    return {
      ok: true as const,
      limit: 50,
    };
  }

  const limit = Number(rawLimit);

  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    return {
      ok: false as const,
    };
  }

  return {
    ok: true as const,
    limit,
  };
}

export async function GET(
  request: Request,
  context: RouteContext,
) {
  const authorization =
    await requireSupportStaff();

  if (!authorization.ok) {
    return authorization.response;
  }

  const { admin } = authorization.context;
  const { caseId } = await context.params;

  const parsedCaseId =
    uuidSchema.safeParse(caseId);

  if (!parsedCaseId.success) {
    return privateJson(
      { error: "Invalid support case ID." },
      400,
    );
  }

  const url = new URL(request.url);
  const params = url.searchParams;

  const parsedLimit = parseLimit(
    params.get("limit"),
  );

  if (!parsedLimit.ok) {
    return privateJson(
      {
        error: "Limit must be an integer from 1 to 100.",
      },
      400,
    );
  }

  const limit = parsedLimit.limit;
  const beforeCreatedAt =
    params.get("beforeCreatedAt");
  const beforeId = params.get("beforeId");

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
    const parsedCursorId =
      uuidSchema.safeParse(beforeId);

    if (
      beforeCreatedAt.length > 40 ||
      !cursorTimestampPattern.test(
        beforeCreatedAt,
      ) ||
      !Number.isFinite(
        Date.parse(beforeCreatedAt),
      ) ||
      !parsedCursorId.success
    ) {
      return privateJson(
        { error: "Invalid message cursor." },
        400,
      );
    }

    cursorTimestamp = beforeCreatedAt;
    cursorId = parsedCursorId.data;
  }

  const {
    data: caseData,
    error: caseError,
  } = await admin
    .from("support_cases")
    .select(
      [
        "id",
        "requester_id",
        "category",
        "subject",
        "description",
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
    .eq("id", parsedCaseId.data)
    .maybeSingle();

  if (caseError) {
    console.error(
      "Failed to load staff support case:",
      caseError,
    );

    return privateJson(
      { error: "Unable to load the support case." },
      500,
    );
  }

  if (!caseData) {
    return privateJson(
      { error: "Support case not found." },
      404,
    );
  }

  const supportCase =
    caseData as unknown as SupportCaseRow;

  let messagesQuery = admin
    .from("support_case_messages")
    .select(
      "id, case_id, sender_id, visibility, body, created_at",
    )
    .eq("case_id", parsedCaseId.data)
    .order("created_at", {
      ascending: false,
    })
    .order("id", {
      ascending: false,
    });

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
      "Failed to load staff support conversation:",
      messagesError,
    );

    return privateJson(
      { error: "Unable to load support messages." },
      500,
    );
  }

  const messageRows =
    (messageData ?? []) as unknown as SupportMessageRow[];

  const hasMore =
    messageRows.length > limit;

  const visibleMessages =
    messageRows.slice(0, limit);

  const oldestVisible =
    visibleMessages[visibleMessages.length - 1];

  const profileIds = [
    ...new Set([
      supportCase.requester_id,
      ...(supportCase.assigned_to
        ? [supportCase.assigned_to]
        : []),
      ...visibleMessages.map(
        (message) => message.sender_id,
      ),
    ]),
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
        "Failed to load support case profiles:",
        profilesError,
      );

      return privateJson(
        {
          error:
            "Unable to load support case participants.",
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

  // Staff are authorized to view both customer-visible messages
  // and internal notes. Customer APIs must continue filtering
  // visibility = "customer".
  const messages = visibleMessages
    .slice()
    .reverse()
    .map((message) => ({
      id: message.id,
      body: message.body,
      visibility: message.visibility,
      created_at: message.created_at,
      sender:
        profilesById.get(message.sender_id) ?? null,
    }));

  return privateJson({
    case: {
      id: supportCase.id,
      category: supportCase.category,
      subject: supportCase.subject,
      description: supportCase.description,
      status: supportCase.status,
      priority: supportCase.priority,
      assigned_to: supportCase.assigned_to,
      related_report_id:
        supportCase.related_report_id,
      created_at: supportCase.created_at,
      updated_at: supportCase.updated_at,
      last_message_at:
        supportCase.last_message_at,
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
    },
    messages,
    pagination: {
      limit,
      hasMore,
      nextCursor:
        hasMore && oldestVisible
          ? {
              beforeCreatedAt:
                oldestVisible.created_at,
              beforeId: oldestVisible.id,
            }
          : null,
    },
  });
}

export async function PATCH(
  request: Request,
  context: RouteContext,
) {
  const authorization =
    await requireSupportStaff();

  if (!authorization.ok) {
    return authorization.response;
  }

  const { user, admin } =
    authorization.context;

  const { caseId } = await context.params;

  const parsedCaseId =
    uuidSchema.safeParse(caseId);

  if (!parsedCaseId.success) {
    return privateJson(
      { error: "Invalid support case ID." },
      400,
    );
  }

  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return privateJson(
      { error: "Invalid JSON request body." },
      400,
    );
  }

  const parsedBody =
    updateCaseSchema.safeParse(rawBody);

  if (!parsedBody.success) {
    return privateJson(
      {
        error:
          "Provide at least one valid status, priority, or assignment change.",
        details: parsedBody.error.flatten(),
      },
      400,
    );
  }

  const changes = parsedBody.data;
  const updateAssignee =
    changes.assignedTo !== undefined;

  const {
    data: updatedCase,
    error: updateError,
  } = await admin.rpc(
    "agore_staff_update_support_case",
    {
      p_case_id: parsedCaseId.data,
      p_actor_id: user.id,
      p_status: changes.status ?? null,
      p_priority: changes.priority ?? null,
      p_update_assignee: updateAssignee,
      p_assigned_to:
        changes.assignedTo ?? null,
    },
  );

  if (updateError) {
    if (updateError.code === "P0002") {
      return privateJson(
        { error: "Support case not found." },
        404,
      );
    }

    if (updateError.code === "42501") {
      return privateJson(
        { error: "Support staff access required." },
        403,
      );
    }

    if (updateError.code === "22023") {
      return privateJson(
        {
          error:
            "The requested case update is invalid. Verify the status, priority, and assignee.",
        },
        400,
      );
    }

    console.error(
      "Failed to update staff support case:",
      updateError,
    );

    return privateJson(
      { error: "Unable to update the support case." },
      500,
    );
  }

  if (
    !updatedCase ||
    typeof updatedCase !== "object"
  ) {
    console.error(
      "Support update returned an unexpected result.",
    );

    return privateJson(
      { error: "Unable to confirm the case update." },
      500,
    );
  }

  return privateJson({
    success: true,
    case: updatedCase,
  });
}