import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const paramsSchema = z.object({
  conversationId: z.string().uuid(),
  messageId: z.string().uuid(),
});

const reactionSchema = z.object({
  reactionType: z.enum([
    "like",
    "love",
    "laugh",
    "care",
    "wow",
    "sad",
    "angry",
  ]),
});

const reactionTypes = [
  "like",
  "love",
  "laugh",
  "care",
  "wow",
  "sad",
  "angry",
] as const;

type ReactionType = (typeof reactionTypes)[number];

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

async function verifyConversationMembership(
  admin: ReturnType<typeof createAdminClient>,
  conversationId: string,
  userId: string,
) {
  const { data: membership, error } = await admin
    .from("conversation_members")
    .select("conversation_id, user_id, left_at")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .is("left_at", null)
    .maybeSingle();

  if (error) {
    console.error(
      "Failed to verify Agore reaction conversation membership:",
      error,
    );

    return {
      ok: false,
      error: "Unable to access this conversation.",
    };
  }

  if (!membership) {
    return {
      ok: false,
      error: "Conversation not found.",
    };
  }

  return {
    ok: true,
    error: null,
  };
}

async function verifyMessage(
  admin: ReturnType<typeof createAdminClient>,
  conversationId: string,
  messageId: string,
) {
  const { data: message, error } = await admin
    .from("messages")
    .select("id, conversation_id, sender_id")
    .eq("id", messageId)
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error(
      "Failed to verify Agore reaction message:",
      error,
    );

    return {
      message: null,
      error: "Unable to load this message.",
    };
  }

  if (!message) {
    return {
      message: null,
      error: "Message not found.",
    };
  }

  return {
    message,
    error: null,
  };
}

async function loadReactionState(
  admin: ReturnType<typeof createAdminClient>,
  messageId: string,
  userId: string,
) {
  const { data: reactions, error: reactionsError } = await admin
    .from("message_reactions")
    .select("user_id, reaction_type")
    .eq("message_id", messageId);

  if (reactionsError) {
    console.error(
      "Failed to load Agore message reactions:",
      reactionsError,
    );

    throw new Error("Unable to load message reactions.");
  }

  const counts: Record<ReactionType, number> = {
    like: 0,
    love: 0,
    laugh: 0,
    care: 0,
    wow: 0,
    sad: 0,
    angry: 0,
  };

  let myReaction: ReactionType | null = null;

  for (const reaction of reactions ?? []) {
    const reactionType = reaction.reaction_type as ReactionType;

    if (!(reactionType in counts)) {
      continue;
    }

    counts[reactionType] += 1;

    if (reaction.user_id === userId) {
      myReaction = reactionType;
    }
  }

  return {
    myReaction,
    reactions: counts,
  };
}

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{
      conversationId: string;
      messageId: string;
    }>;
  },
) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const parsedParams = paramsSchema.safeParse(await params);

  if (!parsedParams.success) {
    return NextResponse.json(
      { error: "Invalid conversation or message ID." },
      { status: 400 },
    );
  }

  const { conversationId, messageId } = parsedParams.data;
  const admin = createAdminClient();

  const membership = await verifyConversationMembership(
    admin,
    conversationId,
    user.id,
  );

  if (!membership.ok) {
    return NextResponse.json(
      { error: membership.error },
      {
        status:
          membership.error === "Conversation not found."
            ? 404
            : 500,
      },
    );
  }

  const message = await verifyMessage(
    admin,
    conversationId,
    messageId,
  );

  if (!message.message) {
    return NextResponse.json(
      { error: message.error ?? "Message not found." },
      {
        status:
          message.error === "Message not found."
            ? 404
            : 500,
      },
    );
  }

  try {
    const state = await loadReactionState(
      admin,
      messageId,
      user.id,
    );

    return NextResponse.json({
      message_id: messageId,
      ...state,
    });
  } catch (error) {
    console.error(
      "Failed to build Agore message reaction response:",
      error,
    );

    return NextResponse.json(
      { error: "Unable to load message reactions." },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      conversationId: string;
      messageId: string;
    }>;
  },
) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const parsedParams = paramsSchema.safeParse(await params);

  if (!parsedParams.success) {
    return NextResponse.json(
      { error: "Invalid conversation or message ID." },
      { status: 400 },
    );
  }

  const { conversationId, messageId } = parsedParams.data;

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const parsedBody = reactionSchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json(
      {
        error:
          parsedBody.error.issues[0]?.message ??
          "Invalid reaction.",
      },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const membership = await verifyConversationMembership(
    admin,
    conversationId,
    user.id,
  );

  if (!membership.ok) {
    return NextResponse.json(
      { error: membership.error },
      {
        status:
          membership.error === "Conversation not found."
            ? 404
            : 500,
      },
    );
  }

  const message = await verifyMessage(
    admin,
    conversationId,
    messageId,
  );

  if (!message.message) {
    return NextResponse.json(
      { error: message.error ?? "Message not found." },
      {
        status:
          message.error === "Message not found."
            ? 404
            : 500,
      },
    );
  }

  const reactionType = parsedBody.data.reactionType;

  const { error: upsertError } = await admin
    .from("message_reactions")
    .upsert(
      {
        message_id: messageId,
        user_id: user.id,
        reaction_type: reactionType,
      },
      {
        onConflict: "message_id,user_id",
      },
    );

  if (upsertError) {
    console.error(
      "Failed to save Agore message reaction:",
      upsertError,
    );

    return NextResponse.json(
      { error: "Unable to save the reaction." },
      { status: 500 },
    );
  }

  try {
    const state = await loadReactionState(
      admin,
      messageId,
      user.id,
    );

    return NextResponse.json({
      message_id: messageId,
      ...state,
    });
  } catch (error) {
    console.error(
      "Failed to build Agore saved reaction response:",
      error,
    );

    return NextResponse.json(
      { error: "Reaction saved, but the updated state could not be loaded." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{
      conversationId: string;
      messageId: string;
    }>;
  },
) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const parsedParams = paramsSchema.safeParse(await params);

  if (!parsedParams.success) {
    return NextResponse.json(
      { error: "Invalid conversation or message ID." },
      { status: 400 },
    );
  }

  const { conversationId, messageId } = parsedParams.data;
  const admin = createAdminClient();

  const membership = await verifyConversationMembership(
    admin,
    conversationId,
    user.id,
  );

  if (!membership.ok) {
    return NextResponse.json(
      { error: membership.error },
      {
        status:
          membership.error === "Conversation not found."
            ? 404
            : 500,
      },
    );
  }

  const message = await verifyMessage(
    admin,
    conversationId,
    messageId,
  );

  if (!message.message) {
    return NextResponse.json(
      { error: message.error ?? "Message not found." },
      {
        status:
          message.error === "Message not found."
            ? 404
            : 500,
      },
    );
  }

  const { error: deleteError } = await admin
    .from("message_reactions")
    .delete()
    .eq("message_id", messageId)
    .eq("user_id", user.id);

  if (deleteError) {
    console.error(
      "Failed to remove Agore message reaction:",
      deleteError,
    );

    return NextResponse.json(
      { error: "Unable to remove the reaction." },
      { status: 500 },
    );
  }

  try {
    const state = await loadReactionState(
      admin,
      messageId,
      user.id,
    );

    return NextResponse.json({
      message_id: messageId,
      ...state,
    });
  } catch (error) {
    console.error(
      "Failed to build Agore removed reaction response:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Reaction removed, but the updated state could not be loaded.",
      },
      { status: 200 },
    );
  }
}