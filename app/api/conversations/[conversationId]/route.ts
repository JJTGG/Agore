import { NextResponse } from "next/server";
import { z } from "zod";

import { getConversationMessagingAccess } from "@/lib/messaging/conversation-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const updateGroupSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(500).nullable().optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined || value.description !== undefined,
    {
      message: "At least one group field must be provided.",
    },
  );

type RouteContext = {
  params: Promise<{
    conversationId: string;
  }>;
};

type Conversation = {
  id: string;
  type: "direct" | "group";
  created_by: string;
  name: string | null;
  description: string | null;
  image_path: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
};

type ConversationDetailProfile = {
  id: string;
  display_name: string;
  username: string;
  avatar_path: string | null;
};

type ConversationDetailMedia = {
  media_type: "image" | "file" | "audio";
};

type ConversationDetailMessage = {
  id: string;
  sender_id: string | null;
  content: string | null;
  created_at: string;
  deleted_at: string | null;
  message_media: ConversationDetailMedia[] | null;
};

type ConversationDetailRow = {
  id: string;
  type: "direct" | "group";
  created_by: string;
  name: string | null;
  description: string | null;
  image_path: string | null;
  direct_participant_a: string | null;
  direct_participant_b: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
  messages: ConversationDetailMessage[] | null;
};

function getConversationPreview(
  message: ConversationDetailMessage | null,
) {
  if (!message) {
    return "No messages yet";
  }

  const content = message.content?.trim();

  if (content) {
    return content;
  }

  const media = message.message_media ?? [];

  if (media.some((item) => item.media_type === "audio")) {
    return "Voice message";
  }

  if (media.some((item) => item.media_type === "image")) {
    return "Image";
  }

  if (media.some((item) => item.media_type === "file")) {
    return "Attachment";
  }

  return "Message";
}

export async function GET(
  _request: Request,
  context: RouteContext,
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const { conversationId } = await context.params;

  if (!z.string().uuid().safeParse(conversationId).success) {
    return NextResponse.json(
      { error: "A valid conversation ID is required." },
      { status: 400 },
    );
  }

  // Verifies active membership and direct-message block restrictions.
  const access = await getConversationMessagingAccess(
    conversationId,
    user.id,
  );

  if (!access.ok) {
    return NextResponse.json(
      { error: access.error },
      { status: access.status },
    );
  }

  const admin = createAdminClient();

  const [
    { data: conversationData, error: conversationError },
    { data: membershipData, error: membershipError },
  ] = await Promise.all([
    admin
      .from("conversations")
      .select(`
        id,
        type,
        created_by,
        name,
        description,
        image_path,
        direct_participant_a,
        direct_participant_b,
        last_message_at,
        created_at,
        updated_at,
        messages (
          id,
          sender_id,
          content,
          created_at,
          deleted_at,
          message_media (
            media_type
          )
        )
      `)
      .eq("id", conversationId)
      .is("messages.deleted_at", null)
      .order("created_at", {
        ascending: false,
        referencedTable: "messages",
      })
      .limit(1, {
        referencedTable: "messages",
      })
      .maybeSingle(),

    admin
      .from("conversation_members")
      .select("role, joined_at, last_read_at, left_at")
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id)
      .is("left_at", null)
      .maybeSingle(),
  ]);

  if (conversationError || membershipError) {
    console.error(
      "Failed to load Agore conversation details:",
      conversationError ?? membershipError,
    );

    return NextResponse.json(
      { error: "Unable to load this conversation." },
      { status: 500 },
    );
  }

  if (!conversationData || !membershipData) {
    return NextResponse.json(
      { error: "Conversation not found." },
      { status: 404 },
    );
  }

  const conversation =
    conversationData as unknown as ConversationDetailRow;

  let participant: ConversationDetailProfile | null = null;

  if (conversation.type === "direct") {
    const participantA = conversation.direct_participant_a;
    const participantB = conversation.direct_participant_b;

    const otherUserId =
      participantA === user.id
        ? participantB
        : participantB === user.id
          ? participantA
          : null;

    if (!otherUserId) {
      return NextResponse.json(
        { error: "Conversation not found." },
        { status: 404 },
      );
    }

    const {
      data: participantProfile,
      error: participantError,
    } = await admin
      .from("profiles")
      .select("id, display_name, username, avatar_path")
      .eq("id", otherUserId)
      .eq("account_status", "active")
      .maybeSingle();

    if (participantError) {
      console.error(
        "Failed to load Agore conversation participant:",
        participantError,
      );

      return NextResponse.json(
        { error: "Unable to load this conversation." },
        { status: 500 },
      );
    }

    if (!participantProfile) {
      return NextResponse.json(
        { error: "Conversation not found." },
        { status: 404 },
      );
    }

    participant =
      participantProfile as ConversationDetailProfile;
  }

  const latestMessage =
    conversation.messages?.[0] ?? null;

  const hasUnreadMessages = Boolean(
    latestMessage &&
      latestMessage.sender_id !== user.id &&
      (
        membershipData.last_read_at === null ||
        new Date(latestMessage.created_at).getTime() >
          new Date(membershipData.last_read_at).getTime()
      ),
  );

  return NextResponse.json({
    conversation: {
      id: conversation.id,
      type: conversation.type,
      created_by: conversation.created_by,
      name: conversation.name,
      description: conversation.description,
      image_path: conversation.image_path,
      last_message_at: conversation.last_message_at,
      created_at: conversation.created_at,
      updated_at: conversation.updated_at,
      membership: {
        role: membershipData.role,
        joined_at: membershipData.joined_at,
        last_read_at: membershipData.last_read_at,
      },
      participant,
      latest_message: latestMessage
        ? {
            id: latestMessage.id,
            sender_id: latestMessage.sender_id,
            content: latestMessage.content,
            created_at: latestMessage.created_at,
            preview: getConversationPreview(latestMessage),
          }
        : null,
      has_unread_messages: hasUnreadMessages,
    },
  });
}

export async function PATCH(
  request: Request,
  context: RouteContext,
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const { conversationId } = await context.params;

  if (!z.string().uuid().safeParse(conversationId).success) {
    return NextResponse.json(
      { error: "A valid conversation ID is required." },
      { status: 400 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const parsedBody = updateGroupSchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json(
      {
        error:
          parsedBody.error.issues[0]?.message ??
          "Invalid group settings.",
      },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const {
    data: conversation,
    error: conversationError,
  } = await admin
    .from("conversations")
    .select(`
      id,
      type,
      created_by,
      name,
      description,
      image_path,
      last_message_at,
      created_at,
      updated_at
    `)
    .eq("id", conversationId)
    .maybeSingle();

  if (conversationError) {
    console.error(
      "Failed to load Agore conversation for update:",
      conversationError,
    );

    return NextResponse.json(
      { error: "Unable to update the group." },
      { status: 500 },
    );
  }

  if (!conversation) {
    return NextResponse.json(
      { error: "Conversation not found." },
      { status: 404 },
    );
  }

  const typedConversation = conversation as Conversation;

  if (typedConversation.type !== "group") {
    return NextResponse.json(
      { error: "Only group conversations can be updated." },
      { status: 400 },
    );
  }

  const {
    data: callerMembership,
    error: membershipError,
  } = await admin
    .from("conversation_members")
    .select("role")
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id)
    .is("left_at", null)
    .maybeSingle();

  if (membershipError) {
    console.error(
      "Failed to verify Agore group admin access:",
      membershipError,
    );

    return NextResponse.json(
      { error: "Unable to update the group." },
      { status: 500 },
    );
  }

  if (!callerMembership || callerMembership.role !== "admin") {
    return NextResponse.json(
      { error: "Only group admins can update group settings." },
      { status: 403 },
    );
  }

  const updates: {
    name?: string;
    description?: string | null;
  } = {};

  if (parsedBody.data.name !== undefined) {
    updates.name = parsedBody.data.name;
  }

  if (parsedBody.data.description !== undefined) {
    const description =
      parsedBody.data.description?.trim() ?? "";

    updates.description = description || null;
  }

  const {
    data: updatedConversation,
    error: updateError,
  } = await admin
    .from("conversations")
    .update(updates)
    .eq("id", conversationId)
    .select(`
      id,
      type,
      created_by,
      name,
      description,
      image_path,
      last_message_at,
      created_at,
      updated_at
    `)
    .single();

  if (updateError || !updatedConversation) {
    console.error(
      "Failed to update Agore group settings:",
      updateError,
    );

    return NextResponse.json(
      { error: "Unable to update the group." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    conversation: updatedConversation,
  });
}