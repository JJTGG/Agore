import { NextResponse } from "next/server";
import { z } from "zod";

import { getConversationMessagingAccess } from "@/lib/messaging/conversation-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{
    conversationId: string;
  }>;
};

const conversationIdSchema = z.string().uuid();

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

  const parsedConversationId =
    conversationIdSchema.safeParse(conversationId);

  if (!parsedConversationId.success) {
    return NextResponse.json(
      { error: "A valid conversation ID is required." },
      { status: 400 },
    );
  }

  // Reuse the central access policy for active membership,
  // conversation existence, and direct-message block checks.
  const access = await getConversationMessagingAccess(
    parsedConversationId.data,
    user.id,
  );

  if (!access.ok) {
    return NextResponse.json(
      { error: access.error },
      { status: access.status },
    );
  }

  const admin = createAdminClient();

  const { data: updatedMembership, error: updateError } =
    await admin
      .from("conversation_members")
      .update({
        last_read_at: new Date().toISOString(),
      })
      .eq("conversation_id", parsedConversationId.data)
      .eq("user_id", user.id)
      .is("left_at", null)
      .select("conversation_id, user_id, last_read_at")
      .single();

  if (updateError || !updatedMembership) {
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