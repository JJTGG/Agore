import { NextResponse } from "next/server";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const updatePostSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Post content is required.")
    .max(
      2000,
      "Post content must be 2000 characters or fewer.",
    ),
});

const postIdSchema = z.uuid(
  "Invalid post ID.",
);

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

function sortPostMedia<
  T extends {
    sort_order: number;
    created_at: string;
  },
>(
  media: T[] | null | undefined,
) {
  return [...(media ?? [])].sort(
    (a, b) =>
      a.sort_order - b.sort_order ||
      new Date(a.created_at).getTime() -
        new Date(b.created_at).getTime(),
  );
}

export async function GET(
  request: Request,
  context: RouteContext,
) {
  const supabase =
    await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      {
        error:
          "Authentication required.",
      },
      { status: 401 },
    );
  }

  const { postId } =
    await context.params;

  const parsedPostId =
    postIdSchema.safeParse(postId);

  if (!parsedPostId.success) {
    return NextResponse.json(
      {
        error:
          "Invalid post ID.",
      },
      { status: 400 },
    );
  }

  const {
    data: post,
    error: postError,
  } = await supabase
    .from("posts")
    .select(postSelect)
    .eq(
      "id",
      parsedPostId.data,
    )
    .is("deleted_at", null)
    .maybeSingle();

  if (postError) {
    console.error(
      "Failed to load Agore post:",
      postError,
    );

    return NextResponse.json(
      {
        error:
          "Unable to load the post.",
      },
      { status: 500 },
    );
  }

  if (!post) {
    return NextResponse.json(
      {
        error:
          "Post not found.",
      },
      { status: 404 },
    );
  }

  return NextResponse.json({
    post: {
      ...post,
      post_media:
        sortPostMedia(
          post.post_media,
        ),
    },
  });
}

export async function PATCH(
  request: Request,
  context: RouteContext,
) {
  const supabase =
    await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      {
        error:
          "Authentication required.",
      },
      { status: 401 },
    );
  }

  const { postId } =
    await context.params;

  const parsedPostId =
    postIdSchema.safeParse(postId);

  if (!parsedPostId.success) {
    return NextResponse.json(
      {
        error:
          "Invalid post ID.",
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
        error:
          "Invalid JSON body.",
      },
      { status: 400 },
    );
  }

  const parsedBody =
    updatePostSchema.safeParse(
      body,
    );

  if (!parsedBody.success) {
    return NextResponse.json(
      {
        error:
          parsedBody.error.issues[0]
            ?.message ??
          "Invalid post content.",
      },
      { status: 400 },
    );
  }

  const {
    data: existingPost,
    error: existingPostError,
  } = await supabase
    .from("posts")
    .select(
      "id, author_id, deleted_at",
    )
    .eq(
      "id",
      parsedPostId.data,
    )
    .maybeSingle();

  if (existingPostError) {
    console.error(
      "Failed to find Agore post for update:",
      existingPostError,
    );

    return NextResponse.json(
      {
        error:
          "Unable to update the post.",
      },
      { status: 500 },
    );
  }

  if (!existingPost) {
    return NextResponse.json(
      {
        error:
          "Post not found.",
      },
      { status: 404 },
    );
  }

  if (
    existingPost.author_id !==
    user.id
  ) {
    return NextResponse.json(
      {
        error:
          "You can only edit your own post.",
      },
      { status: 403 },
    );
  }

  if (existingPost.deleted_at) {
    return NextResponse.json(
      {
        error:
          "Deleted posts cannot be edited.",
      },
      { status: 400 },
    );
  }

  const {
    data: post,
    error: updateError,
  } = await supabase
    .from("posts")
    .update({
      content:
        parsedBody.data.content,
      updated_at:
        new Date().toISOString(),
    })
    .eq(
      "id",
      parsedPostId.data,
    )
    .eq(
      "author_id",
      user.id,
    )
    .is(
      "deleted_at",
      null,
    )
    .select(
      `
        id,
        author_id,
        content,
        created_at,
        updated_at,
        profiles!posts_author_id_fkey (
          display_name,
          username,
          avatar_path
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
      {
        error:
          "Unable to update the post.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    post,
  });
}

export async function DELETE(
  _: Request,
  context: RouteContext,
) {
  const supabase =
    await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      {
        error:
          "Authentication required.",
      },
      { status: 401 },
    );
  }

  const { postId } =
    await context.params;

  const parsedPostId =
    postIdSchema.safeParse(postId);

  if (!parsedPostId.success) {
    return NextResponse.json(
      {
        error:
          "Invalid post ID.",
      },
      { status: 400 },
    );
  }

  const admin =
    createAdminClient();

  const {
    data: post,
    error: postError,
  } = await admin
    .from("posts")
    .select(
      "id, author_id, deleted_at",
    )
    .eq(
      "id",
      parsedPostId.data,
    )
    .maybeSingle();

  if (postError) {
    console.error(
      "Failed to load Agore post for deletion:",
      postError,
    );

    return NextResponse.json(
      {
        error:
          "Unable to delete the post.",
      },
      { status: 500 },
    );
  }

  if (!post) {
    return NextResponse.json(
      {
        error:
          "Post not found.",
      },
      { status: 404 },
    );
  }

  if (post.author_id !== user.id) {
    return NextResponse.json(
      {
        error:
          "You can only delete your own post.",
      },
      { status: 403 },
    );
  }

  if (post.deleted_at) {
    return new NextResponse(
      null,
      { status: 204 },
    );
  }

  const {
    data: mediaRows,
    error: mediaLookupError,
  } = await admin
    .from("post_media")
    .select(
      "id, storage_path",
    )
    .eq(
      "post_id",
      post.id,
    );

  if (mediaLookupError) {
    console.error(
      "Failed to load Agore post media for deletion:",
      mediaLookupError,
    );

    return NextResponse.json(
      {
        error:
          "Unable to delete the post.",
      },
      { status: 500 },
    );
  }

  const storagePaths =
    (mediaRows ?? [])
      .map(
        (media) =>
          media.storage_path,
      )
      .filter(
        (storagePath) =>
          storagePath.startsWith(
            `${post.id}/`,
          ),
      );

  const {
    data: deletedPost,
    error: deleteError,
  } =
    await admin
      .from("posts")
      .update({
        deleted_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        post.id,
      )
      .eq(
        "author_id",
        user.id,
      )
      .is(
        "deleted_at",
        null,
      )
      .select("id")
      .maybeSingle();

  if (deleteError) {
    console.error(
      "Failed to delete Agore post:",
      deleteError,
    );

    return NextResponse.json(
      {
        error:
          "Unable to delete the post.",
      },
      { status: 500 },
    );
  }

  if (!deletedPost) {
    return NextResponse.json(
      {
        error:
          "The post was already deleted or is no longer available.",
      },
      { status: 409 },
    );
  }

  if (storagePaths.length > 0) {
    const {
      error: storageError,
    } = await admin.storage
      .from("post-media")
      .remove(
        storagePaths,
      );

    if (storageError) {
      console.error(
        "Failed to clean up Agore deleted post media:",
        {
          postId: post.id,
          storagePaths,
          storageError,
        },
      );
    } else {
      const {
        error: mediaDeleteError,
      } =
        await admin
          .from("post_media")
          .delete()
          .eq(
            "post_id",
            post.id,
          );

      if (mediaDeleteError) {
        console.error(
          "Failed to remove Agore deleted post media metadata:",
          mediaDeleteError,
        );
      }
    }
  } else {
    const {
      error: mediaDeleteError,
    } =
      await admin
        .from("post_media")
        .delete()
        .eq(
          "post_id",
          post.id,
        );

    if (mediaDeleteError) {
      console.error(
        "Failed to remove Agore deleted post media metadata:",
        mediaDeleteError,
      );
    }
  }

  return new NextResponse(
    null,
    { status: 204 },
  );
}