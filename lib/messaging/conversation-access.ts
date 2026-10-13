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

  const { data, error } = await admin.rpc(
    "agore_get_conversation_messaging_access",
    {
      p_conversation_id: conversationId,
      p_user_id: userId,
    },
  );

  if (error) {
    console.error(
      "Failed to load Agore messaging conversation access:",
      error,
    );

    return {
      ok: false,
      status: 500,
      error: "Unable to access this conversation.",
    };
  }

  const result = data as {
    conversation?: MessagingConversation | null;
    membership?: MessagingMembership | null;
    blocked?: boolean;
  } | null;
  const conversation = result?.conversation ?? null;
  const membership = result?.membership ?? null;

  if (!conversation || !membership) {
    return {
      ok: false,
      status: 404,
      error: "Conversation not found.",
    };
  }

  if (result?.blocked) {
    return {
      ok: false,
      status: 403,
      error:
        "Messaging is unavailable because one of the participants has blocked the other.",
    };
  }

  return {
    ok: true,
    conversation,
    membership,
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