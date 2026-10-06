import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const createCommentSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Comment content is required.")
    .max(1000, "Comment content must be 1000 characters or fewer."),
  parentCommentId: z.string().uuid().nullable().optional(),
});

const listCommentsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

type RouteContext = {
  params: Promise<{
    postId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
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

  const { searchParams } = new URL(request.url);

  const parsedQuery = listCommentsSchema.safeParse({
    limit: searchParams.get("limit") ?? undefined,
  });

  if (!parsedQuery.success) {
    return NextResponse.json(
      { error: "Invalid comments parameters." },
      { status: 400 },
    );
  }

  const { data: post, error: postError } = await supabase
    .from("posts")
    .select("id")
    .eq("id", postId)
    .maybeSingle();

  if (postError) {
    console.error("Failed to verify Agore post for comments:", postError);

    return NextResponse.json(
      { error: "Unable to load comments." },
      { status: 500 },
    );
  }

  if (!post) {
    return NextResponse.json(
      { error: "Post not found." },
      { status: 404 },
    );
  }

  const { data: comments, error: commentsError } = await supabase
    .from("comments")
    .select(
      `
        id,
        post_id,
        author_id,
        parent_comment_id,
        content,
        created_at,
        updated_at,
        profiles (
          display_name,
          username
        )
      `,
    )
    .eq("post_id", postId)
    .order("created_at", { ascending: true })
    .limit(parsedQuery.data.limit);

  if (commentsError) {
    console.error("Failed to load Agore comments:", commentsError);

    return NextResponse.json(
      { error: "Unable to load comments." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    comments: comments ?? [],
  });
}

export async function POST(request: Request, context: RouteContext) {
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
    console.error("Failed to verify Agore post for comment:", postError);

    return NextResponse.json(
      { error: "Unable to create the comment." },
      { status: 500 },
    );
  }

  if (!post) {
    return NextResponse.json(
      { error: "Post not found." },
      { status: 404 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const parsedBody = createCommentSchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json(
      {
        error:
          parsedBody.error.issues[0]?.message ??
          "Invalid comment content.",
      },
      { status: 400 },
    );
  }

  const parentCommentId =
    parsedBody.data.parentCommentId ?? null;

  if (parentCommentId) {
    const { data: parentComment, error: parentError } = await supabase
      .from("comments")
      .select("id, post_id")
      .eq("id", parentCommentId)
      .maybeSingle();

    if (parentError) {
      console.error(
        "Failed to verify Agore parent comment:",
        parentError,
      );

      return NextResponse.json(
        { error: "Unable to verify the parent comment." },
        { status: 500 },
      );
    }

    if (!parentComment || parentComment.post_id !== postId) {
      return NextResponse.json(
        { error: "Parent comment not found for this post." },
        { status: 400 },
      );
    }
  }

  const { data: comment, error: commentError } = await supabase
    .from("comments")
    .insert({
      post_id: postId,
      author_id: user.id,
      parent_comment_id: parentCommentId,
      content: parsedBody.data.content,
    })
    .select(
      `
        id,
        post_id,
        author_id,
        parent_comment_id,
        content,
        created_at,
        updated_at,
        profiles (
          display_name,
          username
        )
      `,
    )
    .single();

  if (commentError) {
    console.error("Failed to create Agore comment:", commentError);

    return NextResponse.json(
      { error: "Unable to create the comment." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { comment },
    { status: 201 },
  );
}