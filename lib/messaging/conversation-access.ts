import { createAdminClient } from "@/lib/supabase/admin";

type ConversationType = "direct" | "group";

export type MessagingConversation = {
  id: string;
  type: ConversationType;
  created_by: string;
  direct_participant_a: string | null;
  direct_participant_b: string | null;
};

export type MessagingMembership = {
  conversation_id: string;
  user_id: string;
  role: string;
  joined_at: string;
  left_at: string | null;
};

type MessagingAccessSuccess = {
  ok: true;
  conversation: MessagingConversation;
  membership: MessagingMembership;
};

type MessagingAccessFailure = {
  ok: false;
  status: 403 | 404 | 500;
  error: string;
};

export type MessagingAccessResult =
  | MessagingAccessSuccess
  | MessagingAccessFailure;

export async function getConversationMessagingAccess(
  conversationId: string,
  userId: string,
): Promise<MessagingAccessResult> {
  const admin = createAdminClient();

  const {
    data: conversation,
    error: conversationError,
  } = await admin
    .from("conversations")
    .select(
      `
        id,
        type,
        created_by,
        direct_participant_a,
        direct_participant_b
      `,
    )
    .eq("id", conversationId)
    .maybeSingle();

  if (conversationError) {
    console.error(
      "Failed to load Agore messaging conversation access:",
      conversationError,
    );

    return {
      ok: false,
      status: 500,
      error: "Unable to access this conversation.",
    };
  }

  if (!conversation) {
    return {
      ok: false,
      status: 404,
      error: "Conversation not found.",
    };
  }

  const {
    data: membership,
    error: membershipError,
  } = await admin
    .from("conversation_members")
    .select(
      `
        conversation_id,
        user_id,
        role,
        joined_at,
        left_at
      `,
    )
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .is("left_at", null)
    .maybeSingle();

  if (membershipError) {
    console.error(
      "Failed to verify Agore messaging membership:",
      membershipError,
    );

    return {
      ok: false,
      status: 500,
      error: "Unable to access this conversation.",
    };
  }

  if (!membership) {
    return {
      ok: false,
      status: 404,
      error: "Conversation not found.",
    };
  }

  if (
    conversation.type === "direct" &&
    conversation.direct_participant_a &&
    conversation.direct_participant_b
  ) {
    const {
      data: blockRelationships,
      error: blockError,
    } = await admin
      .from("blocks")
      .select("blocker_id, blocked_id")
      .or(
        `and(blocker_id.eq.${conversation.direct_participant_a},blocked_id.eq.${conversation.direct_participant_b}),and(blocker_id.eq.${conversation.direct_participant_b},blocked_id.eq.${conversation.direct_participant_a})`,
      )
      .limit(1);

    if (blockError) {
      console.error(
        "Failed to verify Agore direct-message block state:",
        blockError,
      );

      return {
        ok: false,
        status: 500,
        error: "Unable to access this conversation.",
      };
    }

    if (
      blockRelationships &&
      blockRelationships.length > 0
    ) {
      return {
        ok: false,
        status: 403,
        error:
          "Messaging is unavailable because one of the participants has blocked the other.",
      };
    }
  }

  return {
    ok: true,
    conversation:
      conversation as MessagingConversation,
    membership:
      membership as MessagingMembership,
  };
}

export async function getBlockedUserIds(
  userId: string,
) {
  const admin = createAdminClient();

  const {
    data: relationships,
    error,
  } = await admin
    .from("blocks")
    .select("blocker_id, blocked_id")
    .or(
      `blocker_id.eq.${userId},blocked_id.eq.${userId}`,
    );

  if (error) {
    console.error(
      "Failed to load Agore block relationships:",
      error,
    );

    return {
      ids: null as Set<string> | null,
      error,
    };
  }

  const ids = new Set<string>();

  for (const relationship of relationships ?? []) {
    if (relationship.blocker_id === userId) {
      ids.add(relationship.blocked_id);
    }

    if (relationship.blocked_id === userId) {
      ids.add(relationship.blocker_id);
    }
  }

  return {
    ids,
    error: null,
  };
}