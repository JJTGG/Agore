import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const searchSchema = z.object({
  q: z.string().trim().min(2).max(50),
  limit: z.coerce.number().int().min(1).max(30).default(20),
});

type Profile = {
  id: string;
  display_name: string;
  username: string;
  bio: string | null;
  avatar_path: string | null;
};

type Post = {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  author: Profile | null;
};

type PostQueryRow = Omit<Post, "author"> & {
  author: Profile[];
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
    return {
      supabase,
      user: null,
    };
  }

  return {
    supabase,
    user,
  };
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
      "Failed to load Agore block relationships for search:",
      error,
    );

    throw new Error(
      "Unable to prepare search.",
    );
  }

  const blockedIds = new Set<string>([
    userId,
  ]);

  for (const relationship of data ?? []) {
    blockedIds.add(
      relationship.blocker_id,
    );
    blockedIds.add(
      relationship.blocked_id,
    );
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

export async function GET(request: Request) {
  const { user } =
    await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json(
      {
        error:
          "Authentication required.",
      },
      { status: 401 },
    );
  }

  const { searchParams } =
    new URL(request.url);

  const parsedQuery =
    searchSchema.safeParse({
      q:
        searchParams.get("q") ??
        "",
      limit:
        searchParams.get(
          "limit",
        ) ?? undefined,
    });

  if (!parsedQuery.success) {
    return NextResponse.json(
      {
        error:
          parsedQuery.error.issues[0]
            ?.message ??
          "Invalid search query.",
      },
      { status: 400 },
    );
  }

  const searchTerm =
    escapeSearchTerm(
      parsedQuery.data.q,
    );

  const limit =
    parsedQuery.data.limit;

  const admin =
    createAdminClient();

  let blockedUserIds: string[];

  try {
    blockedUserIds =
      await getBlockedUserIds(
        admin,
        user.id,
      );
  } catch {
    return NextResponse.json(
      {
        error:
          "Unable to search.",
      },
      { status: 500 },
    );
  }

  const searchableBlockedIds =
    blockedUserIds.filter(
      (id) => id !== user.id,
    );

  let peopleQuery = admin
    .from("profiles")
    .select(
      "id, display_name, username, bio, avatar_path",
    )
    .eq(
      "account_status",
      "active",
    )
    .or(
      `username.ilike.${searchTerm}%,display_name.ilike.%${searchTerm}%`,
    )
    .order("username", {
      ascending: true,
    })
    .limit(limit);

  peopleQuery = excludeIds(
    peopleQuery,
    "id",
    blockedUserIds,
  );

  let postsQuery = admin
    .from("posts")
    .select(
      `
        id,
        author_id,
        content,
        created_at,
        updated_at,
        author:profiles!posts_author_id_fkey!inner (
          id,
          display_name,
          username,
          bio,
          avatar_path
        )
      `,
    )
    .eq(
      "deleted_at",
      null,
    )
    .eq(
      "author.account_status",
      "active",
    )
    .ilike(
      "content",
      `%${searchTerm}%`,
    )
    .order("created_at", {
      ascending: false,
    })
    .limit(limit);

  postsQuery = excludeIds(
    postsQuery,
    "author_id",
    searchableBlockedIds,
  );

  const {
    data: memberships,
    error:
      membershipError,
  } = await admin
    .from("conversation_members")
    .select(
      "conversation_id",
    )
    .eq(
      "user_id",
      user.id,
    )
    .is(
      "left_at",
      null,
    );

  if (membershipError) {
    console.error(
      "Failed to load Agore group memberships for search:",
      membershipError,
    );

    return NextResponse.json(
      {
        error:
          "Unable to search groups.",
      },
      { status: 500 },
    );
  }

  const groupConversationIds =
    [
      ...new Set(
        (memberships ?? []).map(
          (membership) =>
            membership.conversation_id,
        ),
      ),
    ];

  let groups: Group[] = [];

  if (
    groupConversationIds.length >
    0
  ) {
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
      .eq(
        "type",
        "group",
      )
      .in(
        "id",
        groupConversationIds,
      )
      .or(
        `name.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`,
      )
      .order(
        "updated_at",
        {
          ascending: false,
        },
      )
      .limit(limit);

    if (groupsError) {
      console.error(
        "Failed to search Agore groups:",
        groupsError,
      );

      return NextResponse.json(
        {
          error:
            "Unable to search groups.",
        },
        { status: 500 },
      );
    }

    groups =
      (groupRows ??
        []) as Group[];
  }

  const [
    {
      data: people,
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
      "Failed to search Agore people:",
      peopleError,
    );

    return NextResponse.json(
      {
        error:
          "Unable to search people.",
      },
      { status: 500 },
    );
  }

  if (postsError) {
    console.error(
      "Failed to search Agore posts:",
      postsError,
    );

    return NextResponse.json(
      {
        error:
          "Unable to search posts.",
      },
      { status: 500 },
    );
  }

  const posts =
    (
      (postRows ??
        []) as PostQueryRow[]
    ).map(
      (post) => ({
        ...post,
        author:
          post.author?.[0] ??
          null,
      }),
    );

  return NextResponse.json({
    query:
      parsedQuery.data.q,
    people:
      (people ??
        []) as Profile[],
    posts,
    groups,
  });
}