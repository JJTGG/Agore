import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const paramsSchema = z.object({
  conversationId: z.string().uuid(),
});

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().datetime().optional(),
});

const createMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Message content is required.")
    .max(5000, "Message must be 5000 characters or fewer."),
  reply_to_message_id: z.string().uuid().nullable().optional(),
});

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  content: string | null;
  reply_to_message_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type ProfileRow = {
  id: string;
  display_name: string;
  username: string;
  avatar_path: string | null;
};

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
    .select("conversation_id, user_id, role, left_at")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .is("left_at", null)
    .maybeSingle();

  if (error) {
    console.error(
      "Failed to verify Agore conversation membership:",
      error,
    );

    return {
      membership: null,
      error: "Unable to access this conversation.",
    };
  }

  if (!membership) {
    return {
      membership: null,
      error: "Conversation not found.",
    };
  }

  return {
    membership,
    error: null,
  };
}

async function attachSenderProfiles(
  admin: ReturnType<typeof createAdminClient>,
  messages: MessageRow[],
) {
  const senderIds = [
    ...new Set(
      messages
        .map((message) => message.sender_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  if (senderIds.length === 0) {
    return messages.map((message) => ({
      ...message,
      sender: null,
    }));
  }

  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id, display_name, username, avatar_path")
    .in("id", senderIds)
    .eq("account_status", "active");

  if (error) {
    console.error(
      "Failed to load Agore message sender profiles:",
      error,
    );

    throw new Error("Unable to load message profiles.");
  }

  const profileMap = new Map(
    ((profiles ?? []) as ProfileRow[]).map((profile) => [
      profile.id,
      profile,
    ]),
  );

  return messages.map((message) => ({
    ...message,
    sender: message.sender_id
      ? profileMap.get(message.sender_id) ?? null
      : null,
  }));
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
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
      { error: "Invalid conversation ID." },
      { status: 400 },
    );
  }

  const conversationId = parsedParams.data.conversationId;
  const url = new URL(request.url);

  const parsedQuery = querySchema.safeParse({
    limit: url.searchParams.get("limit") ?? undefined,
    before: url.searchParams.get("before") ?? undefined,
  });

  if (!parsedQuery.success) {
    return NextResponse.json(
      { error: "Invalid message parameters." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { membership, error: membershipError } =
    await verifyConversationMembership(
      admin,
      conversationId,
      user.id,
    );

  if (!membership) {
    return NextResponse.json(
      { error: membershipError ?? "Conversation not found." },
      { status: membershipError === "Conversation not found." ? 404 : 500 },
    );
  }

  let query = admin
    .from("messages")
    .select(
      `
        id,
        conversation_id,
        sender_id,
        content,
        reply_to_message_id,
        created_at,
        updated_at,
        deleted_at
      `,
    )
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(parsedQuery.data.limit);

  if (parsedQuery.data.before) {
    query = query.lt("created_at", parsedQuery.data.before);
  }

  const { data: messages, error: messagesError } = await query;

  if (messagesError) {
    console.error(
      "Failed to load Agore conversation messages:",
      messagesError,
    );

    return NextResponse.json(
      { error: "Unable to load messages." },
      { status: 500 },
    );
  }

  const orderedMessages = ((messages ?? []) as MessageRow[]).reverse();

  try {
    const messagesWithProfiles = await attachSenderProfiles(
      admin,
      orderedMessages,
    );

    return NextResponse.json({
      conversation_id: conversationId,
      messages: messagesWithProfiles,
      has_more: orderedMessages.length === parsedQuery.data.limit,
    });
  } catch (error) {
    console.error("Failed to build Agore message response:", error);

    return NextResponse.json(
      { error: "Unable to load messages." },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
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
      { error: "Invalid conversation ID." },
      { status: 400 },
    );
  }

  const conversationId = parsedParams.data.conversationId;

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const parsedBody = createMessageSchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json(
      {
        error:
          parsedBody.error.issues[0]?.message ??
          "Invalid message.",
      },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { membership, error: membershipError } =
    await verifyConversationMembership(
      admin,
      conversationId,
      user.id,
    );

  if (!membership) {
    return NextResponse.json(
      { error: membershipError ?? "Conversation not found." },
      { status: membershipError === "Conversation not found." ? 404 : 500 },
    );
  }

  const replyToMessageId =
    parsedBody.data.reply_to_message_id ?? null;

  if (replyToMessageId) {
    const { data: replyMessage, error: replyError } = await admin
      .from("messages")
      .select("id")
      .eq("id", replyToMessageId)
      .eq("conversation_id", conversationId)
      .is("deleted_at", null)
      .maybeSingle();

    if (replyError) {
      console.error(
        "Failed to verify Agore reply target:",
        replyError,
      );

      return NextResponse.json(
        { error: "Unable to validate the reply." },
        { status: 500 },
      );
    }

    if (!replyMessage) {
      return NextResponse.json(
        { error: "Reply target not found." },
        { status: 400 },
      );
    }
  }

  const { data: message, error: messageError } = await admin
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content: parsedBody.data.content,
      reply_to_message_id: replyToMessageId,
    })
    .select(
      `
        id,
        conversation_id,
        sender_id,
        content,
        reply_to_message_id,
        created_at,
        updated_at,
        deleted_at
      `,
    )
    .single();

  if (messageError) {
    console.error(
      "Failed to create Agore message:",
      messageError,
    );

    return NextResponse.json(
      { error: "Unable to send the message." },
      { status: 500 },
    );
  }

  const { error: conversationUpdateError } = await admin
    .from("conversations")
    .update({
      last_message_at: message.created_at,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId);

  if (conversationUpdateError) {
    console.error(
      "Failed to update Agore conversation activity:",
      conversationUpdateError,
    );
  }

  try {
    const [messageWithProfile] = await attachSenderProfiles(
      admin,
      [message as MessageRow],
    );

    return NextResponse.json(
      {
        conversation_id: conversationId,
        message: messageWithProfile,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error(
      "Failed to build Agore sent message response:",
      error,
    );

    return NextResponse.json(
      { error: "Message sent, but the response could not be completed." },
      { status: 201 },
    );
  }
}