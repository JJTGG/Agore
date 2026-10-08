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
    .max(1000, "Comment content must be 1000 characters or fewer."),
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
    .select(
      "id, post_id, author_id, deleted_at",
    )
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
    console.error(
      "Failed to update Agore comment:",
      updateError,
    );

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

  const { commentId } = await context.params;

  const parsedCommentId = uuidSchema.safeParse(commentId);

  if (!parsedCommentId.success) {
    return NextResponse.json(
      { error: "Invalid comment ID." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const {
    data: existingComment,
    error: existingCommentError,
  } = await admin
    .from("comments")
    .select(
      "id, post_id, author_id, parent_comment_id, deleted_at",
    )
    .eq("id", parsedCommentId.data)
    .maybeSingle();

  if (existingCommentError) {
    console.error(
      "Failed to find Agore comment for deletion:",
      existingCommentError,
    );

    return NextResponse.json(
      { error: "Unable to delete the comment." },
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
      { error: "You can only delete your own comments." },
      { status: 403 },
    );
  }

  if (existingComment.deleted_at) {
    return new NextResponse(null, {
      status: 204,
    });
  }

  const deletedAt = new Date().toISOString();

  if (existingComment.parent_comment_id === null) {
    const { error: replyDeleteError } = await admin
      .from("comments")
      .update({
        deleted_at: deletedAt,
      })
      .eq(
        "parent_comment_id",
        parsedCommentId.data,
      )
      .is("deleted_at", null);

    if (replyDeleteError) {
      console.error(
        "Failed to delete Agore comment replies:",
        replyDeleteError,
      );

      return NextResponse.json(
        {
          error:
            "Unable to complete comment deletion.",
        },
        { status: 500 },
      );
    }
  }

  const { error: deleteError } = await admin
    .from("comments")
    .update({
      deleted_at: deletedAt,
    })
    .eq("id", parsedCommentId.data)
    .eq("author_id", user.id)
    .is("deleted_at", null);

  if (deleteError) {
    console.error(
      "Failed to delete Agore comment:",
      deleteError,
    );

    return NextResponse.json(
      { error: "Unable to delete the comment." },
      { status: 500 },
    );
  }

  return new NextResponse(null, {
    status: 204,
  });
}