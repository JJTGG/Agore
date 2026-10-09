import { NextResponse } from "next/server";
import { z } from "zod";

import { getBlockedUserIds } from "@/lib/messaging/conversation-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(30),
  cursor: z.string().min(1).max(500).optional(),
});

const cursorSchema = z.object({
  updatedAt: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
});

type ConversationCursor = z.infer<typeof cursorSchema>;

type ConversationMember = {
  user_id: string;
  role: string;
  joined_at: string;
  left_at: string | null;
  last_read_at: string | null;
};

type LatestMessageMedia = {
  media_type: "image" | "file" | "audio";
};

type LatestMessage = {
  id: string;
  sender_id: string | null;
  content: string | null;
  created_at: string;
  deleted_at: string | null;
  message_media: LatestMessageMedia[] | null;
};

type ConversationRow = {
  id: string;
  type: "direct" | "group";
  created_by: string;
  name: string | null;
  description: string | null;
  image_path: string | null;
  direct_participant_a: string | null;
  direct_participant_b: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
  membership: ConversationMember[] | null;
  messages: LatestMessage[] | null;
};

type Profile = {
  id: string;
  display_name: string;
  username: string;
  avatar_path: string | null;
};

function encodeCursor(cursor: ConversationCursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(value: string): ConversationCursor | null {
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    const parsed = cursorSchema.safeParse(JSON.parse(decoded));

    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function getLatestMessagePreview(message: LatestMessage | null) {
  if (!message) {
    return "No messages yet";
  }

  const content = message.content?.trim();

  if (content) {
    return content;
  }

  const media = message.message_media ?? [];

  if (media.some((item) => item.media_type === "audio")) {
    return "Voice message";
  }

  if (media.some((item) => item.media_type === "image")) {
    return "Image";
  }

  if (media.some((item) => item.media_type === "file")) {
    return "Attachment";
  }

  return "Message";
}

export async function GET(request: Request) {
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

  const { searchParams } = new URL(request.url);

  const parsedQuery = querySchema.safeParse({
    limit: searchParams.get("limit") ?? undefined,
    cursor: searchParams.get("cursor") ?? undefined,
  });

  if (!parsedQuery.success) {
    return NextResponse.json(
      { error: "Invalid conversation parameters." },
      { status: 400 },
    );
  }

  const { limit, cursor: cursorToken } = parsedQuery.data;

  let scanCursor: ConversationCursor | null = null;

  if (cursorToken) {
    scanCursor = decodeCursor(cursorToken);

    if (!scanCursor) {
      return NextResponse.json(
        { error: "Invalid conversation cursor." },
        { status: 400 },
      );
    }
  }

  const admin = createAdminClient();

  const {
    ids: blockedUserIds,
    error: blockError,
  } = await getBlockedUserIds(user.id);

  if (blockError || !blockedUserIds) {
    return NextResponse.json(
      { error: "Unable to load your conversations." },
      { status: 500 },
    );
  }

  const result: Array<Record<string, unknown>> = [];

  let hasMore = false;
  let lastScannedCursor: ConversationCursor | null = scanCursor;
  let exhausted = false;

  // Fetch in batches so hidden or blocked conversations do not result
  // in incomplete pages or repeated cursors.
  const batchSize = Math.min(100, Math.max(50, limit + 1));

  while (!exhausted) {
    let query = admin
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
          membership:conversation_members!inner (
            user_id,
            role,
            joined_at,
            left_at,
            last_read_at
          ),
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
      .eq("membership.user_id", user.id)
      .is("membership.left_at", null)
      .is("messages.deleted_at", null)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .order("created_at", {
        ascending: false,
        referencedTable: "messages",
      })
      .limit(1, { referencedTable: "messages" })
      .limit(batchSize);

    if (scanCursor) {
      query = query.or(
        `updated_at.lt.${scanCursor.updatedAt},and(updated_at.eq.${scanCursor.updatedAt},id.lt.${scanCursor.id})`,
      );
    }

    const {
      data: conversationRows,
      error: conversationsError,
    } = await query;

    if (conversationsError) {
      console.error(
        "Failed to load Agore conversations:",
        conversationsError,
      );

      return NextResponse.json(
        { error: "Unable to load your conversations." },
        { status: 500 },
      );
    }

    const rows = (conversationRows ?? []) as unknown as ConversationRow[];

    if (rows.length === 0) {
      exhausted = true;
      break;
    }

    const directOtherUserIds = [
      ...new Set(
        rows
          .filter(
            (conversation) =>
              conversation.type === "direct" &&
              conversation.direct_participant_a &&
              conversation.direct_participant_b &&
              (
                conversation.direct_participant_a === user.id ||
                conversation.direct_participant_b === user.id
              ),
          )
          .map((conversation) =>
            conversation.direct_participant_a === user.id
              ? conversation.direct_participant_b
              : conversation.direct_participant_a,
          )
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    let profiles: Profile[] = [];

    if (directOtherUserIds.length > 0) {
      const {
        data: profileRows,
        error: profilesError,
      } = await admin
        .from("profiles")
        .select("id, display_name, username, avatar_path")
        .in("id", directOtherUserIds)
        .eq("account_status", "active");

      if (profilesError) {
        console.error(
          "Failed to load Agore conversation participant profiles:",
          profilesError,
        );

        return NextResponse.json(
          { error: "Unable to load your conversations." },
          { status: 500 },
        );
      }

      profiles = (profileRows ?? []) as Profile[];
    }

    const profileMap = new Map(
      profiles.map((profile) => [profile.id, profile]),
    );

    for (const conversation of rows) {
      const rowCursor: ConversationCursor = {
        updatedAt: conversation.updated_at,
        id: conversation.id,
      };

      const membership =
        conversation.membership?.find(
          (item) =>
            item.user_id === user.id &&
            item.left_at === null,
        ) ?? null;

      if (!membership) {
        lastScannedCursor = rowCursor;
        continue;
      }

      let participant: Profile | null = null;

      if (conversation.type === "direct") {
        const participantA = conversation.direct_participant_a;
        const participantB = conversation.direct_participant_b;

        if (!participantA || !participantB) {
          lastScannedCursor = rowCursor;
          continue;
        }

        let otherUserId: string;

        if (participantA === user.id) {
          otherUserId = participantB;
        } else if (participantB === user.id) {
          otherUserId = participantA;
        } else {
          // A direct conversation must belong to the authenticated user.
          lastScannedCursor = rowCursor;
          continue;
        }

        if (blockedUserIds.has(otherUserId)) {
          lastScannedCursor = rowCursor;
          continue;
        }

        participant = profileMap.get(otherUserId) ?? null;

        if (!participant) {
          // Excludes direct conversations whose other account is inactive
          // or no longer has an active profile.
          lastScannedCursor = rowCursor;
          continue;
        }
      }

      // We have found an additional eligible conversation. Do not advance
      // past it: the next page must be able to return this conversation.
      if (result.length >= limit) {
        hasMore = true;
        break;
      }

      const latestMessage = conversation.messages?.[0] ?? null;

      const latestMessageIsOwn =
        latestMessage?.sender_id === user.id;

      const hasUnreadMessages = Boolean(
        latestMessage &&
          !latestMessageIsOwn &&
          (
            membership.last_read_at === null ||
            new Date(latestMessage.created_at).getTime() >
              new Date(membership.last_read_at).getTime()
          ),
      );

      result.push({
        id: conversation.id,
        type: conversation.type,
        created_by: conversation.created_by,
        name: conversation.name,
        description: conversation.description,
        image_path: conversation.image_path,
        last_message_at: conversation.last_message_at,
        created_at: conversation.created_at,
        updated_at: conversation.updated_at,
        membership: {
          role: membership.role,
          joined_at: membership.joined_at,
          last_read_at: membership.last_read_at,
        },
        participant,
        latest_message: latestMessage
          ? {
              id: latestMessage.id,
              sender_id: latestMessage.sender_id,
              content: latestMessage.content,
              created_at: latestMessage.created_at,
              preview: getLatestMessagePreview(latestMessage),
            }
          : null,
        has_unread_messages: hasUnreadMessages,
      });

      lastScannedCursor = rowCursor;
    }

    if (hasMore) {
      break;
    }

    // All rows from this batch were inspected. The next query continues
    // strictly after the last row scanned.
    const lastRow = rows[rows.length - 1];

    scanCursor = {
      updatedAt: lastRow.updated_at,
      id: lastRow.id,
    };

    lastScannedCursor = scanCursor;

    if (rows.length < batchSize) {
      exhausted = true;
    }
  }

  return NextResponse.json({
    conversations: result,
    hasMore,
    nextCursor:
      hasMore && lastScannedCursor
        ? encodeCursor(lastScannedCursor)
        : null,
  });
}