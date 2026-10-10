import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const createPostSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Post content is required.")
    .max(
      2000,
      "Post content must be 2000 characters or fewer.",
    ),
});

const feedQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20),
  feed: z
    .enum(["for-you", "following", "likes"])
    .default("for-you"),
});

const postSelect = `
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
  profiles!posts_author_id_fkey (
    display_name,
    username,
    avatar_path
  )
`;

const repostSelect = `
  id,
  post_id,
  user_id,
  created_at,
  profiles!reposts_user_id_fkey (
    display_name,
    username,
    avatar_path
  )
`;

type Profile = {
  display_name: string;
  username: string;
  avatar_path: string | null;
};

type PostRow = {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  post_media: Array<{
    id: string;
    storage_path: string;
    mime_type: string;
    size_bytes: number;
    width: number | null;
    height: number | null;
    sort_order: number;
    created_at: string;
  }> | null;
  profiles: Profile | Profile[] | null;
};

type RepostRow = {
  id: string;
  post_id: string;
  user_id: string;
  created_at: string;
  profiles: Profile | Profile[] | null;
};

function normalizeProfile(
  profile: Profile | Profile[] | null,
) {
  if (!profile) {
    return null;
  }

  return Array.isArray(profile)
    ? profile[0] ?? null
    : profile;
}

function normalizePost(post: PostRow) {
  return {
    ...post,
    profiles: normalizeProfile(post.profiles),
    post_media: [...(post.post_media ?? [])].sort(
      (a, b) =>
        a.sort_order - b.sort_order ||
        new Date(a.created_at).getTime() -
          new Date(b.created_at).getTime(),
    ),
  };
}

function emptyFeed() {
  return NextResponse.json({
    posts: [],
  });
}

export async function GET(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      {
        error: "Authentication required.",
      },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);

  const parsedQuery = feedQuerySchema.safeParse({
    limit: searchParams.get("limit") ?? undefined,
    feed: searchParams.get("feed") ?? undefined,
  });

  if (!parsedQuery.success) {
    return NextResponse.json(
      {
        error: "Invalid feed parameters.",
      },
      { status: 400 },
    );
  }

  const { limit, feed } = parsedQuery.data;

  /*
   * LIKES
   *
   * Return posts the current user has liked.
   * This uses actual reaction records, not popularity.
   */
  if (feed === "likes") {
    const {
      data: reactions,
      error: reactionsError,
    } = await supabase
      .from("post_reactions")
      .select("post_id, created_at")
      .eq("user_id", user.id)
      .eq("reaction_type", "like")
      .order("created_at", {
        ascending: false,
      })
      .limit(limit);

    if (reactionsError) {
      console.error(
        "Failed to load Agore liked posts:",
        reactionsError,
      );

      return NextResponse.json(
        {
          error: "Unable to load liked posts.",
        },
        { status: 500 },
      );
    }

    if (!reactions || reactions.length === 0) {
      return emptyFeed();
    }

    const postIds = [
      ...new Set(
        reactions.map((reaction) => reaction.post_id),
      ),
    ];

    const {
      data: likedPosts,
      error: likedPostsError,
    } = await supabase
      .from("posts")
      .select(postSelect)
      .in("id", postIds)
      .is("deleted_at", null);

    if (likedPostsError) {
      console.error(
        "Failed to load Agore liked post details:",
        likedPostsError,
      );

      return NextResponse.json(
        {
          error: "Unable to load liked posts.",
        },
        { status: 500 },
      );
    }

    const postMap = new Map(
      ((likedPosts ?? []) as PostRow[]).map((post) => [
        post.id,
        normalizePost(post),
      ]),
    );

    const likedFeed = reactions
      .map((reaction) => {
        const post = postMap.get(reaction.post_id);

        if (!post) {
          return null;
        }

        return {
          ...post,
          feed_at: reaction.created_at,
          feed_context: {
            type: "original" as const,
          },
        };
      })
      .filter(
        (
          item,
        ): item is NonNullable<typeof item> =>
          item !== null,
      );

    return NextResponse.json({
      posts: likedFeed,
    });
  }

  /*
   * FOLLOWING
   *
   * Return original posts from followed accounts and
   * reposts made by followed accounts.
   */
  let followingIds: string[] = [];

  if (feed === "following") {
    const {
      data: follows,
      error: followsError,
    } = await supabase
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
          error: "Unable to load your following feed.",
        },
        { status: 500 },
      );
    }

    followingIds = [
      ...new Set(
        (follows ?? []).map(
          (follow) => follow.following_id,
        ),
      ),
    ];

    if (followingIds.length === 0) {
      return emptyFeed();
    }
  }

  /*
   * FOR YOU
   *
   * Preserve the existing mixed, time-ordered feed
   * until a separate recommendation-ranking system
   * is implemented.
   */
  const [postsResult, repostsResult] =
    feed === "following"
      ? await Promise.all([
          supabase
            .from("posts")
            .select(postSelect)
            .in("author_id", followingIds)
            .is("deleted_at", null)
            .order("created_at", {
              ascending: false,
            })
            .limit(limit),

          supabase
            .from("reposts")
            .select(repostSelect)
            .in("user_id", followingIds)
            .order("created_at", {
              ascending: false,
            })
            .limit(limit),
        ])
      : await Promise.all([
          supabase
            .from("posts")
            .select(postSelect)
            .is("deleted_at", null)
            .order("created_at", {
              ascending: false,
            })
            .limit(limit),

          supabase
            .from("reposts")
            .select(repostSelect)
            .order("created_at", {
              ascending: false,
            })
            .limit(limit),
        ]);

  if (postsResult.error) {
    console.error(
      "Failed to load Agore feed posts:",
      postsResult.error,
    );

    return NextResponse.json(
      {
        error: "Unable to load the feed.",
      },
      { status: 500 },
    );
  }

  if (repostsResult.error) {
    console.error(
      "Failed to load Agore repost activity:",
      repostsResult.error,
    );

    return NextResponse.json(
      {
        error: "Unable to load the feed activity.",
      },
      { status: 500 },
    );
  }

  const normalizedPosts = (
    (postsResult.data ?? []) as PostRow[]
  ).map(normalizePost);

  const repostRows = (
    repostsResult.data ?? []
  ) as RepostRow[];

  const repostPostIds = [
    ...new Set(
      repostRows.map((repost) => repost.post_id),
    ),
  ];

  let repostSourcePosts: PostRow[] = [];

  if (repostPostIds.length > 0) {
    const {
      data: sourcePosts,
      error: sourcePostsError,
    } = await supabase
      .from("posts")
      .select(postSelect)
      .in("id", repostPostIds)
      .is("deleted_at", null);

    if (sourcePostsError) {
      console.error(
        "Failed to load Agore repost source posts:",
        sourcePostsError,
      );

      return NextResponse.json(
        {
          error: "Unable to load reposted content.",
        },
        { status: 500 },
      );
    }

    repostSourcePosts = (sourcePosts ?? []) as PostRow[];
  }

  const sourcePostMap = new Map(
    repostSourcePosts.map((post) => [
      post.id,
      normalizePost(post),
    ]),
  );

  const feedItems = [
    ...normalizedPosts.map((post) => ({
      ...post,
      feed_at: post.created_at,
      feed_context: {
        type: "original" as const,
      },
    })),

    ...repostRows
      .map((repost) => {
        const sourcePost = sourcePostMap.get(
          repost.post_id,
        );

        if (!sourcePost) {
          return null;
        }

        return {
          ...sourcePost,
          feed_at: repost.created_at,
          feed_context: {
            type: "repost" as const,
            id: repost.id,
            user_id: repost.user_id,
            created_at: repost.created_at,
            profiles: normalizeProfile(repost.profiles),
          },
        };
      })
      .filter(
        (
          item,
        ): item is NonNullable<typeof item> =>
          item !== null,
      ),
  ]
    .sort(
      (a, b) =>
        new Date(b.feed_at).getTime() -
        new Date(a.feed_at).getTime(),
    )
    .slice(0, limit);

  return NextResponse.json({
    posts: feedItems,
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      {
        error: "Authentication required.",
      },
      { status: 401 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: "Invalid JSON body.",
      },
      { status: 400 },
    );
  }

  const parsedBody = createPostSchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json(
      {
        error:
          parsedBody.error.issues[0]?.message ??
          "Invalid post content.",
      },
      { status: 400 },
    );
  }

  const {
    data: post,
    error: postError,
  } = await supabase
    .from("posts")
    .insert({
      author_id: user.id,
      content: parsedBody.data.content,
    })
    .select(postSelect)
    .single();

  if (postError) {
    console.error(
      "Failed to create Agore post:",
      postError,
    );

    return NextResponse.json(
      {
        error: "Unable to create the post.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      post: normalizePost(post as PostRow),
    },
    { status: 201 },
  );
}