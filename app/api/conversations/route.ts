import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getBlockedUserIds,
} from "@/lib/messaging/conversation-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const querySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(30),
});

type ConversationMember = {
  conversation_id: string;
  user_id: string;
  role: string;
  joined_at: string;
  left_at: string | null;
  last_read_at: string | null;
};

type LatestMessageMedia = {
  media_type:
    | "image"
    | "file"
    | "audio";
};

type LatestMessage = {
  id: string;
  sender_id: string | null;
  content: string | null;
  created_at: string;
  deleted_at: string | null;
  message_media:
    | LatestMessageMedia[]
    | null;
};

type Conversation = {
  id: string;
  type: "direct" | "group";
  created_by: string;
  name: string | null;
  description: string | null;
  image_path: string | null;
  direct_participant_a:
    string | null;
  direct_participant_b:
    string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
  messages:
    | LatestMessage[]
    | null;
};

type Profile = {
  id: string;
  display_name: string;
  username: string;
  avatar_path: string | null;
};

function getLatestMessagePreview(
  message: LatestMessage | null,
) {
  if (!message) {
    return "No messages yet";
  }

  const content =
    message.content?.trim();

  if (content) {
    return content;
  }

  const media =
    message.message_media ?? [];

  if (
    media.some(
      (item) =>
        item.media_type ===
        "audio",
    )
  ) {
    return "Voice message";
  }

  if (
    media.some(
      (item) =>
        item.media_type ===
        "image",
    )
  ) {
    return "Image";
  }

  if (
    media.some(
      (item) =>
        item.media_type ===
        "file",
    )
  ) {
    return "Attachment";
  }

  return "Message";
}

export async function GET(
  request: Request,
) {
  const supabase =
    await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      {
        error:
          "Authentication required.",
      },
      {
        status: 401,
      },
    );
  }

  const { searchParams } =
    new URL(request.url);

  const parsedQuery =
    querySchema.safeParse({
      limit:
        searchParams.get(
          "limit",
        ) ?? undefined,
    });

  if (!parsedQuery.success) {
    return NextResponse.json(
      {
        error:
          "Invalid conversation parameters.",
      },
      {
        status: 400,
      },
    );
  }

  const admin =
    createAdminClient();

  const {
    ids: blockedUserIds,
    error: blockError,
  } = await getBlockedUserIds(
    user.id,
  );

  if (blockError || !blockedUserIds) {
    return NextResponse.json(
      {
        error:
          "Unable to load your conversations.",
      },
      {
        status: 500,
      },
    );
  }

  const {
    data: memberships,
    error: membershipError,
  } = await admin
    .from(
      "conversation_members",
    )
    .select(
      `
        conversation_id,
        user_id,
        role,
        joined_at,
        left_at,
        last_read_at
      `,
    )
    .eq("user_id", user.id)
    .is("left_at", null)
    .order("joined_at", {
      ascending: false,
    })
    .limit(
      Math.min(
        parsedQuery.data.limit +
          20,
        100,
      ),
    );

  if (membershipError) {
    console.error(
      "Failed to load Agore conversation memberships:",
      membershipError,
    );

    return NextResponse.json(
      {
        error:
          "Unable to load your conversations.",
      },
      {
        status: 500,
      },
    );
  }

  if (
    !memberships ||
    memberships.length === 0
  ) {
    return NextResponse.json({
      conversations: [],
    });
  }

  const conversationIds = [
    ...new Set(
      memberships.map(
        (
          membership: ConversationMember,
        ) =>
          membership.conversation_id,
      ),
    ),
  ];

  const {
    data: conversations,
    error:
      conversationsError,
  } = await admin
    .from("conversations")
    .select(
      `
        id,
        type,
        created_by,
        name,
        description,
        image_path,
        direct_participant_a,
        direct_participant_b,
        last_message_at,
        created_at,
        updated_at,
        messages (
          id,
          sender_id,
          content,
          created_at,
          deleted_at,
          message_media (
            media_type
          )
        )
      `,
    )
    .in(
      "id",
      conversationIds,
    )
    .is(
      "messages.deleted_at",
      null,
    )
    .order("created_at", {
      ascending: false,
      referencedTable:
        "messages",
    })
    .limit(1, {
      referencedTable:
        "messages",
    });

  if (conversationsError) {
    console.error(
      "Failed to load Agore conversations:",
      conversationsError,
    );

    return NextResponse.json(
      {
        error:
          "Unable to load your conversations.",
      },
      {
        status: 500,
      },
    );
  }

  if (
    !conversations ||
    conversations.length === 0
  ) {
    return NextResponse.json({
      conversations: [],
    });
  }

  const typedConversations =
    conversations as unknown as Conversation[];

  const directOtherUserIds = [
    ...new Set(
      typedConversations
        .filter(
          (conversation) =>
            conversation.type ===
              "direct" &&
            conversation.direct_participant_a &&
            conversation.direct_participant_b,
        )
        .map((conversation) =>
          conversation.direct_participant_a ===
          user.id
            ? conversation.direct_participant_b
            : conversation.direct_participant_a,
        )
        .filter(
          (
            id,
          ): id is string =>
            Boolean(id),
        ),
    ),
  ];

  let profiles: Profile[] =
    [];

  if (
    directOtherUserIds.length >
    0
  ) {
    const {
      data: profileRows,
      error: profilesError,
    } = await admin
      .from("profiles")
      .select(
        "id, display_name, username, avatar_path",
      )
      .in(
        "id",
        directOtherUserIds,
      )
      .eq(
        "account_status",
        "active",
      );

    if (profilesError) {
      console.error(
        "Failed to load Agore conversation participant profiles:",
        profilesError,
      );

      return NextResponse.json(
        {
          error:
            "Unable to load your conversations.",
        },
        {
          status: 500,
        },
      );
    }

    profiles =
      (profileRows ??
        []) as Profile[];
  }

  const profileMap =
    new Map(
      profiles.map(
        (profile) => [
          profile.id,
          profile,
        ],
      ),
    );

  const membershipMap =
    new Map(
      (
        memberships as ConversationMember[]
      ).map(
        (membership) => [
          membership.conversation_id,
          membership,
        ],
      ),
    );

  const result =
    typedConversations
      .map(
        (conversation) => {
          const membership =
            membershipMap.get(
              conversation.id,
            );

          if (!membership) {
            return null;
          }

          let participant:
            | Profile
            | null = null;

          if (
            conversation.type ===
              "direct" &&
            conversation.direct_participant_a &&
            conversation.direct_participant_b
          ) {
            const otherUserId =
              conversation.direct_participant_a ===
              user.id
                ? conversation.direct_participant_b
                : conversation.direct_participant_a;

            if (
              blockedUserIds.has(
                otherUserId,
              )
            ) {
              return null;
            }

            participant =
              profileMap.get(
                otherUserId,
              ) ?? null;

            if (!participant) {
              return null;
            }
          }

          const latestMessage =
            conversation.messages?.[0] ??
            null;

          const latestMessagePreview =
            getLatestMessagePreview(
              latestMessage,
            );

          const latestMessageIsOwn =
            latestMessage?.sender_id ===
            user.id;

          const hasUnreadMessages =
            Boolean(
              latestMessage &&
                !latestMessageIsOwn &&
                (
                  membership.last_read_at ===
                    null ||
                  new Date(
                    latestMessage.created_at,
                  ).getTime() >
                    new Date(
                      membership.last_read_at,
                    ).getTime()
                ),
            );

          return {
            id: conversation.id,
            type: conversation.type,
            created_by:
              conversation.created_by,
            name:
              conversation.name,
            description:
              conversation.description,
            image_path:
              conversation.image_path,
            last_message_at:
              conversation.last_message_at,
            created_at:
              conversation.created_at,
            updated_at:
              conversation.updated_at,
            membership: {
              role:
                membership.role,
              joined_at:
                membership.joined_at,
              last_read_at:
                membership.last_read_at,
            },
            participant,
            latest_message:
              latestMessage
                ? {
                    id:
                      latestMessage.id,
                    sender_id:
                      latestMessage.sender_id,
                    content:
                      latestMessage.content,
                    created_at:
                      latestMessage.created_at,
                    preview:
                      latestMessagePreview,
                  }
                : null,
            has_unread_messages:
              hasUnreadMessages,
          };
        },
      )
      .filter(
        (
          conversation,
        ): conversation is NonNullable<
          typeof conversation
        > =>
          conversation !==
          null,
      )
      .sort((a, b) => {
        const aDate =
          new Date(
            a.last_message_at ??
              a.created_at,
          ).getTime();

        const bDate =
          new Date(
            b.last_message_at ??
              b.created_at,
          ).getTime();

        return bDate - aDate;
      })
      .slice(
        0,
        parsedQuery.data.limit,
      );

  return NextResponse.json({
    conversations:
      result,
  });
}