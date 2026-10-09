import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const groupConversationSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional().default(""),
  memberIds: z
    .array(z.string().uuid())
    .min(1, "Select at least one other member.")
    .max(49, "A group can have at most 50 members."),
});

export async function POST(request: Request) {
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

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const parsedBody = groupConversationSchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json(
      {
        error:
          parsedBody.error.issues[0]?.message ??
          "Invalid group details.",
      },
      { status: 400 },
    );
  }

  const name = parsedBody.data.name;
  const description = parsedBody.data.description.trim();

  const memberIds = [
    ...new Set(
      parsedBody.data.memberIds.filter(
        (memberId) => memberId !== user.id,
      ),
    ),
  ];

  if (memberIds.length === 0) {
    return NextResponse.json(
      { error: "Select at least one other member." },
      { status: 400 },
    );
  }

  if (memberIds.length > 49) {
    return NextResponse.json(
      { error: "A group can have at most 50 members." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data: targetProfiles, error: profilesError } = await admin
    .from("profiles")
    .select("id, display_name, username, avatar_path, account_status")
    .in("id", memberIds)
    .eq("account_status", "active");

  if (profilesError) {
    console.error(
      "Failed to validate Agore group members:",
      profilesError,
    );

    return NextResponse.json(
      { error: "Unable to create the group." },
      { status: 500 },
    );
  }

  if (!targetProfiles || targetProfiles.length !== memberIds.length) {
    return NextResponse.json(
      { error: "One or more selected users are unavailable." },
      { status: 400 },
    );
  }

  // Include the creator and every selected participant so that
  // block relationships between any two group participants
  // are checked before the group is created.
  const participantIds = [user.id, ...memberIds];

  const {
    data: blockRelationships,
    error: blockError,
  } = await admin
    .from("blocks")
    .select("blocker_id, blocked_id")
    .in("blocker_id", participantIds)
    .in("blocked_id", participantIds);

  if (blockError) {
    console.error(
      "Failed to check Agore group member block relationships:",
      blockError,
    );

    return NextResponse.json(
      { error: "Unable to create the group." },
      { status: 500 },
    );
  }

  if ((blockRelationships ?? []).length > 0) {
    return NextResponse.json(
      {
        error:
          "You cannot create a group when selected members have an active block relationship.",
      },
      { status: 403 },
    );
  }

  const {
    data: conversation,
    error: conversationError,
  } = await admin
    .from("conversations")
    .insert({
      type: "group",
      created_by: user.id,
      name,
      description: description || null,
    })
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

  if (conversationError || !conversation) {
    console.error(
      "Failed to create Agore group conversation:",
      conversationError,
    );

    return NextResponse.json(
      { error: "Unable to create the group." },
      { status: 500 },
    );
  }

  const members = [
    {
      conversation_id: conversation.id,
      user_id: user.id,
      role: "admin",
    },
    ...memberIds.map((memberId) => ({
      conversation_id: conversation.id,
      user_id: memberId,
      role: "member",
    })),
  ];

  const { error: membersError } = await admin
    .from("conversation_members")
    .insert(members);

  if (membersError) {
    console.error(
      "Failed to create Agore group members:",
      membersError,
    );

    const { error: cleanupError } = await admin
      .from("conversations")
      .delete()
      .eq("id", conversation.id);

    if (cleanupError) {
      console.error(
        "Failed to roll back incomplete Agore group creation:",
        cleanupError,
      );
    }

    return NextResponse.json(
      { error: "Unable to finish creating the group." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      conversation,
      members: [
        {
          id: user.id,
          role: "admin",
        },
        ...memberIds.map((memberId) => ({
          id: memberId,
          role: "member",
        })),
      ],
    },
    { status: 201 },
  );
}