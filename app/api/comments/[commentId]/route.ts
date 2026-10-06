import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

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

export async function PATCH(request: Request, context: RouteContext) {
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

  if (!commentId) {
    return NextResponse.json(
      { error: "Comment ID is required." },
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

  const { data: existingComment, error: existingCommentError } =
    await supabase
      .from("comments")
      .select("id")
      .eq("id", commentId)
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

  const { data: comment, error: updateError } = await supabase
    .from("comments")
    .update({
      content: parsedBody.data.content,
    })
    .eq("id", commentId)
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

  if (updateError) {
    console.error("Failed to update Agore comment:", updateError);

    return NextResponse.json(
      { error: "Unable to update the comment." },
      { status: 500 },
    );
  }

  return NextResponse.json({ comment });
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

  const { commentId } = await context.params;

  if (!commentId) {
    return NextResponse.json(
      { error: "Comment ID is required." },
      { status: 400 },
    );
  }

  const { data: existingComment, error: existingCommentError } =
    await supabase
      .from("comments")
      .select("id")
      .eq("id", commentId)
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

  const { error: deleteError } = await supabase
    .from("comments")
    .update({
      deleted_at: new Date().toISOString(),
    })
    .eq("id", commentId)
    .is("deleted_at", null);

  if (deleteError) {
    console.error("Failed to delete Agore comment:", deleteError);

    return NextResponse.json(
      { error: "Unable to delete the comment." },
      { status: 500 },
    );
  }

  return new NextResponse(null, { status: 204 });
}