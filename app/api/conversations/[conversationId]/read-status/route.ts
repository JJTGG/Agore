import { NextResponse } from "next/server";
import { z } from "zod";

import { getConversationMessagingAccess } from "@/lib/messaging/conversation-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const conversationIdSchema = z.object({
  conversationId: z.string().uuid(),
});

type Reader = {
  user_id: string;
  last_read_at: string | null;
};

export async function GET(
  _request: Request,
  context: {
    params: Promise<{
      conversationId: string;
    }>;
  },
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

  const parsedParams =
    conversationIdSchema.safeParse({
      conversationId,
    });

  if (!parsedParams.success) {
    return NextResponse.json(
      { error: "A valid conversation ID is required." },
      { status: 400 },
    );
  }

  const access = await getConversationMessagingAccess(
    parsedParams.data.conversationId,
    user.id,
  );

  if (!access.ok) {
    return NextResponse.json(
      { error: access.error },
      { status: access.status },
    );
  }

  const admin = createAdminClient();

  const {
    data: memberRows,
    error: membersError,
  } = await admin
    .from("conversation_members")
    .select("user_id, last_read_at")
    .eq(
      "conversation_id",
      parsedParams.data.conversationId,
    )
    .is("left_at", null);

  if (membersError) {
    console.error(
      "Failed to load Agore conversation reader state:",
      membersError,
    );

    return NextResponse.json(
      { error: "Unable to load read status." },
      { status: 500 },
    );
  }

  const readers = (memberRows ?? [])
    .filter(
      (member: Reader) =>
        member.user_id !== user.id,
    )
    .map((member: Reader) => ({
      user_id: member.user_id,
      last_read_at: member.last_read_at,
    }));

  return NextResponse.json({
    conversation_type: access.conversation.type,
    current_user_id: user.id,
    readers,
  });
}