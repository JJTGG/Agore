import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const updatePostSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Post content is required.")
    .max(2000, "Post content must be 2000 characters or fewer."),
});

const postIdSchema = z.uuid("Invalid post ID.");

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

  const parsedPostId = postIdSchema.safeParse(postId);

  if (!parsedPostId.success) {
    return NextResponse.json(
      { error: "Invalid post ID." },
      { status: 400 },
    );
  }

  const { data: post, error: postError } = await supabase
    .from("posts")
    .select(postSelect)
    .eq("id", parsedPostId.data)
    .is("deleted_at", null)
    .maybeSingle();

  if (postError) {
    console.error(
      "Failed to load Agore post:",
      postError,
    );

    return NextResponse.json(
      { error: "Unable to load the post." },
      { status: 500 },
    );
  }

  if (!post) {
    return NextResponse.json(
      { error: "Post not found." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    post: {
      ...post,
      post_media: [...(post.post_media ?? [])].sort(
        (a, b) =>
          a.sort_order - b.sort_order ||
          new Date(a.created_at).getTime() -
            new Date(b.created_at).getTime(),
      ),
    },
  });
}

export async function PATCH(
  request: Request,
  context: RouteContext,
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

  const { postId } = await context.params;

  const parsedPostId = postIdSchema.safeParse(postId);

  if (!parsedPostId.success) {
    return NextResponse.json(
      { error: "Invalid post ID." },
      { status: 400 },
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

  const parsedBody = updatePostSchema.safeParse(body);

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

  const { data: existingPost, error: existingPostError } =
    await supabase
      .from("posts")
      .select("id")
      .eq("id", parsedPostId.data)
      .maybeSingle();

  if (existingPostError) {
    console.error(
      "Failed to find Agore post for update:",
      existingPostError,
    );

    return NextResponse.json(
      { error: "Unable to update the post." },
      { status: 500 },
    );
  }

  if (!existingPost) {
    return NextResponse.json(
      { error: "Post not found." },
      { status: 404 },
    );
  }

  const { data: post, error: updateError } = await supabase
    .from("posts")
    .update({
      content: parsedBody.data.content,
    })
    .eq("id", parsedPostId.data)
    .select(
      `
        id,
        author_id,
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

  if (updateError) {
    console.error(
      "Failed to update Agore post:",
      updateError,
    );

    return NextResponse.json(
      { error: "Unable to update the post." },
      { status: 500 },
    );
  }

  return NextResponse.json({ post });
}

export async function DELETE(
  _: Request,
  context: RouteContext,
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

  const { postId } = await context.params;

  const parsedPostId = postIdSchema.safeParse(postId);

  if (!parsedPostId.success) {
    return NextResponse.json(
      { error: "Invalid post ID." },
      { status: 400 },
    );
  }

  const { data: existingPost, error: existingPostError } =
    await supabase
      .from("posts")
      .select("id")
      .eq("id", parsedPostId.data)
      .maybeSingle();

  if (existingPostError) {
    console.error(
      "Failed to find Agore post for deletion:",
      existingPostError,
    );

    return NextResponse.json(
      { error: "Unable to delete the post." },
      { status: 500 },
    );
  }

  if (!existingPost) {
    return NextResponse.json(
      { error: "Post not found." },
      { status: 404 },
    );
  }

  const { error: deleteError } = await supabase
    .from("posts")
    .update({
      deleted_at: new Date().toISOString(),
    })
    .eq("id", parsedPostId.data)
    .is("deleted_at", null);

  if (deleteError) {
    console.error(
      "Failed to delete Agore post:",
      deleteError,
    );

    return NextResponse.json(
      { error: "Unable to delete the post." },
      { status: 500 },
    );
  }

  return new NextResponse(null, { status: 204 });
}