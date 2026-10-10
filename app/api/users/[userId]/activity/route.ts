import { NextResponse } from "next/server";
import { z } from "zod";

import {
  canViewerSeeActivityEvent,
} from "@/lib/activity/visibility";
import {
  createAdminClient,
} from "@/lib/supabase/admin";
import {
  createClient,
} from "@/lib/supabase/server";

const userIdSchema = z.uuid();

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const activityEventTypes = [
  "post.created",
  "post.reaction.added",
  "comment.created",
  "repost.created",
  "follow.created",
  "follow.deleted",
] as const;

type ActivityEventRow = {
  event_id: string;
  event_sequence: number | string;
  event_type: string;
  actor_id: string | null;
  target_id: string | null;
  visibility_class: string;
  data: Record<string, unknown> | null;
  occurred_at: string;
};

type ProfileRow = {
  id: string;
  username: string;
  display_name: string;
  avatar_path: string | null;
  account_status: string;
};

type PostRow = {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
  profiles: ProfileRow | ProfileRow[] | null;
};

type CommentRow = {
  id: string;
  post_id: string;
  author_id: string;
  deleted_at: string | null;
};

type BlockRow = {
  blocker_id: string;
  blocked_id: string;
};

type PublicProfile = {
  id: string;
  username: string;
  display_name: string;
  avatar_path: string | null;
};

type VisiblePost = {
  id: string;
  content: string;
  created_at: string;
  author: PublicProfile;
  author_id: string;
};

function privateJson(
  payload: unknown,
  status = 200,
) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      Vary: "Cookie",
    },
  });
}

function getEventDataId(
  event: ActivityEventRow,
  key: string,
): string | null {
  const value = event.data?.[key];

  if (typeof value !== "string") {
    return null;
  }

  const parsed = userIdSchema.safeParse(value);

  return parsed.success ? parsed.data : null;
}

function getFollowTargetId(
  event: ActivityEventRow,
): string | null {
  if (event.target_id) {
    const parsed = userIdSchema.safeParse(
      event.target_id,
    );

    if (parsed.success) {
      return parsed.data;
    }
  }

  return getEventDataId(event, "following_id");
}

function normalizeProfile(
  profile: ProfileRow | ProfileRow[] | null,
): ProfileRow | null {
  if (!profile) {
    return null;
  }

  return Array.isArray(profile)
    ? profile[0] ?? null
    : profile;
}

function publicProfile(
  profile: ProfileRow,
): PublicProfile {
  return {
    id: profile.id,
    username: profile.username,
    display_name: profile.display_name,
    avatar_path: profile.avatar_path,
  };
}

export async function GET(
  request: Request,
  context: {
    params: Promise<{
      userId: string;
    }>;
  },
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return privateJson(
      { error: "Authentication required." },
      401,
    );
  }

  const { userId } = await context.params;
  const parsedUserId = userIdSchema.safeParse(userId);

  if (!parsedUserId.success) {
    return privateJson(
      { error: "Invalid user ID." },
      400,
    );
  }

  const activityOwnerId = parsedUserId.data;
  const viewerId = user.id;
  const isOwner = viewerId === activityOwnerId;

  const url = new URL(request.url);

  const parsedQuery = querySchema.safeParse({
    limit: url.searchParams.get("limit") ?? undefined,
  });

  if (!parsedQuery.success) {
    return privateJson(
      { error: "Invalid activity parameters." },
      400,
    );
  }

  const limit = parsedQuery.data.limit;
  const beforeSequence =
    url.searchParams.get("beforeSequence");

  if (
    beforeSequence !== null &&
    !/^[1-9]\d{0,18}$/.test(beforeSequence)
  ) {
    return privateJson(
      { error: "Invalid activity cursor." },
      400,
    );
  }

  const admin = createAdminClient();

  const [
    profileResult,
    blockResult,
  ] = await Promise.all([
    admin
      .from("profiles")
      .select(
        "id, username, display_name, avatar_path, account_status",
      )
      .eq("id", activityOwnerId)
      .eq("account_status", "active")
      .maybeSingle(),

    admin
      .from("blocks")
      .select("blocker_id, blocked_id")
      .or(
        `blocker_id.eq.${viewerId},blocked_id.eq.${viewerId}`,
      ),
  ]);

  if (profileResult.error || blockResult.error) {
    console.error(
      "Failed to resolve Agore activity access:",
      {
        profileError: profileResult.error,
        blockError: blockResult.error,
      },
    );

    return privateJson(
      { error: "Unable to load activity." },
      500,
    );
  }

  if (!profileResult.data) {
    return privateJson(
      { error: "Profile not found." },
      404,
    );
  }

  const blockedUserIds = new Set<string>();

  for (
    const relationship of
      (blockResult.data ?? []) as BlockRow[]
  ) {
    blockedUserIds.add(
      relationship.blocker_id === viewerId
        ? relationship.blocked_id
        : relationship.blocker_id,
    );
  }

  const hasBlockingRelationship =
    !isOwner &&
    blockedUserIds.has(activityOwnerId);

  if (hasBlockingRelationship) {
    return privateJson(
      { error: "Profile not found." },
      404,
    );
  }

  let eventsQuery = admin
    .from("agore_events")
    .select(
      [
        "event_id",
        "event_sequence",
        "event_type",
        "actor_id",
        "target_id",
        "visibility_class",
        "data",
        "occurred_at",
      ].join(", "),
    )
    .eq("actor_id", activityOwnerId)
    .in("event_type", [...activityEventTypes])
    .in("visibility_class", ["PUBLIC", "PRIVATE"])
    .order("event_sequence", {
      ascending: false,
    });

  if (beforeSequence !== null) {
    eventsQuery = eventsQuery.lt(
      "event_sequence",
      beforeSequence,
    );
  }

  const {
    data: eventData,
    error: eventsError,
  } = await eventsQuery.limit(limit + 1);

  if (eventsError) {
    console.error(
      "Failed to load Agore activity events:",
      eventsError,
    );

    return privateJson(
      { error: "Unable to load activity." },
      500,
    );
  }

  const fetchedEvents =
    (eventData ?? []) as unknown as ActivityEventRow[];

  // Paginate the events being scanned, not just the events
  // eventually shown. Hidden records must not break cursors.
  const hasMore = fetchedEvents.length > limit;
  const scannedEvents = fetchedEvents.slice(0, limit);

  const postIds = [
    ...new Set(
      scannedEvents
        .map((event) =>
          getEventDataId(event, "post_id"),
        )
        .filter(
          (id): id is string => id !== null,
        ),
    ),
  ];

  const commentIds = [
    ...new Set(
      scannedEvents
        .filter(
          (event) =>
            event.event_type === "comment.created",
        )
        .map((event) =>
          getEventDataId(event, "comment_id"),
        )
        .filter(
          (id): id is string => id !== null,
        ),
    ),
  ];

  const followTargetIds = [
    ...new Set(
      scannedEvents
        .filter(
          (event) =>
            event.event_type === "follow.created" ||
            event.event_type === "follow.deleted",
        )
        .map(getFollowTargetId)
        .filter(
          (id): id is string => id !== null,
        ),
    ),
  ];

  const [
    postsResult,
    commentsResult,
    followProfilesResult,
  ] = await Promise.all([
    postIds.length > 0
      ? admin
          .from("posts")
          .select(`
            id,
            author_id,
            content,
            created_at,
            profiles!posts_author_id_fkey (
              id,
              username,
              display_name,
              avatar_path,
              account_status
            )
          `)
          .in("id", postIds)
          .is("deleted_at", null)
      : Promise.resolve({
          data: [],
          error: null,
        }),

    commentIds.length > 0
      ? admin
          .from("comments")
          .select(
            "id, post_id, author_id, deleted_at",
          )
          .in("id", commentIds)
          .is("deleted_at", null)
      : Promise.resolve({
          data: [],
          error: null,
        }),

    followTargetIds.length > 0
      ? admin
          .from("profiles")
          .select(
            "id, username, display_name, avatar_path, account_status",
          )
          .in("id", followTargetIds)
          .eq("account_status", "active")
      : Promise.resolve({
          data: [],
          error: null,
        }),
  ]);

  if (
    postsResult.error ||
    commentsResult.error ||
    followProfilesResult.error
  ) {
    console.error(
      "Failed to resolve Agore activity references:",
      {
        postsError: postsResult.error,
        commentsError: commentsResult.error,
        followProfilesError:
          followProfilesResult.error,
      },
    );

    return privateJson(
      { error: "Unable to load activity." },
      500,
    );
  }

  const visiblePosts = new Map<
    string,
    VisiblePost
  >();

  for (
    const rawPost of
      (postsResult.data ?? []) as unknown as PostRow[]
  ) {
    const author = normalizeProfile(rawPost.profiles);

    if (
      !author ||
      author.account_status !== "active" ||
      blockedUserIds.has(author.id)
    ) {
      continue;
    }

    visiblePosts.set(rawPost.id, {
      id: rawPost.id,
      content: rawPost.content,
      created_at: rawPost.created_at,
      author: publicProfile(author),
      author_id: rawPost.author_id,
    });
  }

  const visibleComments = new Map(
    (
      (commentsResult.data ?? []) as unknown as CommentRow[]
    ).map((comment) => [
      comment.id,
      comment,
    ]),
  );

  const activeFollowProfiles = new Map<
    string,
    ProfileRow
  >();

  for (
    const profile of
      (followProfilesResult.data ?? []) as unknown as ProfileRow[]
  ) {
    if (!blockedUserIds.has(profile.id)) {
      activeFollowProfiles.set(profile.id, profile);
    }
  }

  const activity = [];

  for (const event of scannedEvents) {
    const postId = getEventDataId(
      event,
      "post_id",
    );

    const post = postId
      ? visiblePosts.get(postId) ?? null
      : null;

    let referencedContentVisible = false;
    let relatedUser: PublicProfile | null = null;

    switch (event.event_type) {
      case "post.created":
        referencedContentVisible =
          post !== null &&
          post.author_id === activityOwnerId;
        break;

      case "post.reaction.added":
      case "repost.created":
        referencedContentVisible = post !== null;
        break;

      case "comment.created": {
        const commentId = getEventDataId(
          event,
          "comment_id",
        );

        const comment = commentId
          ? visibleComments.get(commentId)
          : null;

        referencedContentVisible =
          post !== null &&
          comment !== undefined &&
          comment !== null &&
          comment.author_id === activityOwnerId &&
          comment.post_id === post.id;

        break;
      }

      case "follow.created":
      case "follow.deleted": {
        const followTargetId = getFollowTargetId(event);

        const profile = followTargetId
          ? activeFollowProfiles.get(followTargetId)
          : null;

        relatedUser = profile
          ? publicProfile(profile)
          : null;

        referencedContentVisible =
          isOwner &&
          relatedUser !== null;

        break;
      }

      default:
        // Unknown event types are never exposed.
        continue;
    }

    const allowed = canViewerSeeActivityEvent(
      event,
      {
        viewerId,
        activityOwnerId,
        hasBlockingRelationship: false,
        referencedContentVisible,
      },
    );

    if (!allowed) {
      continue;
    }

    // Do not return raw event data, internal IDs from its
    // metadata, or unapproved event types.
    activity.push({
      id: event.event_id,
      type: event.event_type,
      occurred_at: event.occurred_at,
      post,
      related_user: relatedUser,
    });
  }

  const lastScannedEvent =
    scannedEvents[scannedEvents.length - 1];

  return privateJson({
    profile: publicProfile(
      profileResult.data as ProfileRow,
    ),
    activity,
    pagination: {
      limit,
      hasMore,
      nextCursor:
        hasMore && lastScannedEvent
          ? String(lastScannedEvent.event_sequence)
          : null,
    },
  });
}