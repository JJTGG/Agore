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

  const admin =
    createAdminClient();

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
    .limit(1);

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

  const targetBlockedViewer =
    (
      blockRelationship ??
      []
    ).some(
      (relationship) =>
        relationship.blocker_id ===
          targetUserId &&
        relationship.blocked_id ===
          user.id,
    );

  const viewerBlockedTarget =
    (
      blockRelationship ??
      []
    ).some(
      (relationship) =>
        relationship.blocker_id ===
          user.id &&
        relationship.blocked_id ===
          targetUserId,
    );

  if (targetBlockedViewer) {
    return NextResponse.json(
      {
        error:
          "User not found.",
      },
      {
        status: 404,
      },
    );
  }

  const {
    data: profile,
    error: profileError,
  } =
    await supabase
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
      .eq(
        "id",
        targetUserId,
      )
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

  if (
    !profile ||
    profile.account_status !==
      "active"
  ) {
    return NextResponse.json(
      {
        error:
          "User not found.",
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

    targetUserId ===
    user.id
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
  ]);

  if (
    followersResult.error ||
    followingResult.error ||
    followResult.error
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
        targetUserId ===
        user.id,

      is_following:
        Boolean(
          followResult.data,
        ),

      is_blocked:
        viewerBlockedTarget,

      follower_count:
        followersResult.count ??
        0,

      following_count:
        followingResult.count ??
        0,
    },
  });
}