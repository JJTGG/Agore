import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const createPostSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Post content is required.")
    .max(2000, "Post content must be 2000 characters or fewer."),
});

const feedQuerySchema = z.object({
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
    username
  )
`;

export async function GET(request: Request) {
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

  const { searchParams } = new URL(request.url);

  const parsedQuery = feedQuerySchema.safeParse({
    limit: searchParams.get("limit") ?? undefined,
  });

  if (!parsedQuery.success) {
    return NextResponse.json(
      { error: "Invalid feed parameters." },
      { status: 400 },
    );
  }

  const { data: posts, error: postsError } = await supabase
    .from("posts")
    .select(postSelect)
    .order("created_at", { ascending: false })
    .limit(parsedQuery.data.limit);

  if (postsError) {
    console.error("Failed to load Agore feed:", postsError);

    return NextResponse.json(
      { error: "Unable to load the feed." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    posts: posts ?? [],
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
      { error: "Authentication required." },
      { status: 401 },
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

  const parsedBody = createPostSchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json(
      {
        error: parsedBody.error.issues[0]?.message ?? "Invalid post content.",
      },
      { status: 400 },
    );
  }

  const { data: post, error: postError } = await supabase
    .from("posts")
    .insert({
      author_id: user.id,
      content: parsedBody.data.content,
    })
    .select(postSelect)
    .single();

  if (postError) {
    console.error("Failed to create Agore post:", postError);

    return NextResponse.json(
      { error: "Unable to create the post." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { post },
    { status: 201 },
  );
}