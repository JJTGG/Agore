
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

type BlockRow = {
  blocker_id: string;
  blocked_id: string;
};

type ConnectionFollowRow = {
  follower_id?: string;
  following_id?: string;
};

type VerificationGrant = {
  verification_kind: "agore_official" | "official" | "paid";
  verified_at: string;
  expires_at: string | null;
  revoked_at: string | null;
};

type ActiveVerificationKind = "agore_official" | "paid" | null;

function getBlockedConnectionIds(
  rows: BlockRow[],
  viewerId: string,
) {
  return new Set(
    rows.map((relationship) =>
      relationship.blocker_id === viewerId
        ? relationship.blocked_id
        : relationship.blocker_id,
    ),
  );
}

function countVisibleConnections(
  rows: ConnectionFollowRow[],
  blockedConnectionIds: Set<string>,
  activeConnectionIds: Set<string>,
  direction: "followers" | "following",
) {
  const ids = new Set<string>();

  for (const row of rows) {
    const connectionId =
      direction === "followers"
        ? row.follower_id
        : row.following_id;

    if (
      !connectionId ||
      blockedConnectionIds.has(connectionId) ||
      !activeConnectionIds.has(connectionId)
    ) {
      continue;
    }

    ids.add(connectionId);
  }

  return ids.size;
}

function getActiveVerificationKind(
  grant: VerificationGrant | null,
): ActiveVerificationKind {
  if (!grant || grant.revoked_at !== null) {
    return null;
  }

  if (
    (grant.verification_kind === "agore_official" ||
      grant.verification_kind === "official") &&
    grant.expires_at === null
  ) {
    return "agore_official";
  }

  if (
    grant.verification_kind === "paid" &&
    grant.expires_at !== null
  ) {
    const expiresAt = Date.parse(grant.expires_at);

    if (
      Number.isFinite(expiresAt) &&
      expiresAt > Date.now()
    ) {
      return "paid";
    }
  }

  return null;
}

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
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const { userId } = await context.params;
  const parsedUserId = userIdSchema.safeParse(userId);

  if (!parsedUserId.success) {
    return NextResponse.json(
      { error: "Invalid user ID." },
      { status: 400 },
    );
  }

  const targetUserId = parsedUserId.data;
  const admin = createAdminClient();

  const [
    blockResult,
    followersResult,
    followingResult,
  ] = await Promise.all([
    admin
      .from("blocks")
      .select("blocker_id, blocked_id")
      .or(
        `blocker_id.eq.${user.id},blocked_id.eq.${user.id}`,
      ),

    admin
      .from("follows")
      .select("follower_id")
      .eq("following_id", targetUserId),

    admin
      .from("follows")
      .select("following_id")
      .eq("follower_id", targetUserId),
  ]);

  if (
    blockResult.error ||
    followersResult.error ||
    followingResult.error
  ) {
    console.error(
      "Failed to load Agore profile relationships:",
      {
        blockError: blockResult.error,
        followersError: followersResult.error,
        followingError: followingResult.error,
      },
    );

    return NextResponse.json(
      { error: "Unable to load the profile relationships." },
      { status: 500 },
    );
  }

  const blockRelationships =
    (blockResult.data ?? []) as BlockRow[];

  const targetBlockedViewer =
    blockRelationships.some(
      (relationship) =>
        relationship.blocker_id === targetUserId &&
        relationship.blocked_id === user.id,
    );

  const viewerBlockedTarget =
    blockRelationships.some(
      (relationship) =>
        relationship.blocker_id === user.id &&
        relationship.blocked_id === targetUserId,
    );

  if (targetBlockedViewer) {
    return NextResponse.json(
      { error: "User not found." },
      { status: 404 },
    );
  }

  const {
    data: profile,
    error: profileError,
  } = await supabase
    .from("profiles")
    .select(`
      id,
      display_name,
      username,
      bio,
      avatar_path,
      location,
      profile_links,
      account_type,
      account_status,
      created_at
    `)
    .eq("id", targetUserId)
    .maybeSingle();

  if (profileError) {
    console.error(
      "Failed to load Agore profile:",
      profileError,
    );

    return NextResponse.json(
      { error: "Unable to load the profile." },
      { status: 500 },
    );
  }

  if (
    !profile ||
    profile.account_status !== "active"
  ) {
    return NextResponse.json(
      { error: "User not found." },
      { status: 404 },
    );
  }

  const {
    data: verificationGrantData,
    error: verificationError,
  } = await admin
    .from("profile_verifications")
    .select(
      "verification_kind, verified_at, expires_at, revoked_at",
    )
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (verificationError) {
    console.error(
      "Failed to load Agore verification status:",
      verificationError,
    );

    return NextResponse.json(
      { error: "Unable to load verification status." },
      { status: 500 },
    );
  }

  const verificationGrant =
    verificationGrantData as VerificationGrant | null;

  const verificationKind =
    getActiveVerificationKind(verificationGrant);

  const blockedConnectionIds =
    getBlockedConnectionIds(
      blockRelationships,
      user.id,
    );

  const followerRows =
    (followersResult.data ?? []) as ConnectionFollowRow[];

  const followingRows =
    (followingResult.data ?? []) as ConnectionFollowRow[];

  const connectionIds = [
    ...new Set([
      ...followerRows.map((row) => row.follower_id),
      ...followingRows.map((row) => row.following_id),
    ]),
  ];

  let activeConnectionIds = new Set<string>();

  if (connectionIds.length > 0) {
    const {
      data: connectionProfiles,
      error: connectionProfilesError,
    } = await admin
      .from("profiles")
      .select("id, account_status")
      .in("id", connectionIds)
      .eq("account_status", "active");

    if (connectionProfilesError) {
      console.error(
        "Failed to resolve Agore connection profiles:",
        connectionProfilesError,
      );

      return NextResponse.json(
        { error: "Unable to load the profile relationships." },
        { status: 500 },
      );
    }

    activeConnectionIds = new Set(
      (connectionProfiles ?? []).map(
        (connection) => connection.id,
      ),
    );
  }

  const followerCount = viewerBlockedTarget
    ? 0
    : countVisibleConnections(
        followerRows,
        blockedConnectionIds,
        activeConnectionIds,
        "followers",
      );

  const followingCount = viewerBlockedTarget
    ? 0
    : countVisibleConnections(
        followingRows,
        blockedConnectionIds,
        activeConnectionIds,
        "following",
      );

  let postCount = 0;

  if (!viewerBlockedTarget) {
    const {
      count,
      error: postCountError,
    } = await admin
      .from("posts")
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq("author_id", targetUserId)
      .is("deleted_at", null);

    if (postCountError) {
      console.error(
        "Failed to count Agore profile posts:",
        postCountError,
      );

      return NextResponse.json(
        { error: "Unable to load the profile post count." },
        { status: 500 },
      );
    }

    postCount = count ?? 0;
  }

  let isFollowing = false;

  if (
    targetUserId !== user.id &&
    !viewerBlockedTarget
  ) {
    isFollowing = followerRows.some(
      (row) => row.follower_id === user.id,
    );
  }

  return NextResponse.json({
    profile: {
      ...profile,
      verification: {
        status: verificationKind
          ? "verified"
          : "unverified",
        kind: verificationKind,
      },
      is_self: targetUserId === user.id,
      is_following: isFollowing,
      is_blocked: viewerBlockedTarget,
      post_count: postCount,
      follower_count: followerCount,
      following_count: followingCount,
    },
  });
}
