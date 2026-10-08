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
  reply_to_message_id: string | null;
  forwarded_from_message_id: string | null;
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

type ForwardedMediaInsert = {
  message_id: string;
  media_type: SourceMedia["media_type"];
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
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

function getForwardedStoragePath(
  messageId: string,
  sourcePath: string,
) {
  const sourceSegments = sourcePath.split("/");

  if (
    sourceSegments.length !== 2 ||
    sourceSegments[0] !== messageId ||
    !sourceSegments[1]
  ) {
    return null;
  }

  const sourceFileName = sourceSegments[1];
  const lastDot = sourceFileName.lastIndexOf(".");

  let extension = "";

  if (
    lastDot > 0 &&
    lastDot < sourceFileName.length - 1
  ) {
    const candidate = sourceFileName
      .slice(lastDot + 1)
      .trim()
      .toLowerCase();

    if (/^[a-z0-9]{1,10}$/.test(candidate)) {
      extension = `.${candidate}`;
    }
  }

  return `${messageId}/${crypto.randomUUID()}${extension}`;
}

async function removeStorageObjects(
  admin: ReturnType<typeof createAdminClient>,
  storagePaths: string[],
) {
  if (storagePaths.length === 0) {
    return;
  }

  const { error } = await admin.storage
    .from("message-media")
    .remove(storagePaths);

  if (error) {
    console.error(
      "Failed to clean up Agore forwarded media objects:",
      error,
    );
  }
}

async function removeForwardedMessage(
  admin: ReturnType<typeof createAdminClient>,
  conversationId: string,
  messageId: string,
  senderId: string,
) {
  const { error } = await admin
    .from("messages")
    .delete()
    .eq("id", messageId)
    .eq("conversation_id", conversationId)
    .eq("sender_id", senderId);

  if (error) {
    console.error(
      "Failed to clean up Agore forwarded message:",
      error,
    );
  }
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

  if (
    !members ||
    members.length === 0
  ) {
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
    parsedBody.data.targetConversationId;

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

  const admin =
    createAdminClient();

  const {
    membership:
      sourceMembership,
    error:
      sourceMembershipError,
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
    membership:
      targetMembership,
    error:
      targetMembershipError,
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
    error:
      sourceMessageError,
  } = await admin
    .from("messages")
    .select(
      `
        id,
        conversation_id,
        sender_id,
        content,
        reply_to_message_id,
        forwarded_from_message_id,
        created_at,
        updated_at,
        deleted_at
      `,
    )
    .eq("id", messageId)
    .eq(
      "conversation_id",
      conversationId,
    )
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
    error:
      sourceMediaError,
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
    .eq(
      "message_id",
      messageId,
    )
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
    (sourceMedia ??
      []) as SourceMedia[];

  const hasContent =
    Boolean(
      typedSourceMessage.content?.trim(),
    );

  if (
    !hasContent &&
    media.length === 0
  ) {
    return NextResponse.json(
      {
        error:
          "This message cannot be forwarded.",
      },
      { status: 400 },
    );
  }

  const forwardedMediaPlan =
    media.map((item) => {
      const targetStoragePath =
        getForwardedStoragePath(
          messageId,
          item.storage_path,
        );

      return {
        source: item,
        targetStoragePath,
      };
    });

  const invalidForwardedMedia =
    forwardedMediaPlan.some(
      (item) =>
        !item.targetStoragePath,
    );

  if (
    invalidForwardedMedia
  ) {
    console.error(
      "Agore forwarding encountered an invalid source media path.",
      {
        messageId,
        media,
      },
    );

    return NextResponse.json(
      {
        error:
          "This message contains an invalid attachment.",
      },
      { status: 500 },
    );
  }

  const forwardedFromMessageId =
    typedSourceMessage.forwarded_from_message_id ??
    typedSourceMessage.id;

  const {
    data: forwardedMessage,
    error: insertError,
  } = await admin
    .from("messages")
    .insert({
      conversation_id:
        targetConversationId,
      sender_id: user.id,
      content:
        typedSourceMessage.content,
      reply_to_message_id:
        null,
      forwarded_from_message_id:
        forwardedFromMessageId,
    })
    .select(
      `
        id,
        conversation_id,
        sender_id,
        content,
        reply_to_message_id,
        forwarded_from_message_id,
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
    forwardedMessage as SourceMessage;

  const copiedStoragePaths: string[] =
    [];

  try {
    for (const item of forwardedMediaPlan) {
      const targetStoragePath =
        item.targetStoragePath;

      if (!targetStoragePath) {
        throw new Error(
          "Invalid target storage path.",
        );
      }

      const {
        error: copyError,
      } = await admin.storage
        .from("message-media")
        .copy(
          item.source.storage_path,
          targetStoragePath,
        );

      if (copyError) {
        throw new Error(
          "Unable to copy a forwarded media object.",
        );
      }

      copiedStoragePaths.push(
        targetStoragePath,
      );
    }

    if (
      copiedStoragePaths.length >
      0
    ) {
      const mediaRows: ForwardedMediaInsert[] =
        forwardedMediaPlan.map(
          (item) => ({
            message_id:
              typedForwardedMessage.id,
            media_type:
              item.source.media_type,
            storage_path:
              item.targetStoragePath!,
            file_name:
              item.source.file_name,
            mime_type:
              item.source.mime_type,
            size_bytes:
              item.source.size_bytes,
            width:
              item.source.width,
            height:
              item.source.height,
            duration_ms:
              item.source.duration_ms,
          }),
        );

      const {
        error:
          mediaInsertError,
      } = await admin
        .from("message_media")
        .insert(mediaRows);

      if (mediaInsertError) {
        throw new Error(
          "Unable to attach forwarded message media.",
        );
      }
    }
  } catch (error) {
    console.error(
      "Failed to copy Agore forwarded message media:",
      error,
    );

    await removeStorageObjects(
      admin,
      copiedStoragePaths,
    );

    await removeForwardedMessage(
      admin,
      targetConversationId,
      typedForwardedMessage.id,
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

  const now =
    new Date().toISOString();

  const {
    error:
      conversationUpdateError,
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

  const {
    data: forwardedMedia,
    error:
      forwardedMediaLookupError,
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
    .eq(
      "message_id",
      typedForwardedMessage.id,
    )
    .order("created_at", {
      ascending: true,
    });

  if (forwardedMediaLookupError) {
    console.error(
      "Failed to reload Agore forwarded media metadata:",
      forwardedMediaLookupError,
    );
  }

  return NextResponse.json(
    {
      conversation_id:
        targetConversationId,
      source_message_id:
        messageId,
      message: {
        ...typedForwardedMessage,
        media:
          forwardedMedia ??
          [],
        forwarded: true,
      },
    },
    { status: 201 },
  );
}