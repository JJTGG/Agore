import { NextResponse } from "next/server";
import { z } from "zod";
import { createNotification } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const userIdSchema = z.string().uuid();

type RouteContext = {
  params: Promise<{
    userId: string;
  }>;
};

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

async function getTargetUserId(context: RouteContext) {
  const { userId } = await context.params;
  return userIdSchema.safeParse(userId);
}

async function verifyFollowTarget(
  targetUserId: string,
  currentUserId: string,
) {
  const admin = createAdminClient();

  const { data: targetProfile, error: targetError } = await admin
    .from("profiles")
    .select("id, display_name, username, account_status")
    .eq("id", targetUserId)
    .maybeSingle();

  if (targetError) {
    console.error(
      "Failed to verify Agore follow target:",
      targetError,
    );

    return {
      ok: false as const,
      status: 500,
      error: "Unable to verify the user.",
    };
  }

  if (!targetProfile || targetProfile.account_status !== "active") {
    return {
      ok: false as const,
      status: 404,
      error: "User not found.",
    };
  }

  if (targetUserId === currentUserId) {
    return {
      ok: false as const,
      status: 400,
      error: "You cannot follow yourself.",
    };
  }

  const { data: blockingRelationship, error: blockError } = await admin
    .from("blocks")
    .select("blocker_id, blocked_id")
    .or(
      `and(blocker_id.eq.${currentUserId},blocked_id.eq.${targetUserId}),and(blocker_id.eq.${targetUserId},blocked_id.eq.${currentUserId})`,
    )
    .limit(1)
    .maybeSingle();

  if (blockError) {
    console.error(
      "Failed to verify Agore block relationship:",
      blockError,
    );

    return {
      ok: false as const,
      status: 500,
      error: "Unable to verify the relationship.",
    };
  }

  if (blockingRelationship) {
    return {
      ok: false as const,
      status: 403,
      error: "You cannot follow this user.",
    };
  }

  return {
    ok: true as const,
    targetProfile,
  };
}

export async function GET(_: Request, context: RouteContext) {
  const { supabase, user } = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const parsedUserId = await getTargetUserId(context);

  if (!parsedUserId.success) {
    return NextResponse.json(
      { error: "Invalid user ID." },
      { status: 400 },
    );
  }

  const targetUserId = parsedUserId.data;

  if (targetUserId === user.id) {
    return NextResponse.json({
      following: false,
    });
  }

  const { data: follow, error } = await supabase
    .from("follows")
    .select("follower_id, following_id")
    .eq("follower_id", user.id)
    .eq("following_id", targetUserId)
    .maybeSingle();

  if (error) {
    console.error(
      "Failed to load Agore follow status:",
      error,
    );

    return NextResponse.json(
      { error: "Unable to load follow status." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    following: Boolean(follow),
  });
}

export async function POST(_: Request, context: RouteContext) {
  const { supabase, user } = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const parsedUserId = await getTargetUserId(context);

  if (!parsedUserId.success) {
    return NextResponse.json(
      { error: "Invalid user ID." },
      { status: 400 },
    );
  }

  const targetUserId = parsedUserId.data;

  const targetCheck = await verifyFollowTarget(
    targetUserId,
    user.id,
  );

  if (!targetCheck.ok) {
    return NextResponse.json(
      { error: targetCheck.error },
      { status: targetCheck.status },
    );
  }

  const { data: follow, error: followError } = await supabase
    .from("follows")
    .upsert(
      {
        follower_id: user.id,
        following_id: targetUserId,
      },
      {
        onConflict: "follower_id,following_id",
        ignoreDuplicates: true,
      },
    )
    .select("follower_id, following_id, created_at")
    .maybeSingle();

  if (followError) {
    console.error(
      "Failed to create Agore follow:",
      followError,
    );

    return NextResponse.json(
      { error: "Unable to follow this user." },
      { status: 500 },
    );
  }

  const changed = Boolean(follow);

  if (changed) {
    await createNotification({
      recipientId: targetUserId,
      actorId: user.id,
      type: "follow",
      entityId: targetUserId,
    });
  }

  return NextResponse.json({
    following: true,
    changed,
    follow: follow ?? null,
  });
}

export async function DELETE(_: Request, context: RouteContext) {
  const { supabase, user } = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const parsedUserId = await getTargetUserId(context);

  if (!parsedUserId.success) {
    return NextResponse.json(
      { error: "Invalid user ID." },
      { status: 400 },
    );
  }

  const targetUserId = parsedUserId.data;

  if (targetUserId === user.id) {
    return NextResponse.json(
      { error: "You cannot unfollow yourself." },
      { status: 400 },
    );
  }

  const { data: deletedFollow, error: deleteError } = await supabase
    .from("follows")
    .delete()
    .eq("follower_id", user.id)
    .eq("following_id", targetUserId)
    .select("follower_id")
    .maybeSingle();

  if (deleteError) {
    console.error(
      "Failed to remove Agore follow:",
      deleteError,
    );

    return NextResponse.json(
      { error: "Unable to unfollow this user." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    following: false,
    changed: Boolean(deletedFollow),
  });
}