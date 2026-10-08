import { NextResponse } from "next/server";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const userIdSchema = z.uuid();

const relationshipSelect =
  "follower_id, following_id, created_at";

type RouteContext = {
  params: Promise<{
    userId: string;
  }>;
};

type FollowRow = {
  follower_id: string;
  following_id: string;
  created_at: string;
};

type ProfileRow = {
  id: string;
  display_name: string;
  username: string;
  avatar_path: string | null;
  account_status: string;
};

type BlockRow = {
  blocker_id: string;
  blocked_id: string;
};

function getCounterpartyId(
  row: FollowRow,
  direction: "followers" | "following",
) {
  return direction === "followers"
    ? row.follower_id
    : row.following_id;
}

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

export async function GET(
  _: Request,
  context: RouteContext,
) {
  const { user } =
    await getAuthenticatedUser();

  if (!user) {
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

  const [
    profileResult,
    blockResult,
    followersResult,
    followingResult,
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

    admin
      .from("follows")
      .select(
        relationshipSelect,
      )
      .eq(
        "following_id",
        targetUserId,
      )
      .order(
        "created_at",
        {
          ascending: false,
        },
      )
      .limit(200),

    admin
      .from("follows")
      .select(
        relationshipSelect,
      )
      .eq(
        "follower_id",
        targetUserId,
      )
      .order(
        "created_at",
        {
          ascending: false,
        },
      )
      .limit(200),
  ]);

  if (
    profileResult.error ||
    blockResult.error ||
    followersResult.error ||
    followingResult.error
  ) {
    console.error(
      "Failed to load Agore profile connections:",
      {
        profileError:
          profileResult.error,
        blockError:
          blockResult.error,
        followersError:
          followersResult.error,
        followingError:
          followingResult.error,
      },
    );

    return NextResponse.json(
      {
        error:
          "Unable to load profile connections.",
      },
      {
        status: 500,
      },
    );
  }

  const profile =
    profileResult.data;

  if (
    !profile ||
    profile.account_status !==
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

  const targetBlockedViewer =
    blockRelationships.some(
      (relationship) =>
        relationship.blocker_id ===
          targetUserId &&
        relationship.blocked_id ===
          user.id,
    );

  const viewerBlockedTarget =
    blockRelationships.some(
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
          "Profile not found.",
      },
      {
        status: 404,
      },
    );
  }

  if (viewerBlockedTarget) {
    return NextResponse.json({
      blocked: true,
      followers: [],
      following: [],
    });
  }

  const followers =
    (followersResult.data ??
      []) as FollowRow[];

  const following =
    (followingResult.data ??
      []) as FollowRow[];

  const connectionIds = [
    ...new Set([
      ...followers.map(
        (row) =>
          row.follower_id,
      ),
      ...following.map(
        (row) =>
          row.following_id,
      ),
    ]),
  ];

  if (
    connectionIds.length === 0
  ) {
    return NextResponse.json({
      blocked: false,
      followers: [],
      following: [],
    });
  }

  const [
    profilesResult,
    viewerBlocksResult,
  ] = await Promise.all([
    admin
      .from("profiles")
      .select(
        "id, display_name, username, avatar_path, account_status",
      )
      .in(
        "id",
        connectionIds,
      )
      .eq(
        "account_status",
        "active",
      ),

    admin
      .from("blocks")
      .select(
        "blocker_id, blocked_id",
      )
      .or(
        `blocker_id.eq.${user.id},blocked_id.eq.${user.id}`,
      ),
  ]);

  if (
    profilesResult.error ||
    viewerBlocksResult.error
  ) {
    console.error(
      "Failed to resolve Agore visible profile connections:",
      {
        profilesError:
          profilesResult.error,
        viewerBlocksError:
          viewerBlocksResult.error,
      },
    );

    return NextResponse.json(
      {
        error:
          "Unable to load profile connections.",
      },
      {
        status: 500,
      },
    );
  }

  const profiles =
    (profilesResult.data ??
      []) as ProfileRow[];

  const viewerBlockRows =
    (viewerBlocksResult.data ??
      []) as BlockRow[];

  const blockedConnectionIds =
    new Set(
      viewerBlockRows.map(
        (relationship) =>
          relationship.blocker_id ===
          user.id
            ? relationship.blocked_id
            : relationship.blocker_id,
      ),
    );

  const profileMap =
    new Map(
      profiles.map(
        (connection) => [
          connection.id,
          connection,
        ],
      ),
    );

  function normalizeConnections(
    rows: FollowRow[],
    direction:
      | "followers"
      | "following",
  ) {
    return rows
      .map((row) => {
        const connectionId =
          getCounterpartyId(
            row,
            direction,
          );

        const connection =
          profileMap.get(
            connectionId,
          );

        if (
          !connection ||
          blockedConnectionIds.has(
            connectionId,
          )
        ) {
          return null;
        }

        return {
          id: connection.id,
          display_name:
            connection.display_name,
          username:
            connection.username,
          avatar_path:
            connection.avatar_path,
          created_at:
            row.created_at,
        };
      })
      .filter(
        (
          connection,
        ): connection is NonNullable<
          typeof connection
        > =>
          connection !==
          null,
      )
      .slice(0, 100);
  }

  return NextResponse.json({
    blocked: false,
    followers:
      normalizeConnections(
        followers,
        "followers",
      ),
    following:
      normalizeConnections(
        following,
        "following",
      ),
  });
}