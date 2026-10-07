import { NextResponse } from "next/server";
import { z } from "zod";
import { createNotification } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const paramsSchema = z.object({
  conversationId: z.string().uuid(),
});

const allowedAudioMimeTypes = [
  "audio/webm",
  "audio/mp4",
  "audio/ogg",
  "audio/mpeg",
] as const;

const prepareSchema = z.object({
  action: z.literal("prepare"),
  mime_type: z.enum(allowedAudioMimeTypes),
  file_name: z
    .string()
    .trim()
    .min(1)
    .max(255),
});

const finalizeSchema = z.object({
  action: z.literal("finalize"),
  message_id: z.string().uuid(),
  storage_path: z
    .string()
    .trim()
    .min(1)
    .max(500),
  file_name: z
    .string()
    .trim()
    .min(1)
    .max(255),
  mime_type: z.enum(allowedAudioMimeTypes),
  size_bytes: z.coerce
    .number()
    .int()
    .positive()
    .max(15 * 1024 * 1024),
  duration_ms: z.coerce
    .number()
    .int()
    .min(0)
    .max(60 * 60 * 1000),
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

async function getMembership(
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
      "Failed to verify Agore voice conversation membership:",
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
  const { data: members, error } = await admin
    .from("conversation_members")
    .select("user_id")
    .eq("conversation_id", conversationId)
    .is("left_at", null)
    .neq("user_id", senderId);

  if (error) {
    console.error(
      "Failed to load Agore voice notification recipients:",
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

function getAudioExtension(mimeType: string) {
  switch (mimeType) {
    case "audio/webm":
      return "webm";
    case "audio/mp4":
      return "mp4";
    case "audio/ogg":
      return "ogg";
    case "audio/mpeg":
      return "mp3";
    default:
      return "audio";
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

  const parsedBody = requestSchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json(
      {
        error:
          parsedBody.error.issues[0]?.message ??
          "Invalid voice message request.",
      },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { membership, error: membershipError } =
    await getMembership(
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
          membershipError ===
          "Conversation not found."
            ? 404
            : 500,
      },
    );
  }

  if (parsedBody.data.action === "prepare") {
    const extension = getAudioExtension(
      parsedBody.data.mime_type,
    );

    const { data: message, error: messageError } =
      await admin
        .from("messages")
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content: null,
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
        "Failed to prepare Agore voice message:",
        messageError,
      );

      return NextResponse.json(
        { error: "Unable to prepare the voice message." },
        { status: 500 },
      );
    }

    const storagePath = `${message.id}/${crypto.randomUUID()}.${extension}`;

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
    duration_ms: durationMs,
  } = parsedBody.data;

  const expectedPrefix = `${messageId}/`;

  if (!storagePath.startsWith(expectedPrefix)) {
    return NextResponse.json(
      { error: "Invalid voice message storage path." },
      { status: 400 },
    );
  }

  const storageSegments = storagePath.split("/");

  if (
    storageSegments.length !== 2 ||
    !storageSegments[1]
  ) {
    return NextResponse.json(
      { error: "Invalid voice message storage path." },
      { status: 400 },
    );
  }

  const expectedExtension = getAudioExtension(
    mimeType,
  );

  if (
    !storageSegments[1]
      .toLowerCase()
      .endsWith(`.${expectedExtension}`)
  ) {
    return NextResponse.json(
      {
        error:
          "Voice message file type does not match its MIME type.",
      },
      { status: 400 },
    );
  }

  const { data: message, error: messageError } =
    await admin
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
      .eq("id", messageId)
      .eq("conversation_id", conversationId)
      .eq("sender_id", user.id)
      .is("deleted_at", null)
      .maybeSingle();

  if (messageError) {
    console.error(
      "Failed to load Agore prepared voice message:",
      messageError,
    );

    return NextResponse.json(
      { error: "Unable to finalize the voice message." },
      { status: 500 },
    );
  }

  if (!message) {
    return NextResponse.json(
      { error: "Voice message not found." },
      { status: 404 },
    );
  }

  const { data: existingMedia, error: existingMediaError } =
    await admin
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
      .eq("media_type", "audio")
      .maybeSingle();

  if (existingMediaError) {
    console.error(
      "Failed to check existing Agore voice attachment:",
      existingMediaError,
    );

    return NextResponse.json(
      { error: "Unable to finalize the voice message." },
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
      "Failed to verify Agore voice object:",
      storageListError,
    );

    return NextResponse.json(
      {
        error:
          "Unable to verify the uploaded voice message.",
      },
      { status: 500 },
    );
  }

  const fileNameInStorage =
    storageSegments[1];

  const storedFile = (
    storedFiles ?? []
  ).find(
    (file) =>
      file.id !== null &&
      file.name === fileNameInStorage,
  );

  if (!storedFile) {
    return NextResponse.json(
      {
        error:
          "The voice recording has not finished uploading.",
      },
      { status: 400 },
    );
  }

  const { data: media, error: mediaError } =
    await admin
      .from("message_media")
      .insert({
        message_id: messageId,
        media_type: "audio",
        storage_path: storagePath,
        file_name: fileName,
        mime_type: mimeType,
        size_bytes: sizeBytes,
        duration_ms: durationMs,
      })
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
      .single();

  if (mediaError) {
    console.error(
      "Failed to create Agore voice attachment:",
      mediaError,
    );

    return NextResponse.json(
      { error: "Unable to finalize the voice message." },
      { status: 500 },
    );
  }

  const { error: conversationUpdateError } =
    await admin
      .from("conversations")
      .update({
        last_message_at: message.created_at,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId);

  if (conversationUpdateError) {
    console.error(
      "Failed to update Agore voice conversation activity:",
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
      message,
      media,
      finalized: true,
    },
    { status: 201 },
  );
}

export async function DELETE(
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
  const messageId = url.searchParams.get("messageId");

  if (!messageId) {
    return NextResponse.json(
      { error: "Message ID is required." },
      { status: 400 },
    );
  }

  const parsedMessageId = z
    .string()
    .uuid()
    .safeParse(messageId);

  if (!parsedMessageId.success) {
    return NextResponse.json(
      { error: "Invalid message ID." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { membership, error: membershipError } =
    await getMembership(
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
          membershipError ===
          "Conversation not found."
            ? 404
            : 500,
      },
    );
  }

  const { data: message, error: messageError } =
    await admin
      .from("messages")
      .select("id, sender_id, content")
      .eq("id", parsedMessageId.data)
      .eq("conversation_id", conversationId)
      .maybeSingle();

  if (messageError) {
    console.error(
      "Failed to load Agore voice cleanup message:",
      messageError,
    );

    return NextResponse.json(
      {
        error:
          "Unable to clean up the voice message.",
      },
      { status: 500 },
    );
  }

  if (!message || message.sender_id !== user.id) {
    return NextResponse.json(
      { error: "Voice message not found." },
      { status: 404 },
    );
  }

  const { data: media, error: mediaLookupError } =
    await admin
      .from("message_media")
      .select("storage_path")
      .eq("message_id", parsedMessageId.data)
      .eq("media_type", "audio")
      .maybeSingle();

  if (mediaLookupError) {
    console.error(
      "Failed to load Agore voice cleanup media:",
      mediaLookupError,
    );
  }

  const storagePaths = new Set<string>();

  if (media?.storage_path) {
    const expectedPrefix = `${parsedMessageId.data}/`;

    if (media.storage_path.startsWith(expectedPrefix)) {
      storagePaths.add(media.storage_path);
    }
  }

  if (storagePaths.size === 0 && message.content === null) {
    const {
      data: orphanedFiles,
      error: orphanedFilesError,
    } = await admin.storage
      .from("message-media")
      .list(parsedMessageId.data, {
        limit: 20,
      });

    if (orphanedFilesError) {
      console.error(
        "Failed to list abandoned Agore voice objects:",
        orphanedFilesError,
      );
    } else {
      for (const file of orphanedFiles ?? []) {
        if (!file.name || file.id === null) {
          continue;
        }

        storagePaths.add(
          `${parsedMessageId.data}/${file.name}`,
        );
      }
    }
  }

  if (storagePaths.size > 0) {
    const { error: storageRemoveError } =
      await admin.storage
        .from("message-media")
        .remove([...storagePaths]);

    if (storageRemoveError) {
      console.error(
        "Failed to remove abandoned Agore voice objects:",
        storageRemoveError,
      );
    }
  }

  const { error: mediaDeleteError } =
    await admin
      .from("message_media")
      .delete()
      .eq("message_id", parsedMessageId.data)
      .eq("media_type", "audio");

  if (mediaDeleteError) {
    console.error(
      "Failed to remove abandoned Agore voice metadata:",
      mediaDeleteError,
    );
  }

  const { error: messageDeleteError } =
    await admin
      .from("messages")
      .update({
        deleted_at: new Date().toISOString(),
      })
      .eq("id", parsedMessageId.data)
      .eq("sender_id", user.id)
      .is("deleted_at", null);

  if (messageDeleteError) {
    console.error(
      "Failed to remove abandoned Agore voice message:",
      messageDeleteError,
    );

    return NextResponse.json(
      {
        error:
          "Unable to clean up the voice message.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    cleaned_up: true,
  });
}