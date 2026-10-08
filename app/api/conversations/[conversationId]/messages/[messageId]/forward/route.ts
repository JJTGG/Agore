import { NextResponse } from "next/server";
import { z } from "zod";
import { createNotification } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const paramsSchema = z.object({
  conversationId: z.string().uuid(),
  messageId: z.string().uuid(),
});

const bodySchema = z.object({
  targetConversationId: z.string().uuid(),
});

type SourceMessage = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  content: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type SourceMedia = {
  id: string;
  message_id: string;
  media_type: "image" | "file" | "audio";
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  created_at: string;
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
    .select(
      "conversation_id, user_id, role, joined_at, left_at",
    )
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .is("left_at", null)
    .maybeSingle();

  if (error) {
    console.error(
      "Failed to verify Agore forward conversation membership:",
      error,
    );

    return {
      membership: null,
      error:
        "Unable to access this conversation.",
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

async function notifyConversationMembers(
  admin: ReturnType<typeof createAdminClient>,
  conversationId: string,
  senderId: string,
  messageId: string,
) {
  const {
    data: members,
    error: membersError,
  } = await admin
    .from("conversation_members")
    .select("user_id")
    .eq("conversation_id", conversationId)
    .is("left_at", null)
    .neq("user_id", senderId);

  if (membersError) {
    console.error(
      "Failed to load Agore forward notification recipients:",
      membersError,
    );

    return;
  }

  if (!members || members.length === 0) {
    return;
  }

  await Promise.allSettled(
    members.map((member) =>
      createNotification({
        recipientId: member.user_id,
        actorId: senderId,
        type: "message",
        entityId: conversationId,
        data: {
          messageId,
          forwarded: true,
        },
      }),
    ),
  );
}

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      conversationId: string;
      messageId: string;
    }>;
  },
) {
  const user =
    await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json(
      {
        error:
          "Authentication required.",
      },
      { status: 401 },
    );
  }

  const parsedParams =
    paramsSchema.safeParse(
      await context.params,
    );

  if (!parsedParams.success) {
    return NextResponse.json(
      {
        error:
          "Invalid conversation or message ID.",
      },
      { status: 400 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: "Invalid JSON body.",
      },
      { status: 400 },
    );
  }

  const parsedBody =
    bodySchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json(
      {
        error:
          parsedBody.error.issues[0]
            ?.message ??
          "A target conversation is required.",
      },
      { status: 400 },
    );
  }

  const {
    conversationId,
    messageId,
  } = parsedParams.data;

  const targetConversationId =
    parsedBody.data
      .targetConversationId;

  if (
    conversationId ===
    targetConversationId
  ) {
    return NextResponse.json(
      {
        error:
          "Choose a different conversation.",
      },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const {
    membership: sourceMembership,
    error: sourceMembershipError,
  } =
    await verifyConversationMembership(
      admin,
      conversationId,
      user.id,
    );

  if (!sourceMembership) {
    return NextResponse.json(
      {
        error:
          sourceMembershipError ??
          "Source conversation not found.",
      },
      {
        status:
          sourceMembershipError ===
          "Conversation not found."
            ? 404
            : 500,
      },
    );
  }

  const {
    membership: targetMembership,
    error: targetMembershipError,
  } =
    await verifyConversationMembership(
      admin,
      targetConversationId,
      user.id,
    );

  if (!targetMembership) {
    return NextResponse.json(
      {
        error:
          targetMembershipError ??
          "Target conversation not found.",
      },
      {
        status:
          targetMembershipError ===
          "Conversation not found."
            ? 404
            : 500,
      },
    );
  }

  const {
    data: sourceMessage,
    error: sourceMessageError,
  } = await admin
    .from("messages")
    .select(
      `
        id,
        conversation_id,
        sender_id,
        content,
        created_at,
        updated_at,
        deleted_at
      `,
    )
    .eq("id", messageId)
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (sourceMessageError) {
    console.error(
      "Failed to load Agore message for forwarding:",
      sourceMessageError,
    );

    return NextResponse.json(
      {
        error:
          "Unable to load the message.",
      },
      { status: 500 },
    );
  }

  if (!sourceMessage) {
    return NextResponse.json(
      {
        error: "Message not found.",
      },
      { status: 404 },
    );
  }

  const typedSourceMessage =
    sourceMessage as SourceMessage;

  const {
    data: sourceMedia,
    error: sourceMediaError,
  } = await admin
    .from("message_media")
    .select(
      `
        id,
        message_id,
        media_type,
        storage_path,
        file_name,
        mime_type,
        size_bytes,
        width,
        height,
        duration_ms,
        created_at
      `,
    )
    .eq("message_id", messageId)
    .order("created_at", {
      ascending: true,
    });

  if (sourceMediaError) {
    console.error(
      "Failed to load Agore message media for forwarding:",
      sourceMediaError,
    );

    return NextResponse.json(
      {
        error:
          "Unable to load message attachments.",
      },
      { status: 500 },
    );
  }

  const media =
    (sourceMedia ?? []) as SourceMedia[];

  const hasContent =
    Boolean(
      typedSourceMessage.content?.trim(),
    );

  if (!hasContent && media.length === 0) {
    return NextResponse.json(
      {
        error:
          "This message cannot be forwarded.",
      },
      { status: 400 },
    );
  }

  const { data: forwardedMessage, error: insertError } =
    await admin
      .from("messages")
      .insert({
        conversation_id:
          targetConversationId,
        sender_id: user.id,
        content:
          typedSourceMessage.content,
        reply_to_message_id: null,
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

  if (insertError) {
    console.error(
      "Failed to create Agore forwarded message:",
      insertError,
    );

    return NextResponse.json(
      {
        error:
          "Unable to forward the message.",
      },
      { status: 500 },
    );
  }

  const typedForwardedMessage =
    forwardedMessage as SourceMessage & {
      reply_to_message_id: string | null;
    };

  if (media.length > 0) {
    const mediaRows =
      media.map((item) => ({
        message_id:
          typedForwardedMessage.id,
        media_type:
          item.media_type,
        storage_path:
          item.storage_path,
        file_name:
          item.file_name,
        mime_type:
          item.mime_type,
        size_bytes:
          item.size_bytes,
        width:
          item.width,
        height:
          item.height,
        duration_ms:
          item.duration_ms,
      }));

    const {
      error: mediaInsertError,
    } = await admin
      .from("message_media")
      .insert(mediaRows);

    if (mediaInsertError) {
      console.error(
        "Failed to attach Agore forwarded message media:",
        mediaInsertError,
      );

      await admin
        .from("messages")
        .delete()
        .eq(
          "id",
          typedForwardedMessage.id,
        )
        .eq(
          "conversation_id",
          targetConversationId,
        )
        .eq(
          "sender_id",
          user.id,
        );

      return NextResponse.json(
        {
          error:
            "Unable to forward the message attachments.",
        },
        { status: 500 },
      );
    }
  }

  const now =
    new Date().toISOString();

  const {
    error: conversationUpdateError,
  } = await admin
    .from("conversations")
    .update({
      last_message_at:
        typedForwardedMessage.created_at,
      updated_at: now,
    })
    .eq(
      "id",
      targetConversationId,
    );

  if (conversationUpdateError) {
    console.error(
      "Failed to update Agore target conversation activity:",
      conversationUpdateError,
    );
  }

  await notifyConversationMembers(
    admin,
    targetConversationId,
    user.id,
    typedForwardedMessage.id,
  );

  return NextResponse.json(
    {
      conversation_id:
        targetConversationId,
      source_message_id: messageId,
      message: {
        ...typedForwardedMessage,
        media,
        forwarded: true,
      },
    },
    { status: 201 },
  );
}