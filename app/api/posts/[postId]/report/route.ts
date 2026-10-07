import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const reportSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1)
    .max(100),
  details: z
    .string()
    .trim()
    .max(2000)
    .nullable()
    .optional(),
});

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ postId: string }>;
  },
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

  const { postId } = await params;

  const parsedPostId = z.uuid().safeParse(postId);

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
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  const parsedBody = reportSchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json(
      {
        error:
          "A valid report reason is required.",
      },
      { status: 400 },
    );
  }

  const { reason, details = null } =
    parsedBody.data;

  const { data: post, error: postError } =
    await supabase
      .from("posts")
      .select("id, author_id, deleted_at")
      .eq("id", parsedPostId.data)
      .maybeSingle();

  if (postError) {
    console.error(
      "Failed to load Agore post for report:",
      postError,
    );

    return NextResponse.json(
      { error: "Unable to report this post." },
      { status: 500 },
    );
  }

  if (!post || post.deleted_at) {
    return NextResponse.json(
      { error: "Post not found." },
      { status: 404 },
    );
  }

  if (post.author_id === user.id) {
    return NextResponse.json(
      { error: "You cannot report your own post." },
      { status: 400 },
    );
  }

  const {
    data: existingReport,
    error: existingReportError,
  } = await supabase
    .from("reports")
    .select("id")
    .eq("reporter_id", user.id)
    .eq("target_type", "post")
    .eq("target_id", post.id)
    .in("status", [
      "pending",
      "reviewed",
      "actioned",
    ])
    .limit(1)
    .maybeSingle();

  if (existingReportError) {
    console.error(
      "Failed to check existing Agore post report:",
      existingReportError,
    );

    return NextResponse.json(
      { error: "Unable to report this post." },
      { status: 500 },
    );
  }

  if (existingReport) {
    return NextResponse.json(
      {
        error:
          "You have already reported this post.",
      },
      { status: 409 },
    );
  }

  const { data: report, error: reportError } =
    await supabase
      .from("reports")
      .insert({
        reporter_id: user.id,
        target_type: "post",
        target_id: post.id,
        reason,
        details,
      })
      .select(
        "id, target_type, target_id, reason, status, created_at",
      )
      .single();

  if (reportError) {
    console.error(
      "Failed to create Agore post report:",
      reportError,
    );

    return NextResponse.json(
      { error: "Unable to submit the report." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { report },
    { status: 201 },
  );
}