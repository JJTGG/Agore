import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSupportStaff } from "@/lib/support/staff-auth";

type RouteContext = {
  params: Promise<{
    caseId: string;
  }>;
};

const uuidSchema = z.uuid();

const staffMessageSchema = z
  .object({
    body: z.string().trim().min(1).max(5000),
    visibility: z
      .enum(["customer", "internal"])
      .default("customer"),
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

export async function POST(
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
    staffMessageSchema.safeParse(rawBody);

  if (!parsedBody.success) {
    return privateJson(
      {
        error:
          "Provide a message containing 1 to 5000 characters and a valid visibility.",
        details: parsedBody.error.flatten(),
      },
      400,
    );
  }

  const {
    body,
    visibility,
  } = parsedBody.data;

  // The database function independently verifies the actor's
  // current staff role and locks the case during the operation.
  // Message insertion, case-state changes, and audit events
  // are committed atomically by that function.
  const {
    data: messageId,
    error: messageError,
  } = await admin.rpc(
    "agore_staff_add_support_case_message",
    {
      p_case_id: parsedCaseId.data,
      p_sender_id: user.id,
      p_body: body,
      p_visibility: visibility,
    },
  );

  if (messageError) {
    if (messageError.code === "P0002") {
      return privateJson(
        { error: "Support case not found." },
        404,
      );
    }

    if (messageError.code === "42501") {
      return privateJson(
        { error: "Support staff access required." },
        403,
      );
    }

    if (messageError.code === "22023") {
      return privateJson(
        {
          error:
            "This message cannot be added to the case. Check the case status and message details.",
        },
        409,
      );
    }

    console.error(
      "Failed to add Agore staff support message:",
      messageError,
    );

    return privateJson(
      {
        error: "Unable to add the support message.",
      },
      500,
    );
  }

  // The write has succeeded at this point. If the follow-up
  // read fails, tell the client to refresh rather than retrying
  // the write and accidentally creating a duplicate message.
  if (typeof messageId !== "string") {
    console.error(
      "Support message RPC succeeded without returning a message ID.",
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

  const {
    data: savedMessage,
    error: readError,
  } = await admin
    .from("support_case_messages")
    .select(
      "id, case_id, sender_id, visibility, body, created_at",
    )
    .eq("id", messageId)
    .eq("case_id", parsedCaseId.data)
    .maybeSingle();

  if (readError || !savedMessage) {
    if (readError) {
      console.error(
        "Support message was saved but could not be read back:",
        readError,
      );
    }

    return privateJson(
      {
        success: true,
        refreshRequired: true,
        caseId: parsedCaseId.data,
        messageId,
      },
      201,
    );
  }

  return privateJson(
    {
      success: true,
      message: {
        id: savedMessage.id,
        case_id: savedMessage.case_id,
        sender_id: savedMessage.sender_id,
        body: savedMessage.body,
        visibility: savedMessage.visibility,
        created_at: savedMessage.created_at,
      },
      caseId: parsedCaseId.data,
      refreshRequired: true,
    },
    201,
  );
}