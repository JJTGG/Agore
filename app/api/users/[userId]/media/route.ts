import { NextResponse } from "next/server";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const userIdSchema = z.uuid();

const querySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(50),
});

type RouteContext = {
  params: Promise<{
    userId: string;
  }>;
};

type BlockRow = {
  blocker_id: string;
  blocked_id: string;
};

type MediaProfile = {
  account_status: string;
};

type MediaPost = {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
  deleted_at: string | null;
  profiles:
    | MediaProfile[]
    | null;
};

type MediaRow = {
  id: string;
  post_id: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  sort_order: number;
  created_at: string;
  posts:
    | MediaPost[]
    | null;
};

export async function GET(
  request: Request,
  context: RouteContext,
) {
  const supabase =
    await createClient();

  const {
    data: { user },
    error: userError,
  } =
    await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      {
        error:
          "Authentication required.",
      },
      {
        status: 401,
      },
    );
  }

  const { userId } =
    await context.params;

  const parsedUserId =
    userIdSchema.safeParse(
      userId,
    );

  if (!parsedUserId.success) {
    return NextResponse.json(
      {
        error:
          "Invalid user ID.",
      },
      {
        status: 400,
      },
    );
  }

  const targetUserId =
    parsedUserId.data;

  const searchParams =
    new URL(request.url)
      .searchParams;

  const parsedQuery =
    querySchema.safeParse({
      limit:
        searchParams.get(
          "limit",
        ) ??
        undefined,
    });

  if (!parsedQuery.success) {
    return NextResponse.json(
      {
        error:
          "Invalid profile media parameters.",
      },
      {
        status: 400,
      },
    );
  }

  const admin =
    createAdminClient();

  const [
    profileResult,
    blockResult,
  ] = await Promise.all([
    admin
      .from("profiles")
      .select(
        "id, account_status",
      )
      .eq(
        "id",
        targetUserId,
      )
      .maybeSingle(),

    admin
      .from("blocks")
      .select(
        "blocker_id, blocked_id",
      )
      .or(
        `and(blocker_id.eq.${user.id},blocked_id.eq.${targetUserId}),and(blocker_id.eq.${targetUserId},blocked_id.eq.${user.id})`,
      )
      .limit(1),
  ]);

  if (
    profileResult.error ||
    blockResult.error
  ) {
    console.error(
      "Failed to load Agore profile media access state:",
      {
        profileError:
          profileResult.error,
        blockError:
          blockResult.error,
      },
    );

    return NextResponse.json(
      {
        error:
          "Unable to load profile media.",
      },
      {
        status: 500,
      },
    );
  }

  if (
    !profileResult.data ||
    profileResult.data
      .account_status !==
      "active"
  ) {
    return NextResponse.json(
      {
        error:
          "Profile not found.",
      },
      {
        status: 404,
      },
    );
  }

  const blockRelationships =
    (blockResult.data ??
      []) as BlockRow[];

  if (
    blockRelationships.some(
      (relationship) =>
        relationship.blocker_id ===
          targetUserId &&
        relationship.blocked_id ===
          user.id,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Profile not found.",
      },
      {
        status: 404,
      },
    );
  }

  if (
    blockRelationships.some(
      (relationship) =>
        relationship.blocker_id ===
          user.id &&
        relationship.blocked_id ===
          targetUserId,
    )
  ) {
    return NextResponse.json({
      media: [],
      total: 0,
    });
  }

  const {
    data: mediaRows,
    error: mediaError,
    count,
  } =
    await admin
      .from("post_media")
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
          created_at,
          posts!post_media_post_id_fkey!inner (
            id,
            author_id,
            content,
            created_at,
            deleted_at,
            profiles!posts_author_id_fkey!inner (
              account_status
            )
          )
        `,
        {
          count: "exact",
        },
      )
      .eq(
        "posts.author_id",
        targetUserId,
      )
      .is(
        "posts.deleted_at",
        null,
      )
      .eq(
        "posts.profiles.account_status",
        "active",
      )
      .order(
        "created_at",
        {
          ascending: false,
        },
      )
      .range(
        0,
        parsedQuery.data.limit - 1,
      );

  if (mediaError) {
    console.error(
      "Failed to load Agore profile media:",
      mediaError,
    );

    return NextResponse.json(
      {
        error:
          "Unable to load profile media.",
      },
      {
        status: 500,
      },
    );
  }

  const rows =
    (mediaRows ?? []) as MediaRow[];

  const posts = new Map<
    string,
    {
      id: string;
      content: string;
      created_at: string;
      post_media: Array<{
        id: string;
        storage_path: string;
        mime_type: string;
        size_bytes: number;
        width: number | null;
        height: number | null;
        sort_order: number;
        created_at: string;
      }>;
    }
  >();

  for (const row of rows) {
    const post =
      Array.isArray(row.posts)
        ? row.posts[0] ?? null
        : null;

    if (!post) {
      continue;
    }

    const profile =
      Array.isArray(
        post.profiles,
      )
        ? post.profiles[0] ?? null
        : null;

    if (
      profile?.account_status !==
      "active"
    ) {
      continue;
    }

    let entry =
      posts.get(post.id);

    if (!entry) {
      entry = {
        id: post.id,
        content:
          post.content,
        created_at:
          post.created_at,
        post_media: [],
      };

      posts.set(
        post.id,
        entry,
      );
    }

    entry.post_media.push({
      id: row.id,
      storage_path:
        row.storage_path,
      mime_type:
        row.mime_type,
      size_bytes:
        row.size_bytes,
      width:
        row.width,
      height:
        row.height,
      sort_order:
        row.sort_order,
      created_at:
        row.created_at,
    });
  }

  for (const post of posts.values()) {
    post.post_media.sort(
      (a, b) => {
        if (
          a.sort_order !==
          b.sort_order
        ) {
          return (
            a.sort_order -
            b.sort_order
          );
        }

        return (
          new Date(
            a.created_at,
          ).getTime() -
          new Date(
            b.created_at,
          ).getTime()
        );
      },
    );
  }

  return NextResponse.json({
    media: Array.from(
      posts.values(),
    ),
    total:
      count ??
      rows.length,
  });
}