import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const MAX_GROUP_IMAGE_SIZE =
  5 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

type RouteContext = {
  params: Promise<{
    conversationId: string;
  }>;
};

function hasValidSignature(
  bytes: Uint8Array,
  contentType: string,
) {
  if (contentType === "image/jpeg") {
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  }

  if (contentType === "image/png") {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }

  if (contentType === "image/webp") {
    return (
      bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    );
  }

  return false;
}

async function getAuthenticatedUser() {
  const supabase =
    await createClient();

  const {
    data: { user },
    error,
  } =
    await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

async function getAdminGroupContext(
  conversationId: string,
  userId: string,
) {
  const admin =
    createAdminClient();

  const {
    data: conversation,
    error: conversationError,
  } = await admin
    .from("conversations")
    .select(
      `
        id,
        type,
        image_path
      `,
    )
    .eq(
      "id",
      conversationId,
    )
    .maybeSingle();

  if (conversationError) {
    console.error(
      "Failed to load Agore group for image update:",
      conversationError,
    );

    return {
      admin,
      conversation: null,
      response:
        NextResponse.json(
          {
            error:
              "Unable to access this group.",
          },
          { status: 500 },
        ),
    };
  }

  if (!conversation) {
    return {
      admin,
      conversation: null,
      response:
        NextResponse.json(
          {
            error:
              "Conversation not found.",
          },
          { status: 404 },
        ),
    };
  }

  if (
    conversation.type !==
    "group"
  ) {
    return {
      admin,
      conversation: null,
      response:
        NextResponse.json(
          {
            error:
              "Only group conversations can have a group image.",
          },
          { status: 400 },
        ),
    };
  }

  const {
    data: membership,
    error: membershipError,
  } = await admin
    .from(
      "conversation_members",
    )
    .select("role")
    .eq(
      "conversation_id",
      conversationId,
    )
    .eq(
      "user_id",
      userId,
    )
    .is("left_at", null)
    .maybeSingle();

  if (membershipError) {
    console.error(
      "Failed to verify Agore group image permissions:",
      membershipError,
    );

    return {
      admin,
      conversation: null,
      response:
        NextResponse.json(
          {
            error:
              "Unable to update the group image.",
          },
          { status: 500 },
        ),
    };
  }

  if (
    !membership ||
    membership.role !== "admin"
  ) {
    return {
      admin,
      conversation: null,
      response:
        NextResponse.json(
          {
            error:
              "Only group admins can change the group image.",
          },
          { status: 403 },
        ),
    };
  }

  return {
    admin,
    conversation,
    response: null,
  };
}

export async function POST(
  request: Request,
  context: RouteContext,
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

  const {
    conversationId,
  } =
    await context.params;

  if (
    !z.string().uuid().safeParse(
      conversationId,
    ).success
  ) {
    return NextResponse.json(
      {
        error:
          "A valid conversation ID is required.",
      },
      { status: 400 },
    );
  }

  const {
    admin,
    conversation,
    response,
  } =
    await getAdminGroupContext(
      conversationId,
      user.id,
    );

  if (!conversation) {
    return response;
  }

  let formData: FormData;

  try {
    formData =
      await request.formData();
  } catch {
    return NextResponse.json(
      {
        error:
          "Invalid image upload request.",
      },
      { status: 400 },
    );
  }

  const fileValue =
    formData.get("file");

  if (!(fileValue instanceof File)) {
    return NextResponse.json(
      {
        error:
          "A group image is required.",
      },
      { status: 400 },
    );
  }

  if (fileValue.size <= 0) {
    return NextResponse.json(
      {
        error:
          "The selected image is empty.",
      },
      { status: 400 },
    );
  }

  if (
    fileValue.size >
    MAX_GROUP_IMAGE_SIZE
  ) {
    return NextResponse.json(
      {
        error:
          "Group image must be 5 MB or smaller.",
      },
      { status: 400 },
    );
  }

  if (
    !ALLOWED_TYPES.has(
      fileValue.type,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Group image must be a JPEG, PNG, or WebP image.",
      },
      { status: 400 },
    );
  }

  const buffer =
    new Uint8Array(
      await fileValue.arrayBuffer(),
    );

  if (
    !hasValidSignature(
      buffer,
      fileValue.type,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "The selected file is not a valid image.",
      },
      { status: 400 },
    );
  }

  const imagePath =
    `${conversationId}/avatar`;

  const {
    error: uploadError,
  } = await admin.storage
    .from("group-media")
    .upload(
      imagePath,
      fileValue,
      {
        cacheControl: "3600",
        contentType:
          fileValue.type,
        upsert: true,
      },
    );

  if (uploadError) {
    console.error(
      "Failed to upload Agore group image:",
      uploadError,
    );

    return NextResponse.json(
      {
        error:
          "Unable to upload the group image.",
      },
      { status: 500 },
    );
  }

  const {
    data: updatedConversation,
    error: updateError,
  } = await admin
    .from("conversations")
    .update({
      image_path:
        imagePath,
      updated_at:
        new Date().toISOString(),
    })
    .eq(
      "id",
      conversationId,
    )
    .select(
      `
        id,
        type,
        created_by,
        name,
        description,
        image_path,
        last_message_at,
        created_at,
        updated_at
      `,
    )
    .single();

  if (
    updateError ||
    !updatedConversation
  ) {
    console.error(
      "Failed to save Agore group image path:",
      updateError,
    );

    return NextResponse.json(
      {
        error:
          "Image uploaded, but the group could not be updated.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    conversation:
      updatedConversation,
    image_path:
      imagePath,
  });
}

export async function DELETE(
  request: Request,
  context: RouteContext,
) {
  void request;

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

  const {
    conversationId,
  } =
    await context.params;

  if (
    !z.string().uuid().safeParse(
      conversationId,
    ).success
  ) {
    return NextResponse.json(
      {
        error:
          "A valid conversation ID is required.",
      },
      { status: 400 },
    );
  }

  const {
    admin,
    conversation,
    response,
  } =
    await getAdminGroupContext(
      conversationId,
      user.id,
    );

  if (!conversation) {
    return response;
  }

  const currentImagePath =
    conversation.image_path;

  if (currentImagePath) {
    const {
      error: removeError,
    } = await admin.storage
      .from("group-media")
      .remove([
        currentImagePath,
      ]);

    if (removeError) {
      console.error(
        "Failed to remove Agore group image:",
        removeError,
      );

      return NextResponse.json(
        {
          error:
            "Unable to remove the group image.",
        },
        { status: 500 },
      );
    }
  }

  const {
    data: updatedConversation,
    error: updateError,
  } = await admin
    .from("conversations")
    .update({
      image_path: null,
      updated_at:
        new Date().toISOString(),
    })
    .eq(
      "id",
      conversationId,
    )
    .select(
      `
        id,
        type,
        created_by,
        name,
        description,
        image_path,
        last_message_at,
        created_at,
        updated_at
      `,
    )
    .single();

  if (
    updateError ||
    !updatedConversation
  ) {
    console.error(
      "Failed to clear Agore group image path:",
      updateError,
    );

    return NextResponse.json(
      {
        error:
          "Group image removed, but the group could not be updated.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    conversation:
      updatedConversation,
    image_path: null,
  });
}