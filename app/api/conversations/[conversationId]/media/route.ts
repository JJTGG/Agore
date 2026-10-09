import { NextResponse } from "next/server";
import { z } from "zod";

import { getConversationMessagingAccess } from "@/lib/messaging/conversation-access";
import { createNotification } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const paramsSchema = z.object({
  conversationId: z.string().uuid(),
});

const allowedMediaMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
] as const;

const prepareSchema = z.object({
  action: z.literal("prepare"),
  mime_type: z.enum(allowedMediaMimeTypes),
  file_name: z.string().trim().min(1).max(255),
});

const finalizeSchema = z.object({
  action: z.literal("finalize"),
  message_id: z.string().uuid(),
  storage_path: z.string().trim().min(1).max(500),
  file_name: z.string().trim().min(1).max(255),
  mime_type: z.enum(allowedMediaMimeTypes),
  size_bytes: z.coerce
    .number()
    .int()
    .positive()
    .max(15 * 1024 * 1024),
  width: z.coerce
    .number()
    .int()
    .positive()
    .nullable()
    .optional(),
  height: z.coerce
    .number()
    .int()
    .positive()
    .nullable()
    .optional(),
});

const requestSchema = z.discriminatedUnion("action", [
  prepareSchema,
  finalizeSchema,
]);

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

function getExtension(fileName: string, mimeType: string) {
  const providedExtension = fileName
    .split(".")
    .pop()
    ?.trim()
    .toLowerCase();

  if (
    providedExtension &&
    /^[a-z0-9]{1,10}$/.test(providedExtension)
  ) {
    return providedExtension;
  }

  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "application/pdf":
      return "pdf";
    default:
      return "bin";
  }
}

function getMediaType(mimeType: string) {
  return mimeType.startsWith("image/")
    ? "image"
    : "file";
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

// This membership-only check is intentionally retained for DELETE.
// Cleanup must remain available when a block relationship changes
// while an upload is in progress.
async function getMembership(
  admin: ReturnType<typeof createAdminClient>,
  conversationId: string,
  userId: string,
) {
  const {
    data: membership,
    error,
  } = await admin
    .from("conversation_members")
    .select("conversation_id, user_id, role, left_at")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .is("left_at", null)
    .maybeSingle();

  if (error) {
    console.error(
      "Failed to verify Agore media conversation membership:",
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

async function notifyConversationMembers(
  admin: ReturnType<typeof createAdminClient>,
  conversationId: string,
  senderId: string,
  messageId: string,
) {
  const {
    data: members,
    error,
  } = await admin
    .from("conversation_members")
    .select("user_id")
    .eq("conversation_id", conversationId)
    .is("left_at", null)
    .neq("user_id", senderId);

  if (error) {
    console.error(
      "Failed to load Agore media notification recipients:",
      error,
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
        },
      }),
    ),
  );
}

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      conversationId: string;
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

  const parsedBody = requestSchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json(
      {
        error:
          parsedBody.error.issues[0]?.message ??
          "Invalid media request.",
      },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Both prepare and finalize enforce the centralized messaging policy.
  // A block or inactive membership prevents further media posting.
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

  if (parsedBody.data.action === "prepare") {
    const extension = getExtension(
      parsedBody.data.file_name,
      parsedBody.data.mime_type,
    );

    const {
      data: message,
      error: messageError,
    } = await admin
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: null,
      })
      .select(`
        id,
        conversation_id,
        sender_id,
        content,
        reply_to_message_id,
        created_at,
        updated_at,
        deleted_at
      `)
      .single();

    if (messageError) {
      console.error(
        "Failed to prepare Agore media message:",
        messageError,
      );

      return NextResponse.json(
        { error: "Unable to prepare the media message." },
        { status: 500 },
      );
    }

    const storagePath =
      `${message.id}/${crypto.randomUUID()}.${extension}`;

    return NextResponse.json(
      {
        message: message as MessageRow,
        storage_path: storagePath,
        mime_type: parsedBody.data.mime_type,
        file_name: parsedBody.data.file_name,
      },
      { status: 201 },
    );
  }

  const {
    message_id: messageId,
    storage_path: storagePath,
    file_name: fileName,
    mime_type: mimeType,
    size_bytes: sizeBytes,
    width,
    height,
  } = parsedBody.data;

  const expectedPrefix = `${messageId}/`;

  if (!storagePath.startsWith(expectedPrefix)) {
    return NextResponse.json(
      { error: "Invalid media storage path." },
      { status: 400 },
    );
  }

  const storageSegments = storagePath.split("/");

  if (
    storageSegments.length !== 2 ||
    !storageSegments[1]
  ) {
    return NextResponse.json(
      { error: "Invalid media storage path." },
      { status: 400 },
    );
  }

  const extension = getExtension(fileName, mimeType);

  if (
    !storageSegments[1]
      .toLowerCase()
      .endsWith(`.${extension}`)
  ) {
    return NextResponse.json(
      {
        error:
          "Media file type does not match its filename.",
      },
      { status: 400 },
    );
  }

  const {
    data: message,
    error: messageError,
  } = await admin
    .from("messages")
    .select(`
      id,
      conversation_id,
      sender_id,
      content,
      reply_to_message_id,
      created_at,
      updated_at,
      deleted_at
    `)
    .eq("id", messageId)
    .eq("conversation_id", conversationId)
    .eq("sender_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (messageError) {
    console.error(
      "Failed to load Agore prepared media message:",
      messageError,
    );

    return NextResponse.json(
      { error: "Unable to finalize the media message." },
      { status: 500 },
    );
  }

  if (!message) {
    return NextResponse.json(
      { error: "Media message not found." },
      { status: 404 },
    );
  }

  const {
    data: existingMedia,
    error: existingMediaError,
  } = await admin
    .from("message_media")
    .select(`
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
    `)
    .eq("message_id", messageId)
    .maybeSingle();

  if (existingMediaError) {
    console.error(
      "Failed to check existing Agore media attachment:",
      existingMediaError,
    );

    return NextResponse.json(
      { error: "Unable to finalize the media message." },
      { status: 500 },
    );
  }

  if (existingMedia) {
    return NextResponse.json({
      message,
      media: existingMedia,
      finalized: true,
    });
  }

  const {
    data: storedFiles,
    error: storageListError,
  } = await admin.storage
    .from("message-media")
    .list(messageId, {
      limit: 20,
    });

  if (storageListError) {
    console.error(
      "Failed to verify Agore media object:",
      storageListError,
    );

    return NextResponse.json(
      { error: "Unable to verify the uploaded media." },
      { status: 500 },
    );
  }

  const fileNameInStorage = storageSegments[1];

  const storedFile = (storedFiles ?? []).find(
    (file) =>
      file.id !== null &&
      file.name === fileNameInStorage,
  );

  if (!storedFile) {
    return NextResponse.json(
      { error: "The media file has not finished uploading." },
      { status: 400 },
    );
  }

  const {
    data: media,
    error: mediaError,
  } = await admin
    .from("message_media")
    .insert({
      message_id: messageId,
      media_type: getMediaType(mimeType),
      storage_path: storagePath,
      file_name: fileName,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      width: width ?? null,
      height: height ?? null,
    })
    .select(`
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
    `)
    .single();

  if (mediaError) {
    console.error(
      "Failed to create Agore media attachment:",
      mediaError,
    );

    return NextResponse.json(
      { error: "Unable to finalize the media message." },
      { status: 500 },
    );
  }

  const finalizedAt = new Date().toISOString();

  const {
    error: messageUpdateError,
  } = await admin
    .from("messages")
    .update({
      updated_at: finalizedAt,
    })
    .eq("id", messageId)
    .eq("conversation_id", conversationId)
    .eq("sender_id", user.id)
    .is("deleted_at", null);

  if (messageUpdateError) {
    console.error(
      "Failed to publish Agore media finalization update:",
      messageUpdateError,
    );
  }

  const {
    error: conversationUpdateError,
  } = await admin
    .from("conversations")
    .update({
      last_message_at: message.created_at,
      updated_at: finalizedAt,
    })
    .eq("id", conversationId);

  if (conversationUpdateError) {
    console.error(
      "Failed to update Agore media conversation activity:",
      conversationUpdateError,
    );
  }

  await notifyConversationMembers(
    admin,
    conversationId,
    user.id,
    messageId,
  );

  return NextResponse.json(
    {
      message: {
        ...message,
        updated_at: finalizedAt,
      },
      media,
      finalized: true,
    },
    { status: 201 },
  );
}

export async function DELETE(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      conversationId: string;
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
      { error: "Invalid conversation ID." },
      { status: 400 },
    );
  }

  const conversationId = parsedParams.data.conversationId;
  const url = new URL(request.url);
  const messageId = url.searchParams.get("messageId");

  if (!messageId) {
    return NextResponse.json(
      { error: "Message ID is required." },
      { status: 400 },
    );
  }

  const parsedMessageId = z.string().uuid().safeParse(messageId);

  if (!parsedMessageId.success) {
    return NextResponse.json(
      { error: "Invalid message ID." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Cleanup is intentionally membership-based rather than subject to
  // direct-message block restrictions, so an interrupted upload can
  // still be cleaned up after a block relationship changes.
  const {
    membership,
    error: membershipError,
  } = await getMembership(
    admin,
    conversationId,
    user.id,
  );

  if (!membership) {
    return NextResponse.json(
      {
        error:
          membershipError ??
          "Conversation not found.",
      },
      {
        status:
          membershipError === "Conversation not found."
            ? 404
            : 500,
      },
    );
  }

  const {
    data: message,
    error: messageError,
  } = await admin
    .from("messages")
    .select("id, sender_id, content, deleted_at")
    .eq("id", parsedMessageId.data)
    .eq("conversation_id", conversationId)
    .maybeSingle();

  if (messageError) {
    console.error(
      "Failed to load Agore media cleanup message:",
      messageError,
    );

    return NextResponse.json(
      { error: "Unable to clean up the media message." },
      { status: 500 },
    );
  }

  if (!message || message.sender_id !== user.id) {
    return NextResponse.json(
      { error: "Media message not found." },
      { status: 404 },
    );
  }

  const {
    data: media,
    error: mediaLookupError,
  } = await admin
    .from("message_media")
    .select("storage_path")
    .eq("message_id", parsedMessageId.data);

  if (mediaLookupError) {
    console.error(
      "Failed to load Agore media cleanup attachments:",
      mediaLookupError,
    );

    return NextResponse.json(
      { error: "Unable to prepare the media cleanup." },
      { status: 500 },
    );
  }

  const messageFolder = parsedMessageId.data;
  const expectedPrefix = `${messageFolder}/`;
  const storagePaths = new Set<string>();

  for (const item of media ?? []) {
    const path =
      typeof item.storage_path === "string"
        ? item.storage_path
        : "";

    if (!path.startsWith(expectedPrefix)) {
      continue;
    }

    const relativePath = path.slice(expectedPrefix.length);

    if (relativePath && !relativePath.includes("/")) {
      storagePaths.add(path);
    }
  }

  // Discover files that reached Storage but never received metadata.
  const {
    data: storedObjects,
    error: storageListError,
  } = await admin.storage
    .from("message-media")
    .list(messageFolder, {
      limit: 100,
    });

  if (storageListError) {
    console.error(
      "Failed to list abandoned Agore media objects:",
      storageListError,
    );

    return NextResponse.json(
      { error: "Unable to inspect uploaded media for cleanup." },
      { status: 500 },
    );
  }

  for (const file of storedObjects ?? []) {
    if (
      !file.name ||
      file.id === null ||
      file.id === undefined ||
      file.name.includes("/")
    ) {
      continue;
    }

    storagePaths.add(`${expectedPrefix}${file.name}`);
  }

  if (storagePaths.size > 0) {
    const { error: storageError } = await admin.storage
      .from("message-media")
      .remove([...storagePaths]);

    if (storageError) {
      console.error(
        "Failed to remove Agore media objects during cleanup:",
        storageError,
      );

      return NextResponse.json(
        {
          error:
            "Unable to remove uploaded media. Please retry cleanup.",
        },
        { status: 500 },
      );
    }
  }

  const { error: mediaDeleteError } = await admin
    .from("message_media")
    .delete()
    .eq("message_id", parsedMessageId.data);

  if (mediaDeleteError) {
    console.error(
      "Failed to remove Agore media metadata:",
      mediaDeleteError,
    );

    return NextResponse.json(
      {
        error:
          "Unable to remove media metadata. Please retry cleanup.",
      },
      { status: 500 },
    );
  }

  const { error: messageDeleteError } = await admin
    .from("messages")
    .update({
      content: null,
      deleted_at: new Date().toISOString(),
    })
    .eq("id", parsedMessageId.data)
    .eq("conversation_id", conversationId)
    .eq("sender_id", user.id)
    .is("deleted_at", null);

  if (messageDeleteError) {
    console.error(
      "Failed to remove Agore media message:",
      messageDeleteError,
    );

    return NextResponse.json(
      { error: "Unable to clean up the media message." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    cleaned_up: true,
  });
}