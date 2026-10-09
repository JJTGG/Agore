import { NextResponse } from "next/server";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const searchSchema = z.object({
  q: z.string().trim().min(2).max(50).optional(),
  limit: z.coerce.number().int().min(1).max(30).default(20),
});

type Profile = {
  id: string;
  display_name: string;
  username: string;
  bio: string | null;
  avatar_path: string | null;
  created_at: string;
};

type PostMedia = {
  id: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  sort_order: number;
  created_at: string;
};

type Post = {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  post_media: PostMedia[];
  author: Profile | null;
};

type PostQueryRow = Omit<Post, "author" | "post_media"> & {
  author: Profile[] | null;
  post_media: PostMedia[] | null;
};

type Group = {
  id: string;
  name: string | null;
  description: string | null;
  image_path: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

function escapeSearchTerm(value: string) {
  return value.replace(/[%_]/g, "\\$&");
}

async function getAuthenticatedUser() {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

async function getBlockedUserIds(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
) {
  const { data, error } = await admin
    .from("blocks")
    .select("blocker_id, blocked_id")
    .or(
      `blocker_id.eq.${userId},blocked_id.eq.${userId}`,
    );

  if (error) {
    console.error(
      "Failed to load Agore block relationships for discovery:",
      error,
    );

    throw new Error("Unable to prepare discovery.");
  }

  const blockedIds = new Set<string>([userId]);

  for (const relationship of data ?? []) {
    blockedIds.add(relationship.blocker_id);
    blockedIds.add(relationship.blocked_id);
  }

  return Array.from(blockedIds);
}

function excludeIds<T extends { not: Function }>(
  query: T,
  column: string,
  ids: string[],
) {
  if (ids.length === 0) {
    return query;
  }

  return query.not(
    column,
    "in",
    `(${ids.join(",")})`,
  );
}

function sortPostMedia(media: PostMedia[] | null) {
  return [...(media ?? [])].sort(
    (a, b) =>
      a.sort_order - b.sort_order ||
      new Date(a.created_at).getTime() -
        new Date(b.created_at).getTime(),
  );
}

function normalizePost(post: PostQueryRow): Post {
  const author = Array.isArray(post.author)
    ? post.author[0] ?? null
    : post.author;

  return {
    ...post,
    author,
    post_media: sortPostMedia(post.post_media),
  };
}

export async function GET(request: Request) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json(
      {
        error: "Authentication required.",
      },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);

  const rawQuery = searchParams.get("q")?.trim() ?? "";

  const parsedQuery = searchSchema.safeParse({
    q: rawQuery || undefined,
    limit: searchParams.get("limit") ?? undefined,
  });

  if (!parsedQuery.success) {
    return NextResponse.json(
      {
        error:
          parsedQuery.error.issues[0]?.message ??
          "Invalid search query.",
      },
      { status: 400 },
    );
  }

  const queryText = parsedQuery.data.q ?? "";
  const isDiscovery = queryText.length === 0;
  const limit = parsedQuery.data.limit;

  const searchTerm = isDiscovery
    ? null
    : escapeSearchTerm(queryText);

  const admin = createAdminClient();

  let blockedUserIds: string[];

  try {
    blockedUserIds = await getBlockedUserIds(
      admin,
      user.id,
    );
  } catch {
    return NextResponse.json(
      {
        error: "Unable to prepare discovery.",
      },
      { status: 500 },
    );
  }

  /*
   * Discovery should prioritize people the current user has
   * not followed yet. Search, however, must still be able to
   * find people the user already follows.
   */
  let followedIds: string[] = [];

  if (isDiscovery) {
    const {
      data: follows,
      error: followsError,
    } = await admin
      .from("follows")
      .select("following_id")
      .eq("follower_id", user.id);

    if (followsError) {
      console.error(
        "Failed to load Agore following relationships:",
        followsError,
      );

      return NextResponse.json(
        {
          error: "Unable to prepare discovery.",
        },
        { status: 500 },
      );
    }

    followedIds = [
      ...new Set(
        (follows ?? []).map(
          (follow) => follow.following_id,
        ),
      ),
    ];
  }

  const discoveryExcludedIds = [
    ...new Set([
      ...blockedUserIds,
      ...followedIds,
    ]),
  ];

  /*
   * People:
   * - Search mode matches usernames and display names.
   * - Discovery mode surfaces recently created active accounts
   *   the viewer has not followed.
   * - Both modes exclude the viewer and blocked accounts.
   */
  let peopleQuery = admin
    .from("profiles")
    .select(
      "id, display_name, username, bio, avatar_path, created_at",
    )
    .eq("account_status", "active")
    .order(
      isDiscovery ? "created_at" : "username",
      {
        ascending: !isDiscovery,
      },
    )
    .limit(
      isDiscovery ? Math.min(limit, 12) : limit,
    );

  peopleQuery = excludeIds(
    peopleQuery,
    "id",
    isDiscovery
      ? discoveryExcludedIds
      : blockedUserIds,
  );

  if (searchTerm) {
    peopleQuery = peopleQuery.or(
      `username.ilike.${searchTerm}%,display_name.ilike.%${searchTerm}%`,
    );
  }

  /*
   * Posts:
   * Include media metadata so Explore can use the existing
   * private-storage signed-URL component.
   *
   * Search mode matches post text.
   * Discovery mode surfaces recent posts from active accounts
   * the viewer has not followed, excluding blocked accounts.
   */
  let postsQuery = admin
    .from("posts")
    .select(
      `
        id,
        author_id,
        content,
        created_at,
        updated_at,
        post_media (
          id,
          storage_path,
          mime_type,
          size_bytes,
          width,
          height,
          sort_order,
          created_at
        ),
        author:profiles!posts_author_id_fkey!inner (
          id,
          display_name,
          username,
          bio,
          avatar_path,
          created_at
        )
      `,
    )
    .is("deleted_at", null)
    .eq("author.account_status", "active")
    .order("created_at", {
      ascending: false,
    })
    .limit(
      isDiscovery ? Math.min(limit, 20) : limit,
    );

  postsQuery = excludeIds(
    postsQuery,
    "author_id",
    isDiscovery
      ? discoveryExcludedIds
      : blockedUserIds.filter(
          (id) => id !== user.id,
        ),
  );

  if (searchTerm) {
    postsQuery = postsQuery.ilike(
      "content",
      `%${searchTerm}%`,
    );
  }

  /*
   * Groups are private conversation objects in V0.
   * Search can find groups the user already belongs to;
   * general discovery must not expose arbitrary group details.
   */
  let groups: Group[] = [];

  if (searchTerm) {
    const {
      data: memberships,
      error: membershipError,
    } = await admin
      .from("conversation_members")
      .select("conversation_id")
      .eq("user_id", user.id)
      .is("left_at", null);

    if (membershipError) {
      console.error(
        "Failed to load Agore group memberships for search:",
        membershipError,
      );

      return NextResponse.json(
        {
          error: "Unable to search groups.",
        },
        { status: 500 },
      );
    }

    const groupConversationIds = [
      ...new Set(
        (memberships ?? []).map(
          (membership) => membership.conversation_id,
        ),
      ),
    ];

    if (groupConversationIds.length > 0) {
      const {
        data: groupRows,
        error: groupsError,
      } = await admin
        .from("conversations")
        .select(
          `
            id,
            name,
            description,
            image_path,
            created_by,
            created_at,
            updated_at
          `,
        )
        .eq("type", "group")
        .in("id", groupConversationIds)
        .or(
          `name.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`,
        )
        .order("updated_at", {
          ascending: false,
        })
        .limit(limit);

      if (groupsError) {
        console.error(
          "Failed to search Agore groups:",
          groupsError,
        );

        return NextResponse.json(
          {
            error: "Unable to search groups.",
          },
          { status: 500 },
        );
      }

      groups = (groupRows ?? []) as Group[];
    }
  }

  const [
    {
      data: peopleRows,
      error: peopleError,
    },
    {
      data: postRows,
      error: postsError,
    },
  ] = await Promise.all([
    peopleQuery,
    postsQuery,
  ]);

  if (peopleError) {
    console.error(
      "Failed to load Agore discovery people:",
      peopleError,
    );

    return NextResponse.json(
      {
        error: "Unable to load people.",
      },
      { status: 500 },
    );
  }

  if (postsError) {
    console.error(
      "Failed to load Agore discovery posts:",
      postsError,
    );

    return NextResponse.json(
      {
        error: "Unable to load posts.",
      },
      { status: 500 },
    );
  }

  const people = (peopleRows ?? []) as Profile[];

  const posts = (
    (postRows ?? []) as unknown as PostQueryRow[]
  ).map(normalizePost);

  /*
   * Return the current following status in one server query
   * instead of requiring a separate request for every person.
   */
  let followingIds: string[] = [];

  if (!isDiscovery && people.length > 0) {
    const {
      data: matchingFollows,
      error: followingError,
    } = await admin
      .from("follows")
      .select("following_id")
      .eq("follower_id", user.id)
      .in(
        "following_id",
        people.map((person) => person.id),
      );

    if (followingError) {
      console.error(
        "Failed to load Agore search follow status:",
        followingError,
      );

      return NextResponse.json(
        {
          error: "Unable to load follow status.",
        },
        { status: 500 },
      );
    }

    followingIds = [
      ...new Set(
        (matchingFollows ?? []).map(
          (follow) => follow.following_id,
        ),
      ),
    ];
  }

  return NextResponse.json({
    mode: isDiscovery ? "discover" : "search",
    query: isDiscovery ? null : queryText,
    people,
    posts,
    groups,
    followingIds,
  });
}