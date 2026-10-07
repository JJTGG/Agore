import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{
    conversationId: string;
  }>;
};

export async function PATCH(
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

  if (!conversationId) {
    return NextResponse.json(
      { error: "Conversation ID is required." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data: membership, error: membershipError } = await admin
    .from("conversation_members")
    .select("conversation_id, user_id, joined_at, left_at")
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError) {
    console.error(
      "Failed to load Agore conversation read-state membership:",
      membershipError,
    );

    return NextResponse.json(
      { error: "Unable to update read state." },
      { status: 500 },
    );
  }

  if (!membership || membership.left_at) {
    return NextResponse.json(
      { error: "Conversation not found." },
      { status: 404 },
    );
  }

  const { data: updatedMembership, error: updateError } = await admin
    .from("conversation_members")
    .update({
      last_read_at: new Date().toISOString(),
    })
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id)
    .is("left_at", null)
    .select("conversation_id, user_id, last_read_at")
    .single();

  if (updateError) {
    console.error(
      "Failed to update Agore conversation read state:",
      updateError,
    );

    return NextResponse.json(
      { error: "Unable to update read state." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    read_state: updatedMembership,
  });
}