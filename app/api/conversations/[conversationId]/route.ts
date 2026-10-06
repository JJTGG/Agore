import { NextResponse } from "next/server";
import { z } from "zod";
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

  const { data: conversation, error: conversationError } = await admin
    .from("conversations")
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

  const { data: callerMembership, error: membershipError } = await admin
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
    const description = parsedBody.data.description?.trim() ?? "";
    updates.description = description || null;
  }

  const { data: updatedConversation, error: updateError } = await admin
    .from("conversations")
    .update(updates)
    .eq("id", conversationId)
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