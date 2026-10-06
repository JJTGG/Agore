import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const reactionSchema = z.object({
  reactionType: z.enum([
    "like",
    "love",
    "laugh",
    "care",
    "wow",
    "sad",
    "angry",
  ]),
});

type RouteContext = {
  params: Promise<{
    postId: string;
  }>;
};

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

async function getVisiblePost(
  supabase: Awaited<ReturnType<typeof createClient>>,
  postId: string,
) {
  const { data: post, error } = await supabase
    .from("posts")
    .select("id")
    .eq("id", postId)
    .maybeSingle();

  if (error) {
    console.error("Failed to verify Agore post for reaction:", error);
    return {
      post: null,
      error,
    };
  }

  return {
    post,
    error: null,
  };
}

export async function POST(request: Request, context: RouteContext) {
  const { supabase, user } = await getAuthenticatedUser();

  if (!user) {
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

  const { post, error: postError } = await getVisiblePost(
    supabase,
    postId,
  );

  if (postError) {
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

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const parsedBody = reactionSchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json(
      {
        error:
          parsedBody.error.issues[0]?.message ??
          "Invalid reaction type.",
      },
      { status: 400 },
    );
  }

  const { data: reaction, error: reactionError } = await supabase
    .from("post_reactions")
    .upsert(
      {
        post_id: postId,
        user_id: user.id,
        reaction_type: parsedBody.data.reactionType,
      },
      {
        onConflict: "post_id,user_id",
      },
    )
    .select("post_id, user_id, reaction_type, created_at")
    .single();

  if (reactionError) {
    console.error("Failed to save Agore post reaction:", reactionError);

    return NextResponse.json(
      { error: "Unable to save the reaction." },
      { status: 500 },
    );
  }

  return NextResponse.json({ reaction });
}

export async function DELETE(_: Request, context: RouteContext) {
  const { supabase, user } = await getAuthenticatedUser();

  if (!user) {
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
    .from("post_reactions")
    .delete()
    .eq("post_id", postId)
    .eq("user_id", user.id);

  if (deleteError) {
    console.error("Failed to remove Agore post reaction:", deleteError);

    return NextResponse.json(
      { error: "Unable to remove the reaction." },
      { status: 500 },
    );
  }

  return new NextResponse(null, { status: 204 });
}