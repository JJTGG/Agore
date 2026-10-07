import { NextResponse } from "next/server";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const userIdSchema = z.uuid();

type RouteContext = {
  params: Promise<{
    userId: string;
  }>;
};

export async function GET(
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
      {
        error: "Authentication required.",
      },
      {
        status: 401,
      },
    );
  }

  const { userId } = await context.params;

  const parsedUserId =
    userIdSchema.safeParse(userId);

  if (!parsedUserId.success) {
    return NextResponse.json(
      {
        error: "Invalid user ID.",
      },
      {
        status: 400,
      },
    );
  }

  const targetUserId =
    parsedUserId.data;

  const admin = createAdminClient();

  const {
    data: blockRelationship,
    error: blockError,
  } = await admin
    .from("blocks")
    .select(
      "blocker_id, blocked_id",
    )
    .or(
      `and(blocker_id.eq.${user.id},blocked_id.eq.${targetUserId}),and(blocker_id.eq.${targetUserId},blocked_id.eq.${user.id})`,
    )
    .limit(1)
    .maybeSingle();

  if (blockError) {
    console.error(
      "Failed to check Agore profile block relationship:",
      blockError,
    );

    return NextResponse.json(
      {
        error:
          "Unable to load the profile.",
      },
      {
        status: 500,
      },
    );
  }

  if (blockRelationship) {
    return NextResponse.json(
      {
        error: "User not found.",
      },
      {
        status: 404,
      },
    );
  }

  const {
    data: profile,
    error: profileError,
  } = await supabase
    .from("profiles")
    .select(
      `
        id,
        display_name,
        username,
        bio,
        avatar_path,
        account_status,
        created_at
      `,
    )
    .eq("id", targetUserId)
    .maybeSingle();

  if (profileError) {
    console.error(
      "Failed to load Agore profile:",
      profileError,
    );

    return NextResponse.json(
      {
        error:
          "Unable to load the profile.",
      },
      {
        status: 500,
      },
    );
  }

  if (!profile) {
    return NextResponse.json(
      {
        error: "User not found.",
      },
      {
        status: 404,
      },
    );
  }

  const [
    followersResult,
    followingResult,
    followResult,
    blockResult,
  ] = await Promise.all([
    supabase
      .from("follows")
      .select(
        "follower_id",
        {
          count: "exact",
          head: true,
        },
      )
      .eq(
        "following_id",
        targetUserId,
      ),

    supabase
      .from("follows")
      .select(
        "following_id",
        {
          count: "exact",
          head: true,
        },
      )
      .eq(
        "follower_id",
        targetUserId,
      ),

    targetUserId === user.id
      ? Promise.resolve({
          data: null,
          error: null,
        })
      : supabase
          .from("follows")
          .select(
            "follower_id",
          )
          .eq(
            "follower_id",
            user.id,
          )
          .eq(
            "following_id",
            targetUserId,
          )
          .maybeSingle(),

    targetUserId === user.id
      ? Promise.resolve({
          data: null,
          error: null,
        })
      : supabase
          .from("blocks")
          .select(
            "blocker_id",
          )
          .eq(
            "blocker_id",
            user.id,
          )
          .eq(
            "blocked_id",
            targetUserId,
          )
          .maybeSingle(),
  ]);

  if (
    followersResult.error ||
    followingResult.error ||
    followResult.error ||
    blockResult.error
  ) {
    console.error(
      "Failed to load Agore profile relationships:",
      {
        followersError:
          followersResult.error,
        followingError:
          followingResult.error,
        followError:
          followResult.error,
        blockError:
          blockResult.error,
      },
    );

    return NextResponse.json(
      {
        error:
          "Unable to load the profile relationships.",
      },
      {
        status: 500,
      },
    );
  }

  return NextResponse.json({
    profile: {
      ...profile,

      is_self:
        targetUserId === user.id,

      is_following:
        Boolean(followResult.data),

      is_blocked:
        Boolean(blockResult.data),

      follower_count:
        followersResult.count ?? 0,

      following_count:
        followingResult.count ?? 0,
    },
  });
}