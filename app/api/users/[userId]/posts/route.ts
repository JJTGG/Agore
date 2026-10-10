
import { NextResponse } from "next/server";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
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
  });

  if (!parsedQuery.success) {
    return NextResponse.json(
      { error: "Invalid profile post parameters." },
      { status: 400 },
    );
  }

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

  if (
    blockingRelationship &&
    blockingRelationship.length > 0
  ) {
    return NextResponse.json(
      { error: "Profile not found." },
      { status: 404 },
    );
  }

  const {
    data: posts,
    error: postsError,
  } = await supabase
    .from("posts")
    .select(postSelect)
    .eq("author_id", targetUserId)
    // Match the profile's published-post count:
    // soft-deleted posts must not appear in the feed.
    .is("deleted_at", null)
    .order("created_at", {
      ascending: false,
    })
    .limit(parsedQuery.data.limit);

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

  const normalizedPosts = (posts ?? []).map((post) => ({
    ...post,
    post_media: Array.isArray(post.post_media)
      ? [...post.post_media].sort((a, b) => {
          if (a.sort_order !== b.sort_order) {
            return a.sort_order - b.sort_order;
          }

          return (
            new Date(a.created_at).getTime() -
            new Date(b.created_at).getTime()
          );
        })
      : [],
  }));

  return NextResponse.json({
    posts: normalizedPosts,
  });
}
