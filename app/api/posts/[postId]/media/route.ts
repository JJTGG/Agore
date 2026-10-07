import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const MAX_MEDIA_PER_POST = 10;
const MAX_MEDIA_SIZE = 15 * 1024 * 1024;

const mediaItemSchema = z.object({
  storage_path: z
    .string()
    .trim()
    .min(1, "Storage path is required.")
    .max(500),
  mime_type: z
    .string()
    .trim()
    .min(1, "MIME type is required.")
    .max(255),
  size_bytes: z
    .number()
    .int()
    .positive()
    .max(
      MAX_MEDIA_SIZE,
      "Media files must be 15 MB or smaller.",
    ),
  width: z
    .number()
    .int()
    .positive()
    .nullable()
    .optional(),
  height: z
    .number()
    .int()
    .positive()
    .nullable()
    .optional(),
  sort_order: z
    .number()
    .int()
    .min(0)
    .max(MAX_MEDIA_PER_POST - 1),
});

const addMediaSchema = z.object({
  media: z
    .array(mediaItemSchema)
    .min(1, "At least one media item is required.")
    .max(
      MAX_MEDIA_PER_POST,
      `A post can contain up to ${MAX_MEDIA_PER_POST} media items.`,
    ),
});

type RouteContext = {
  params: Promise<{
    postId: string;
  }>;
};

export async function POST(
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
      {
        error: "Authentication required.",
      },
      { status: 401 },
    );
  }

  const { postId } = await context.params;

  const parsedPostId = z.uuid().safeParse(postId);

  if (!parsedPostId.success) {
    return NextResponse.json(
      {
        error: "Invalid post ID.",
      },
      { status: 400 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: "Invalid JSON body.",
      },
      { status: 400 },
    );
  }

  const parsedBody = addMediaSchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json(
      {
        error:
          parsedBody.error.issues[0]?.message ??
          "Invalid media payload.",
      },
      { status: 400 },
    );
  }

  const { data: post, error: postError } =
    await supabase
      .from("posts")
      .select("id, author_id, deleted_at")
      .eq("id", parsedPostId.data)
      .maybeSingle();

  if (postError) {
    console.error(
      "Failed to load Agore post for media:",
      postError,
    );

    return NextResponse.json(
      {
        error:
          "Unable to attach media to the post.",
      },
      { status: 500 },
    );
  }

  if (!post) {
    return NextResponse.json(
      {
        error: "Post not found.",
      },
      { status: 404 },
    );
  }

  if (post.author_id !== user.id) {
    return NextResponse.json(
      {
        error:
          "You can only attach media to your own post.",
      },
      { status: 403 },
    );
  }

  if (post.deleted_at) {
    return NextResponse.json(
      {
        error:
          "Deleted posts cannot receive media.",
      },
      { status: 400 },
    );
  }

  const { count: existingCount, error: countError } =
    await supabase
      .from("post_media")
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq("post_id", post.id);

  if (countError) {
    console.error(
      "Failed to count Agore post media:",
      countError,
    );

    return NextResponse.json(
      {
        error:
          "Unable to attach media to the post.",
      },
      { status: 500 },
    );
  }

  if (
    (existingCount ?? 0) +
      parsedBody.data.media.length >
    MAX_MEDIA_PER_POST
  ) {
    return NextResponse.json(
      {
        error: `A post can contain up to ${MAX_MEDIA_PER_POST} media items.`,
      },
      { status: 400 },
    );
  }

  const duplicateSortOrders =
    new Set<number>();

  for (const item of parsedBody.data.media) {
    if (
      duplicateSortOrders.has(item.sort_order)
    ) {
      return NextResponse.json(
        {
          error:
            "Each media item must have a unique sort order.",
        },
        { status: 400 },
      );
    }

    duplicateSortOrders.add(item.sort_order);

    if (
      !item.storage_path.startsWith(
        `${post.id}/`,
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid media storage path.",
        },
        { status: 400 },
      );
    }
  }

  const rows = parsedBody.data.media.map(
    (item) => ({
      post_id: post.id,
      storage_path: item.storage_path,
      mime_type: item.mime_type,
      size_bytes: item.size_bytes,
      width: item.width ?? null,
      height: item.height ?? null,
      sort_order: item.sort_order,
    }),
  );

  const {
    data: media,
    error: mediaError,
  } = await supabase
    .from("post_media")
    .insert(rows)
    .select(
      `
        id,
        post_id,
        storage_path,
        mime_type,
        size_bytes,
        width,
        height,
        sort_order,
        created_at
      `,
    )
    .order("sort_order", {
      ascending: true,
    });

  if (mediaError) {
    console.error(
      "Failed to attach Agore post media:",
      mediaError,
    );

    return NextResponse.json(
      {
        error:
          "Unable to attach media to the post.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      media: media ?? [],
    },
    { status: 201 },
  );
}