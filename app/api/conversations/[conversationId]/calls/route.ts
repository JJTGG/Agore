import { NextResponse } from "next/server";
import { z } from "zod";

import { getConversationMessagingAccess } from "@/lib/messaging/conversation-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const paramsSchema = z.object({
  conversationId: z.string().uuid(),
});

const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

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
  "updated_at",
].join(", ");

const RING_TIMEOUT_MS = 60_000;

type RouteContext = {
  params: Promise<{
    conversationId: string;
  }>;
};

type CallRecord = {
  id: string;
  conversation_id: string;
  caller_id: string;
  callee_id: string;
  status: "ringing" | "accepted" | "completed" | "declined" | "missed" | "cancelled" | "failed";
  created_at: string;
  answered_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  ended_by: string | null;
  updated_at: string;
};

async function getAuthenticatedUser() {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      user: null,
      response: NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      ),
    };
  }

  return {
    user,
    response: null,
  };
}

async function getDirectConversationContext(
  conversationId: string,
  userId: string,
) {
  const access = await getConversationMessagingAccess(
    conversationId,
    userId,
  );

  if (!access.ok) {
    return {
      otherParticipantId: null,
      response: NextResponse.json(
        { error: access.error },
        { status: access.status },
      ),
    };
  }

  if (access.conversation.type !== "direct") {
    return {
      otherParticipantId: null,
      response: NextResponse.json(
        { error: "Audio calls are only available in direct conversations." },
        { status: 400 },
      ),
    };
  }

  const { direct_participant_a: participantA, direct_participant_b: participantB } =
    access.conversation;

  const otherParticipantId =
    participantA === userId
      ? participantB
      : participantB === userId
        ? participantA
        : null;

  if (!otherParticipantId || otherParticipantId === userId) {
    return {
      otherParticipantId: null,
      response: NextResponse.json(
        { error: "This direct conversation has no valid call recipient." },
        { status: 404 },
      ),
    };
  }

  return {
    otherParticipantId,
    response: null,
  };
}

async function expireStaleRingingCall(
  admin: ReturnType<typeof createAdminClient>,
  conversationId: string,
) {
  const cutoff = new Date(Date.now() - RING_TIMEOUT_MS).toISOString();
  const now = new Date().toISOString();

  const { error } = await admin
    .from("conversation_calls")
    .update({
      status: "missed",
      ended_at: now,
      ended_by: null,
      updated_at: now,
    })
    .eq("conversation_id", conversationId)
    .eq("status", "ringing")
    .lt("created_at", cutoff);

  if (error) {
    console.error("Failed to expire stale Agoré ringing call:", error);
    return false;
  }

  return true;
}

function invalidConversationId() {
  return NextResponse.json(
    { error: "A valid conversation ID is required." },
    { status: 400 },
  );
}

export async function GET(
  request: Request,
  context: RouteContext,
) {
  const { user, response: authResponse } = await getAuthenticatedUser();

  if (!user) {
    return authResponse;
  }

  const { conversationId } = await context.params;
  const parsedParams = paramsSchema.safeParse({ conversationId });

  if (!parsedParams.success) {
    return invalidConversationId();
  }

  const {
    otherParticipantId,
    response: accessResponse,
  } = await getDirectConversationContext(conversationId, user.id);

  if (accessResponse) {
    return accessResponse;
  }

  const url = new URL(request.url);
  const parsedQuery = historyQuerySchema.safeParse({
    limit: url.searchParams.get("limit") ?? undefined,
  });

  if (!parsedQuery.success) {
    return NextResponse.json(
      { error: "The call history limit must be between 1 and 100." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const expired = await expireStaleRingingCall(admin, conversationId);

  if (!expired) {
    return NextResponse.json(
      { error: "Unable to reconcile call history. Please retry." },
      { status: 500 },
    );
  }

  const participantFilter =
    "and(caller_id.eq." + user.id + ",callee_id.eq." + otherParticipantId +
    "),and(caller_id.eq." + otherParticipantId + ",callee_id.eq." + user.id + ")";

  const { data: calls, error } = await admin
    .from("conversation_calls")
    .select(CALL_FIELDS)
    .eq("conversation_id", conversationId)
    .or(participantFilter)
    .order("created_at", { ascending: false })
    .limit(parsedQuery.data.limit);

  if (error) {
    console.error("Failed to load Agoré call history:", error);

    return NextResponse.json(
      { error: "Unable to load call history." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    calls: (calls ?? []) as unknown as CallRecord[],
  });
}

export async function POST(
  _request: Request,
  context: RouteContext,
) {
  const { user, response: authResponse } = await getAuthenticatedUser();

  if (!user) {
    return authResponse;
  }

  const { conversationId } = await context.params;
  const parsedParams = paramsSchema.safeParse({ conversationId });

  if (!parsedParams.success) {
    return invalidConversationId();
  }

  const {
    otherParticipantId,
    response: accessResponse,
  } = await getDirectConversationContext(conversationId, user.id);

  if (accessResponse) {
    return accessResponse;
  }

  const admin = createAdminClient();

  const { data: recipient, error: recipientError } = await admin
    .from("profiles")
    .select("id")
    .eq("id", otherParticipantId)
    .eq("account_status", "active")
    .maybeSingle();

  if (recipientError) {
    console.error("Failed to verify Agoré audio call recipient:", recipientError);

    return NextResponse.json(
      { error: "Unable to start this call." },
      { status: 500 },
    );
  }

  if (!recipient) {
    return NextResponse.json(
      { error: "This person is unavailable for calls." },
      { status: 404 },
    );
  }

  const expired = await expireStaleRingingCall(admin, conversationId);

  if (!expired) {
    return NextResponse.json(
      { error: "Unable to check for an existing call. Please retry." },
      { status: 500 },
    );
  }

  const { data: activeCall, error: activeCallError } = await admin
    .from("conversation_calls")
    .select(CALL_FIELDS)
    .eq("conversation_id", conversationId)
    .in("status", ["ringing", "accepted"])
    .maybeSingle();

  if (activeCallError) {
    console.error("Failed to check active Agoré call:", activeCallError);

    return NextResponse.json(
      { error: "Unable to check for an existing call." },
      { status: 500 },
    );
  }

  if (activeCall) {
    return NextResponse.json(
      {
        error: "A call is already active in this conversation.",
        code: "call_already_active",
        call: activeCall as unknown as CallRecord,
      },
      { status: 409 },
    );
  }

  const { data: call, error: createError } = await admin
    .from("conversation_calls")
    .insert({
      conversation_id: conversationId,
      caller_id: user.id,
      callee_id: otherParticipantId,
      status: "ringing",
    })
    .select(CALL_FIELDS)
    .single();

  if (createError || !call) {
    // The partial unique index is the final guard against concurrent requests.
    if (createError?.code === "23505") {
      const { data: concurrentCall } = await admin
        .from("conversation_calls")
        .select(CALL_FIELDS)
        .eq("conversation_id", conversationId)
        .in("status", ["ringing", "accepted"])
        .maybeSingle();

      if (concurrentCall) {
        return NextResponse.json(
          {
            error: "A call is already active in this conversation.",
            code: "call_already_active",
            call: concurrentCall as unknown as CallRecord,
          },
          { status: 409 },
        );
      }
    }

    console.error("Failed to create Agoré audio call:", createError);

    return NextResponse.json(
      { error: "Unable to start this call." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { call: call as unknown as CallRecord },
    { status: 201 },
  );
}
