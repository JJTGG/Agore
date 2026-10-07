import { NextResponse } from "next/server";
import { z } from "zod";
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
  )
`;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
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

  if (!userId) {
    return NextResponse.json(
      { error: "User ID is required." },
      { status: 400 },
    );
  }

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

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, account_status")
    .eq("id", userId)
    .eq("account_status", "active")
    .maybeSingle();

  if (profileError) {
    console.error("Failed to load Agore profile for posts:", profileError);

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

  const { data: blockingRelationship, error: blockError } = await supabase
    .from("blocks")
    .select("blocker_id, blocked_id")
    .or(
      `and(blocker_id.eq.${user.id},blocked_id.eq.${userId}),and(blocker_id.eq.${userId},blocked_id.eq.${user.id})`,
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

  const { data: posts, error: postsError } = await supabase
    .from("posts")
    .select(postSelect)
    .eq("author_id", userId)
    .order("created_at", { ascending: false })
    .limit(parsedQuery.data.limit);

  if (postsError) {
    console.error("Failed to load Agore profile posts:", postsError);

    return NextResponse.json(
      { error: "Unable to load profile posts." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    posts: posts ?? [],
  });
}