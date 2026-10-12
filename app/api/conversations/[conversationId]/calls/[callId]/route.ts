import { NextResponse } from "next/server";
import { z } from "zod";

import { getConversationMessagingAccess } from "@/lib/messaging/conversation-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const paramsSchema = z.object({
  conversationId: z.string().uuid(),
  callId: z.string().uuid(),
});

const transitionSchema = z
  .object({
    action: z.enum(["accept", "decline", "cancel", "end", "fail"]),
    failureReason: z.string().trim().max(240).optional(),
  })
  .strict();

const CALL_FIELDS = [
  "id",
  "conversation_id",
  "caller_id",
  "callee_id",
  "status",
  "created_at",
  "answered_at",
  "ended_at",
  "duration_seconds",
  "ended_by",
  "failure_reason",
  "updated_at",
].join(", ");

const RING_TIMEOUT_MS = 60_000;

type CallStatus =
  | "ringing"
  | "accepted"
  | "completed"
  | "declined"
  | "missed"
  | "cancelled"
  | "failed";

type CallRecord = {
  id: string;
  conversation_id: string;
  caller_id: string;
  callee_id: string;
  status: CallStatus;
  created_at: string;
  answered_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  ended_by: string | null;
  failure_reason: string | null;
  updated_at: string;
};

type RouteContext = {
  params: Promise<{
    conversationId: string;
    callId: string;
  }>;
};

function jsonError(error: string, status: number, code?: string) {
  return NextResponse.json(
    { error, ...(code ? { code } : {}) },
    { status },
  );
}

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      user: null,
      response: jsonError("Authentication required.", 401),
    };
  }

  return { user, response: null };
}

export async function PATCH(request: Request, context: RouteContext) {
  const { user, response: authResponse } = await getAuthenticatedUser();

  if (authResponse || !user) {
    return authResponse;
  }

  const parsedParams = paramsSchema.safeParse(await context.params);

  if (!parsedParams.success) {
    return jsonError("Invalid conversation or call ID.", 400);
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  const parsedBody = transitionSchema.safeParse(rawBody);

  if (!parsedBody.success) {
    return jsonError("Invalid call action.", 400);
  }

  const { conversationId, callId } = parsedParams.data;
  const { action, failureReason } = parsedBody.data;
  const mayFinalizeWhileBlocked = ["decline", "cancel", "end", "fail"].includes(
    action,
  );

  const access = await getConversationMessagingAccess(conversationId, user.id);
  let participants: [string, string] | null = null;

  if (access.ok) {
    if (
      access.conversation.type !== "direct" ||
      !access.conversation.direct_participant_a ||
      !access.conversation.direct_participant_b
    ) {
      return jsonError(
        "Audio calls are available only in direct conversations.",
        400,
      );
    }

    participants = [
      access.conversation.direct_participant_a,
      access.conversation.direct_participant_b,
    ];
  } else if (access.status === 403 && mayFinalizeWhileBlocked) {
    // A block must stop new communication without trapping an existing call
    // in an active state that neither participant can terminate.
    const admin = createAdminClient();
    const { data: conversation, error: conversationError } = await admin
      .from("conversations")
      .select("id, type, direct_participant_a, direct_participant_b")
      .eq("id", conversationId)
      .maybeSingle();

    if (conversationError) {
      console.error("Failed to load call conversation:", conversationError);
      return jsonError("Unable to access this call.", 500);
    }

    if (
      !conversation ||
      conversation.type !== "direct" ||
      !conversation.direct_participant_a ||
      !conversation.direct_participant_b
    ) {
      return jsonError("Conversation not found.", 404);
    }

    const { data: membership, error: membershipError } = await admin
      .from("conversation_members")
      .select("user_id")
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id)
      .is("left_at", null)
      .maybeSingle();

    if (membershipError) {
      console.error("Failed to verify call membership:", membershipError);
      return jsonError("Unable to access this call.", 500);
    }

    if (!membership) {
      return jsonError("Conversation not found.", 404);
    }

    participants = [
      conversation.direct_participant_a,
      conversation.direct_participant_b,
    ];
  } else {
    return jsonError(access.error, access.status);
  }

  if (!participants) {
    return jsonError("Unable to verify call participants.", 500);
  }

  const admin = createAdminClient();
  const { data: initialCall, error: callError } = await admin
    .from("conversation_calls")
    .select(CALL_FIELDS)
    .eq("id", callId)
    .eq("conversation_id", conversationId)
    .maybeSingle();

  if (callError) {
    console.error("Failed to load audio call:", callError);
    return jsonError("Unable to load this call.", 500);
  }

  if (!initialCall) {
    return jsonError("Call not found.", 404);
  }

  let call = initialCall as unknown as CallRecord;
  const isParticipant = call.caller_id === user.id || call.callee_id === user.id;
  const pairMatchesConversation =
    call.caller_id !== call.callee_id &&
    participants.includes(call.caller_id) &&
    participants.includes(call.callee_id);

  if (!isParticipant || !pairMatchesConversation) {
    return jsonError("You do not have access to this call.", 403);
  }

  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();

  if (
    call.status === "ringing" &&
    nowMs - new Date(call.created_at).getTime() >= RING_TIMEOUT_MS
  ) {
    const { data: expiredCall, error: expireError } = await admin
      .from("conversation_calls")
      .update({
        status: "missed",
        ended_at: now,
        ended_by: null,
        updated_at: now,
      })
      .eq("id", call.id)
      .eq("status", "ringing")
      .select(CALL_FIELDS)
      .maybeSingle();

    if (expireError) {
      console.error("Failed to expire unanswered audio call:", expireError);
      return jsonError("Unable to update this call.", 500);
    }

    if (expiredCall) {
      return NextResponse.json(
        {
          error: "This call expired because it was not answered.",
          code: "call_missed",
          call: expiredCall as unknown as CallRecord,
        },
        { status: 410 },
      );
    }

    // If a concurrent request won the update, evaluate the current row instead.
    const { data: refreshedCall, error: refreshError } = await admin
      .from("conversation_calls")
      .select(CALL_FIELDS)
      .eq("id", call.id)
      .maybeSingle();

    if (refreshError) {
      console.error("Failed to refresh audio call:", refreshError);
      return jsonError("Unable to update this call.", 500);
    }

    if (!refreshedCall) {
      return jsonError("Call not found.", 404);
    }

    call = refreshedCall as unknown as CallRecord;
  }

  if (call.status !== "ringing" && call.status !== "accepted") {
    return NextResponse.json(
      {
        error: "This call has already ended.",
        code: "call_not_active",
        call,
      },
      { status: 409 },
    );
  }

  let nextStatus: CallStatus = call.status;
  let answeredAt = call.answered_at;
  let endedAt: string | null = null;
  let durationSeconds: number | null = null;
  let endedBy: string | null = null;
  let normalizedFailureReason: string | null = null;

  switch (action) {
    case "accept":
      if (user.id !== call.callee_id || call.status !== "ringing") {
        return jsonError(
          "Only the recipient can accept a ringing call.",
          409,
          "invalid_call_transition",
        );
      }
      nextStatus = "accepted";
      answeredAt = now;
      break;

    case "decline":
      if (user.id !== call.callee_id || call.status !== "ringing") {
        return jsonError(
          "Only the recipient can decline a ringing call.",
          409,
          "invalid_call_transition",
        );
      }
      nextStatus = "declined";
      endedAt = now;
      endedBy = user.id;
      break;

    case "cancel":
      if (user.id !== call.caller_id || call.status !== "ringing") {
        return jsonError(
          "Only the caller can cancel a ringing call.",
          409,
          "invalid_call_transition",
        );
      }
      nextStatus = "cancelled";
      endedAt = now;
      endedBy = user.id;
      break;

    case "end":
      if (call.status !== "accepted") {
        return jsonError(
          "Only a connected call can be ended.",
          409,
          "invalid_call_transition",
        );
      }
      nextStatus = "completed";
      endedAt = now;
      endedBy = user.id;
      durationSeconds = call.answered_at
        ? Math.max(
            0,
            Math.floor((nowMs - new Date(call.answered_at).getTime()) / 1000),
          )
        : 0;
      break;

    case "fail":
      nextStatus = "failed";
      endedAt = now;
      endedBy = user.id;
      durationSeconds =
        call.status === "accepted" && call.answered_at
          ? Math.max(
              0,
              Math.floor((nowMs - new Date(call.answered_at).getTime()) / 1000),
            )
          : null;
      normalizedFailureReason = failureReason
        ? failureReason.slice(0, 240)
        : "Audio call could not be completed.";
      break;
  }

  const updatePayload = {
    status: nextStatus,
    answered_at: answeredAt,
    ended_at: endedAt,
    duration_seconds: durationSeconds,
    ended_by: endedBy,
    failure_reason: normalizedFailureReason,
    updated_at: now,
  };

  const { data: updatedCall, error: updateError } = await admin
    .from("conversation_calls")
    .update(updatePayload)
    .eq("id", call.id)
    .eq("status", call.status)
    .select(CALL_FIELDS)
    .maybeSingle();

  if (updateError) {
    console.error("Failed to update audio call state:", updateError);
    return jsonError("Unable to update this call.", 500);
  }

  if (!updatedCall) {
    const { data: currentCall } = await admin
      .from("conversation_calls")
      .select(CALL_FIELDS)
      .eq("id", call.id)
      .maybeSingle();

    return NextResponse.json(
      {
        error: "This call changed before your action could be applied.",
        code: "call_state_changed",
        call: currentCall as unknown as CallRecord | null,
      },
      { status: 409 },
    );
  }

  return NextResponse.json({
    call: updatedCall as unknown as CallRecord,
  });
}
