import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{
    postId: string;
  }>;
};

export async function POST(_: Request, context: RouteContext) {
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

  const { postId } = await context.params;

  if (!postId) {
    return NextResponse.json(
      { error: "Post ID is required." },
      { status: 400 },
    );
  }

  const { data: post, error: postError } = await supabase
    .from("posts")
    .select("id")
    .eq("id", postId)
    .maybeSingle();

  if (postError) {
    console.error("Failed to verify Agore post for repost:", postError);

    return NextResponse.json(
      { error: "Unable to verify the post." },
      { status: 500 },
    );
  }

  if (!post) {
    return NextResponse.json(
      { error: "Post not found." },
      { status: 404 },
    );
  }

  const { data: repost, error: repostError } = await supabase
    .from("reposts")
    .upsert(
      {
        post_id: postId,
        user_id: user.id,
      },
      {
        onConflict: "post_id,user_id",
        ignoreDuplicates: true,
      },
    )
    .select("id, post_id, user_id, created_at")
    .maybeSingle();

  if (repostError) {
    console.error("Failed to create Agore repost:", repostError);

    return NextResponse.json(
      { error: "Unable to repost the post." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    reposted: true,
    repost: repost ?? null,
  });
}

export async function DELETE(_: Request, context: RouteContext) {
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

  const { postId } = await context.params;

  if (!postId) {
    return NextResponse.json(
      { error: "Post ID is required." },
      { status: 400 },
    );
  }

  const { error: deleteError } = await supabase
    .from("reposts")
    .delete()
    .eq("post_id", postId)
    .eq("user_id", user.id);

  if (deleteError) {
    console.error("Failed to remove Agore repost:", deleteError);

    return NextResponse.json(
      { error: "Unable to undo the repost." },
      { status: 500 },
    );
  }

  return new NextResponse(null, { status: 204 });
}