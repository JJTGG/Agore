import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const userIdSchema = z.uuid();

const pinRequestSchema = z.object({
  postId: z.uuid(),
});

type RouteContext = {
  params: Promise<{
    userId: string;
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

async function getTargetUserId(context: RouteContext) {
  const { userId } = await context.params;
  return userIdSchema.safeParse(userId);
}

export async function POST(
  request: Request,
  context: RouteContext,
) {
  const { supabase, user } =
    await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const parsedUserId = await getTargetUserId(context);

  if (!parsedUserId.success) {
    return NextResponse.json(
      { error: "Invalid user ID." },
      { status: 400 },
    );
  }

  if (parsedUserId.data !== user.id) {
    return NextResponse.json(
      { error: "You can only pin posts to your own profile." },
      { status: 403 },
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

  const parsedBody = pinRequestSchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "A valid post ID is required." },
      { status: 400 },
    );
  }

  const {
    data: profile,
    error: profileError,
  } = await supabase
    .from("profiles")
    .select("id, account_status")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error(
      "Failed to verify Agore profile for pinning:",
      profileError,
    );

    return NextResponse.json(
      { error: "Unable to verify your profile." },
      { status: 500 },
    );
  }

  if (!profile || profile.account_status !== "active") {
    return NextResponse.json(
      { error: "An active profile is required to pin a post." },
      { status: 403 },
    );
  }

  const {
    data: post,
    error: postError,
  } = await supabase
    .from("posts")
    .select("id")
    .eq("id", parsedBody.data.postId)
    .eq("author_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (postError) {
    console.error(
      "Failed to verify Agore post for pinning:",
      postError,
    );

    return NextResponse.json(
      { error: "Unable to verify the post." },
      { status: 500 },
    );
  }

  if (!post) {
    return NextResponse.json(
      { error: "You can only pin your own existing post." },
      { status: 404 },
    );
  }

  const {
    data: pin,
    error: pinError,
  } = await supabase
    .from("profile_pinned_posts")
    .upsert(
      {
        user_id: user.id,
        post_id: post.id,
        pinned_at: new Date().toISOString(),
      },
      {
        onConflict: "user_id",
      },
    )
    .select("user_id, post_id, pinned_at")
    .single();

  if (pinError) {
    console.error(
      "Failed to pin Agore profile post:",
      pinError,
    );

    return NextResponse.json(
      { error: "Unable to pin this post." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    pinned_post_id: pin.post_id,
    pin,
  });
}

export async function DELETE(
  _: Request,
  context: RouteContext,
) {
  const { supabase, user } =
    await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const parsedUserId = await getTargetUserId(context);

  if (!parsedUserId.success) {
    return NextResponse.json(
      { error: "Invalid user ID." },
      { status: 400 },
    );
  }

  if (parsedUserId.data !== user.id) {
    return NextResponse.json(
      { error: "You can only unpin posts from your own profile." },
      { status: 403 },
    );
  }

  const {
    error: deleteError,
  } = await supabase
    .from("profile_pinned_posts")
    .delete()
    .eq("user_id", user.id);

  if (deleteError) {
    console.error(
      "Failed to unpin Agore profile post:",
      deleteError,
    );

    return NextResponse.json(
      { error: "Unable to unpin this post." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    pinned_post_id: null,
  });
}