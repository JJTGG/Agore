import { NextResponse } from "next/server";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const uuidSchema = z.string().uuid();

const updateCommentSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Comment content is required.")
    .max(
      1000,
      "Comment content must be 1000 characters or fewer.",
    ),
});

type RouteContext = {
  params: Promise<{
    commentId: string;
  }>;
};

const commentSelect = `
  id,
  post_id,
  author_id,
  parent_comment_id,
  content,
  created_at,
  updated_at,
  profiles!comments_author_id_fkey!inner (
    display_name,
    username,
    avatar_path
  )
`;

async function verifyActiveAccount(userId: string) {
  const admin = createAdminClient();

  const {
    data: profile,
    error,
  } = await admin
    .from("profiles")
    .select("account_status")
    .eq("id", userId)
    .maybeSingle();

  return {
    admin,
    error,
    active: profile?.account_status === "active",
  };
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

  const account = await verifyActiveAccount(user.id);

  if (account.error) {
    console.error(
      "Failed to verify Agore comment editor account:",
      account.error,
    );

    return NextResponse.json(
      { error: "Unable to update the comment." },
      { status: 500 },
    );
  }

  if (!account.active) {
    return NextResponse.json(
      { error: "An active Agoré account is required." },
      { status: 403 },
    );
  }

  const { commentId } = await context.params;
  const parsedCommentId = uuidSchema.safeParse(commentId);

  if (!parsedCommentId.success) {
    return NextResponse.json(
      { error: "Invalid comment ID." },
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

  const parsedBody = updateCommentSchema.safeParse(body);

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

  const {
    data: existingComment,
    error: existingCommentError,
  } = await supabase
    .from("comments")
    .select("id, post_id, author_id, deleted_at")
    .eq("id", parsedCommentId.data)
    .maybeSingle();

  if (existingCommentError) {
    console.error(
      "Failed to find Agore comment for update:",
      existingCommentError,
    );

    return NextResponse.json(
      { error: "Unable to update the comment." },
      { status: 500 },
    );
  }

  if (!existingComment) {
    return NextResponse.json(
      { error: "Comment not found." },
      { status: 404 },
    );
  }

  if (existingComment.author_id !== user.id) {
    return NextResponse.json(
      { error: "You can only edit your own comments." },
      { status: 403 },
    );
  }

  if (existingComment.deleted_at) {
    return NextResponse.json(
      { error: "Deleted comments cannot be edited." },
      { status: 409 },
    );
  }

  const {
    data: comment,
    error: updateError,
  } = await supabase
    .from("comments")
    .update({
      content: parsedBody.data.content,
    })
    .eq("id", parsedCommentId.data)
    .eq("author_id", user.id)
    .is("deleted_at", null)
    .select(commentSelect)
    .maybeSingle();

  if (updateError) {
    console.error("Failed to update Agore comment:", updateError);

    return NextResponse.json(
      { error: "Unable to update the comment." },
      { status: 500 },
    );
  }

  if (!comment) {
    return NextResponse.json(
      { error: "Comment could not be updated." },
      { status: 409 },
    );
  }

  return NextResponse.json({ comment });
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

  const account = await verifyActiveAccount(user.id);

  if (account.error) {
    console.error(
      "Failed to verify Agore comment deletion account:",
      account.error,
    );

    return NextResponse.json(
      { error: "Unable to delete the comment." },
      { status: 500 },
    );
  }

  if (!account.active) {
    return NextResponse.json(
      { error: "An active Agoré account is required." },
      { status: 403 },
    );
  }

  const { commentId } = await context.params;
  const parsedCommentId = uuidSchema.safeParse(commentId);

  if (!parsedCommentId.success) {
    return NextResponse.json(
      { error: "Invalid comment ID." },
      { status: 400 },
    );
  }

  const {
    admin,
  } = account;

  const {
    data: deletion,
    error: deleteError,
  } = await admin.rpc("agore_delete_comment_tree_v0", {
    p_comment_id: parsedCommentId.data,
    p_actor_id: user.id,
  });

  if (deleteError) {
    console.error(
      "Failed to delete Agore comment tree:",
      deleteError,
    );

    return NextResponse.json(
      { error: "Unable to delete the comment." },
      { status: 500 },
    );
  }

  const result = deletion as {
    status?: string;
    postId?: string;
    deletedCommentIds?: unknown;
  } | null;

  if (result?.status === "not_found") {
    return NextResponse.json(
      { error: "Comment not found." },
      { status: 404 },
    );
  }

  if (result?.status === "forbidden") {
    return NextResponse.json(
      { error: "You can only delete your own comments." },
      { status: 403 },
    );
  }

  if (
    !result ||
    result.status !== "deleted" ||
    !result.postId
  ) {
    return NextResponse.json(
      { error: "The comment could not be deleted." },
      { status: 409 },
    );
  }

  const deletedCommentIds = Array.isArray(
    result.deletedCommentIds,
  )
    ? result.deletedCommentIds.filter(
        (id): id is string => typeof id === "string",
      )
    : [parsedCommentId.data];

  // Count only rows visible to this viewer. A count failure must not turn
  // a successful database deletion into a reported deletion failure.
  const {
    count: commentCount,
    error: countError,
  } = await supabase
    .from("comments")
    .select("id", { count: "exact", head: true })
    .eq("post_id", result.postId);

  if (countError) {
    console.error(
      "Failed to recount Agore comments after deletion:",
      countError,
    );
  }

  return NextResponse.json({
    deletedCommentIds,
    commentCount: countError ? null : commentCount ?? 0,
  });
}