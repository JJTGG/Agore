import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const directConversationSchema = z.object({
  userId: z.string().uuid(),
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

  const parsedBody = directConversationSchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "A valid user ID is required." },
      { status: 400 },
    );
  }

  const targetUserId = parsedBody.data.userId;

  if (targetUserId === user.id) {
    return NextResponse.json(
      { error: "You cannot start a conversation with yourself." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data: targetProfile, error: targetProfileError } = await admin
    .from("profiles")
    .select("id, display_name, username, avatar_path, account_status")
    .eq("id", targetUserId)
    .eq("account_status", "active")
    .maybeSingle();

  if (targetProfileError) {
    console.error(
      "Failed to load Agore direct-message target:",
      targetProfileError,
    );

    return NextResponse.json(
      { error: "Unable to start the conversation." },
      { status: 500 },
    );
  }

  if (!targetProfile) {
    return NextResponse.json(
      { error: "User not found." },
      { status: 404 },
    );
  }

  const { data: blockRelationships, error: blockError } = await admin
    .from("blocks")
    .select("blocker_id, blocked_id")
    .or(
      `and(blocker_id.eq.${user.id},blocked_id.eq.${targetUserId}),and(blocker_id.eq.${targetUserId},blocked_id.eq.${user.id})`,
    )
    .limit(1);

  if (blockError) {
    console.error(
      "Failed to check Agore direct-message block relationship:",
      blockError,
    );

    return NextResponse.json(
      { error: "Unable to start the conversation." },
      { status: 500 },
    );
  }

  if (blockRelationships && blockRelationships.length > 0) {
    return NextResponse.json(
      { error: "You cannot message this user." },
      { status: 403 },
    );
  }

  const [participantA, participantB] =
    user.id < targetUserId
      ? [user.id, targetUserId]
      : [targetUserId, user.id];

  const { data: existingConversation, error: existingConversationError } =
    await admin
      .from("conversations")
      .select(
        `
          id,
          type,
          created_by,
          direct_participant_a,
          direct_participant_b,
          created_at,
          updated_at,
          last_message_at
        `,
      )
      .eq("type", "direct")
      .eq("direct_participant_a", participantA)
      .eq("direct_participant_b", participantB)
      .maybeSingle();

  if (existingConversationError) {
    console.error(
      "Failed to find existing Agore direct conversation:",
      existingConversationError,
    );

    return NextResponse.json(
      { error: "Unable to start the conversation." },
      { status: 500 },
    );
  }

  if (existingConversation) {
    return NextResponse.json({
      conversation: existingConversation,
      participant: targetProfile,
      created: false,
    });
  }

  const { data: conversation, error: conversationError } = await admin
    .from("conversations")
    .insert({
      type: "direct",
      created_by: user.id,
      direct_participant_a: participantA,
      direct_participant_b: participantB,
    })
    .select(
      `
        id,
        type,
        created_by,
        direct_participant_a,
        direct_participant_b,
        created_at,
        updated_at,
        last_message_at
      `,
    )
    .single();

  if (conversationError) {
    if (conversationError.code === "23505") {
      const { data: racedConversation, error: racedConversationError } =
        await admin
          .from("conversations")
          .select(
            `
              id,
              type,
              created_by,
              direct_participant_a,
              direct_participant_b,
              created_at,
              updated_at,
              last_message_at
            `,
          )
          .eq("type", "direct")
          .eq("direct_participant_a", participantA)
          .eq("direct_participant_b", participantB)
          .maybeSingle();

      if (racedConversationError || !racedConversation) {
        console.error(
          "Failed to recover Agore direct conversation race:",
          racedConversationError,
        );

        return NextResponse.json(
          { error: "Unable to start the conversation." },
          { status: 500 },
        );
      }

      return NextResponse.json({
        conversation: racedConversation,
        participant: targetProfile,
        created: false,
      });
    }

    console.error(
      "Failed to create Agore direct conversation:",
      conversationError,
    );

    return NextResponse.json(
      { error: "Unable to start the conversation." },
      { status: 500 },
    );
  }

  const { error: membersError } = await admin
    .from("conversation_members")
    .insert([
      {
        conversation_id: conversation.id,
        user_id: user.id,
        role: "member",
      },
      {
        conversation_id: conversation.id,
        user_id: targetUserId,
        role: "member",
      },
    ]);

  if (membersError) {
    console.error(
      "Failed to create Agore direct conversation members:",
      membersError,
    );

    await admin
      .from("conversations")
      .delete()
      .eq("id", conversation.id);

    return NextResponse.json(
      { error: "Unable to finish creating the conversation." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      conversation,
      participant: targetProfile,
      created: true,
    },
    { status: 201 },
  );
}