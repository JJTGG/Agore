import { NextResponse } from "next/server";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
});

const postSelect = `
  id,
  author_id,
  content,
  created_at,
  updated_at,
  profiles!posts_author_id_fkey (
    display_name,
    username,
    avatar_path
  ),
  post_media (
    id,
    storage_path,
    mime_type,
    size_bytes,
    width,
    height,
    sort_order,
    created_at
  )
`;

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      userId: string;
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

  const { userId } = await params;
  const userIdResult = z.uuid().safeParse(userId);

  if (!userIdResult.success) {
    return NextResponse.json(
      { error: "Invalid user ID." },
      { status: 400 },
    );
  }

  const targetUserId = userIdResult.data;
  const { searchParams } = new URL(request.url);

  const parsedQuery = querySchema.safeParse({
    limit: searchParams.get("limit") ?? undefined,
    offset: searchParams.get("offset") ?? undefined,
  });

  if (!parsedQuery.success) {
    return NextResponse.json(
      { error: "Invalid profile post parameters." },
      { status: 400 },
    );
  }

  const { limit, offset } = parsedQuery.data;

  const {
    data: profile,
    error: profileError,
  } = await supabase
    .from("profiles")
    .select("id, account_status")
    .eq("id", targetUserId)
    .eq("account_status", "active")
    .maybeSingle();

  if (profileError) {
    console.error(
      "Failed to load Agore profile for posts:",
      profileError,
    );

    return NextResponse.json(
      { error: "Unable to load this profile." },
      { status: 500 },
    );
  }

  if (!profile) {
    return NextResponse.json(
      { error: "Profile not found." },
      { status: 404 },
    );
  }

  const admin = createAdminClient();

  const {
    data: blockingRelationship,
    error: blockError,
  } = await admin
    .from("blocks")
    .select("blocker_id, blocked_id")
    .or(
      `and(blocker_id.eq.${user.id},blocked_id.eq.${targetUserId}),and(blocker_id.eq.${targetUserId},blocked_id.eq.${user.id})`,
    )
    .limit(1);

  if (blockError) {
    console.error(
      "Failed to check Agore profile block relationship:",
      blockError,
    );

    return NextResponse.json(
      { error: "Unable to load this profile." },
      { status: 500 },
    );
  }

  if (blockingRelationship && blockingRelationship.length > 0) {
    return NextResponse.json(
      { error: "Profile not found." },
      { status: 404 },
    );
  }

  // Read the pin through the authenticated client so table RLS
  // continues to control which profile pins the viewer can see.
  const {
    data: pinRecord,
    error: pinError,
  } = await supabase
    .from("profile_pinned_posts")
    .select("post_id")
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (pinError) {
    console.error(
      "Failed to load Agore profile pin:",
      pinError,
    );

    return NextResponse.json(
      { error: "Unable to load profile posts." },
      { status: 500 },
    );
  }

  // Validate that the pinned post still belongs to this profile
  // and is not soft-deleted before moving it to the top.
  let pinnedPost = null;

  if (pinRecord?.post_id) {
    const {
      data: candidatePost,
      error: pinnedPostError,
    } = await supabase
      .from("posts")
      .select(postSelect)
      .eq("id", pinRecord.post_id)
      .eq("author_id", targetUserId)
      .is("deleted_at", null)
      .maybeSingle();

    if (pinnedPostError) {
      console.error(
        "Failed to load Agore pinned post:",
        pinnedPostError,
      );

      return NextResponse.json(
        { error: "Unable to load profile posts." },
        { status: 500 },
      );
    }

    pinnedPost = candidatePost;
  }

  const pinnedPostId = pinnedPost?.id ?? null;

  // The pin takes one displayed slot. Adjust the underlying
  // post offset after the first page so pagination remains stable.
  const databaseOffset =
    pinnedPostId && offset > 0
      ? offset - 1
      : offset;

  const remainingQuery = supabase
    .from("posts")
    .select(postSelect, { count: "exact" })
    .eq("author_id", targetUserId)
    .is("deleted_at", null);

  if (pinnedPostId) {
    remainingQuery.neq("id", pinnedPostId);
  }

  const rangeStart = databaseOffset;

  // Reserve one slot for the pin on the first page.
  // For limit=1, fetching one remaining row still gives us
  // an exact count; that row is not added to the response.
  const rangeEnd =
    pinnedPostId && offset === 0
      ? Math.max(0, limit - 2)
      : databaseOffset + limit - 1;

  const {
    data: remainingPosts,
    error: postsError,
    count,
  } = await remainingQuery
    .order("created_at", {
      ascending: false,
    })
    .range(rangeStart, rangeEnd);

  if (postsError) {
    console.error(
      "Failed to load Agore profile posts:",
      postsError,
    );

    return NextResponse.json(
      { error: "Unable to load profile posts." },
      { status: 500 },
    );
  }

  function normalizePostMedia<T extends {
    post_media?: Array<{
      sort_order: number | null;
      created_at: string;
    }> | null;
  }>(post: T) {
    return {
      ...post,
      post_media: Array.isArray(post.post_media)
        ? [...post.post_media].sort((a, b) => {
            if (a.sort_order !== b.sort_order) {
              return (
                (a.sort_order ?? 0) -
                (b.sort_order ?? 0)
              );
            }

            return (
              new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime()
            );
          })
        : [],
    };
  }

  const normalizedRemainingPosts = (
    remainingPosts ?? []
  ).map(normalizePostMedia);

  const normalizedPinnedPost = pinnedPost
    ? normalizePostMedia(pinnedPost)
    : null;

  const pagePosts =
    normalizedPinnedPost && offset === 0
      ? [
          normalizedPinnedPost,
          ...normalizedRemainingPosts.slice(
            0,
            Math.max(0, limit - 1),
          ),
        ]
      : normalizedRemainingPosts;

  const remainingTotal =
    count ?? databaseOffset + normalizedRemainingPosts.length;

  const total =
    remainingTotal + (normalizedPinnedPost ? 1 : 0);

  return NextResponse.json({
    posts: pagePosts,
    pinned_post_id: normalizedPinnedPost?.id ?? null,
    total,
    limit,
    offset,
    has_more: offset + pagePosts.length < total,
  });
}