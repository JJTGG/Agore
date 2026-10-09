
import { NextResponse } from "next/server";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{
    caseId: string;
  }>;
};

type SupportCaseForReply = {
  id: string;
  status: string;
};

const uuidSchema = z.uuid();

const replySchema = z
  .object({
    body: z.string().trim().min(1).max(5000),
  })
  .strict();

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

export async function POST(
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

  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return privateJson(
      { error: "Invalid JSON request body." },
      400,
    );
  }

  const parsedBody = replySchema.safeParse(rawBody);

  if (!parsedBody.success) {
    return privateJson(
      {
        error:
          "A message containing 1 to 5000 characters is required.",
        details: parsedBody.error.flatten(),
      },
      400,
    );
  }

  const body = parsedBody.data.body;
  const admin = createAdminClient();

  // Verify that the authenticated requester still has an
  // active profile before attempting to submit a reply.
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
      { error: "Unable to submit support reply." },
      500,
    );
  }

  if (!profile || profile.account_status !== "active") {
    return privateJson(
      { error: "An active profile is required." },
      403,
    );
  }

  // Ownership is checked in the query. The database function
  // also independently enforces ownership and case status.
  const {
    data: caseData,
    error: caseError,
  } = await admin
    .from("support_cases")
    .select("id, status")
    .eq("id", parsedCaseId.data)
    .eq("requester_id", user.id)
    .maybeSingle();

  if (caseError) {
    console.error(
      "Failed to verify Agore support case ownership:",
      caseError,
    );

    return privateJson(
      { error: "Unable to submit support reply." },
      500,
    );
  }

  const supportCase =
    caseData as unknown as SupportCaseForReply | null;

  if (!supportCase) {
    return privateJson(
      { error: "Support case not found." },
      404,
    );
  }

  if (supportCase.status === "closed") {
    return privateJson(
      {
        error:
          "This support case is closed and cannot receive replies.",
      },
      409,
    );
  }

  // The database function atomically inserts the message,
  // updates the case timestamps, reopens eligible cases,
  // and records the audit events.
  const {
    data: messageId,
    error: messageError,
  } = await admin.rpc(
    "agore_add_support_case_message",
    {
      p_case_id: parsedCaseId.data,
      p_sender_id: user.id,
      p_body: body,
    },
  );

  if (messageError) {
    console.error(
      "Failed to submit Agore support reply:",
      messageError,
    );

    if (messageError.code === "P0002") {
      return privateJson(
        { error: "Support case not found." },
        404,
      );
    }

    if (messageError.code === "22023") {
      return privateJson(
        {
          error:
            "This case cannot accept a reply. Check its status and your account.",
        },
        409,
      );
    }

    return privateJson(
      { error: "Unable to submit support reply." },
      500,
    );
  }

  if (typeof messageId !== "string") {
    // The RPC succeeded without returning the expected ID.
    // Do not tell the client to retry an operation that may
    // already have been committed.
    console.error(
      "Agore support reply succeeded without a message ID.",
    );

    return privateJson(
      {
        success: true,
        refreshRequired: true,
        caseId: parsedCaseId.data,
      },
      201,
    );
  }

  return privateJson(
    {
      success: true,
      message: {
        id: messageId,
        body,
        sender: "you",
      },
      caseId: parsedCaseId.data,
      refreshRequired: true,
    },
    201,
  );
}
