import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const paramsSchema = z.object({
  conversationId: z.string().uuid(),
  messageId: z.string().uuid(),
});

const editMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Message content is required.")
    .max(
      5000,
      "Message must be 5000 characters or fewer.",
    ),
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

type MessageMediaRow = {
  id: string;
  storage_path: string;
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

async function verifyMembership(
  admin: ReturnType<typeof createAdminClient>,
  conversationId: string,
  userId: string,
) {
  const { data: membership, error } = await admin
    .from("conversation_members")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .is("left_at", null)
    .maybeSingle();

  if (error) {
    console.error(
      "Failed to verify Agore message mutation membership:",
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

async function loadMessage(
  admin: ReturnType<typeof createAdminClient>,
  conversationId: string,
  messageId: string,
) {
  const { data: message, error } = await admin
    .from("messages")
    .select(
      "id, conversation_id, sender_id, content, reply_to_message_id, created_at, updated_at, deleted_at",
    )
    .eq("id", messageId)
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error(
      "Failed to load Agore message for mutation:",
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
    message: message as MessageRow,
    error: null,
  };
}

export async function PATCH(
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

  const parsedParams = paramsSchema.safeParse(
    await params,
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
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const parsedBody =
    editMessageSchema.safeParse(body);

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

  const {
    conversationId,
    messageId,
  } = parsedParams.data;

  const admin = createAdminClient();

  const membership = await verifyMembership(
    admin,
    conversationId,
    user.id,
  );

  if (!membership.ok) {
    return NextResponse.json(
      {
        error:
          membership.error ??
          "Conversation not found.",
      },
      {
        status:
          membership.error ===
          "Conversation not found."
            ? 404
            : 500,
      },
    );
  }

  const loaded = await loadMessage(
    admin,
    conversationId,
    messageId,
  );

  if (!loaded.message) {
    return NextResponse.json(
      {
        error:
          loaded.error ??
          "Message not found.",
      },
      {
        status:
          loaded.error ===
          "Message not found."
            ? 404
            : 500,
      },
    );
  }

  if (
    loaded.message.sender_id !==
    user.id
  ) {
    return NextResponse.json(
      {
        error:
          "You can only edit your own messages.",
      },
      { status: 403 },
    );
  }

  if (
    !loaded.message.content?.trim()
  ) {
    return NextResponse.json(
      {
        error:
          "Only text messages can be edited.",
      },
      { status: 400 },
    );
  }

  const { data: message, error } =
    await admin
      .from("messages")
      .update({
        content: parsedBody.data.content,
        updated_at:
          new Date().toISOString(),
      })
      .eq("id", messageId)
      .eq("conversation_id", conversationId)
      .eq("sender_id", user.id)
      .is("deleted_at", null)
      .select(
        "id, conversation_id, sender_id, content, reply_to_message_id, created_at, updated_at, deleted_at",
      )
      .single();

  if (error) {
    console.error(
      "Failed to edit Agore message:",
      error,
    );

    return NextResponse.json(
      { error: "Unable to edit the message." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    conversation_id: conversationId,
    message,
  });
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

  const parsedParams = paramsSchema.safeParse(
    await params,
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

  const {
    conversationId,
    messageId,
  } = parsedParams.data;

  const admin = createAdminClient();

  const membership = await verifyMembership(
    admin,
    conversationId,
    user.id,
  );

  if (!membership.ok) {
    return NextResponse.json(
      {
        error:
          membership.error ??
          "Conversation not found.",
      },
      {
        status:
          membership.error ===
          "Conversation not found."
            ? 404
            : 500,
      },
    );
  }

  const loaded = await loadMessage(
    admin,
    conversationId,
    messageId,
  );

  if (!loaded.message) {
    return NextResponse.json(
      {
        error:
          loaded.error ??
          "Message not found.",
      },
      {
        status:
          loaded.error ===
          "Message not found."
            ? 404
            : 500,
      },
    );
  }

  if (
    loaded.message.sender_id !==
    user.id
  ) {
    return NextResponse.json(
      {
        error:
          "You can only delete your own messages.",
      },
      { status: 403 },
    );
  }

  const {
    data: media,
    error: mediaError,
  } = await admin
    .from("message_media")
    .select("id, storage_path")
    .eq("message_id", messageId);

  if (mediaError) {
    console.error(
      "Failed to load Agore message media for deletion:",
      mediaError,
    );

    return NextResponse.json(
      {
        error:
          "Unable to prepare the message for deletion.",
      },
      { status: 500 },
    );
  }

  const mediaRows =
    (media ?? []) as MessageMediaRow[];

  const now = new Date().toISOString();

  const {
    data: deletedMessage,
    error: deleteMessageError,
  } = await admin
    .from("messages")
    .update({
      content: null,
      updated_at: now,
      deleted_at: now,
    })
    .eq("id", messageId)
    .eq("conversation_id", conversationId)
    .eq("sender_id", user.id)
    .is("deleted_at", null)
    .select(
      "id, conversation_id, sender_id, content, reply_to_message_id, created_at, updated_at, deleted_at",
    )
    .single();

  if (deleteMessageError) {
    console.error(
      "Failed to delete Agore message:",
      deleteMessageError,
    );

    return NextResponse.json(
      { error: "Unable to delete the message." },
      { status: 500 },
    );
  }

  if (mediaRows.length > 0) {
    const storagePaths = mediaRows.map(
      (item) => item.storage_path,
    );

    const {
      error: storageError,
    } = await admin.storage
      .from("message-media")
      .remove(storagePaths);

    if (storageError) {
      console.error(
        "Failed to remove Agore message media:",
        storageError,
      );
    }

    const {
      error: mediaDeleteError,
    } = await admin
      .from("message_media")
      .delete()
      .eq("message_id", messageId);

    if (mediaDeleteError) {
      console.error(
        "Failed to delete Agore message media records:",
        mediaDeleteError,
      );
    }
  }

  return NextResponse.json({
    conversation_id: conversationId,
    message: deletedMessage,
  });
}