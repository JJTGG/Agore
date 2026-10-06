import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

async function verifyTargetUser(
  targetUserId: string,
  currentUserId: string,
) {
  if (targetUserId === currentUserId) {
    return {
      ok: false as const,
      status: 400,
      error: "You cannot block yourself.",
    };
  }

  const admin = createAdminClient();

  const { data: targetProfile, error } = await admin
    .from("profiles")
    .select("id, account_status")
    .eq("id", targetUserId)
    .maybeSingle();

  if (error) {
    console.error(
      "Failed to verify Agore block target:",
      error,
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

  return {
    ok: true as const,
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
      blocked: false,
    });
  }

  const { data: block, error } = await supabase
    .from("blocks")
    .select("blocker_id, blocked_id")
    .eq("blocker_id", user.id)
    .eq("blocked_id", targetUserId)
    .maybeSingle();

  if (error) {
    console.error(
      "Failed to load Agore block status:",
      error,
    );

    return NextResponse.json(
      { error: "Unable to load block status." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    blocked: Boolean(block),
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

  const targetCheck = await verifyTargetUser(
    targetUserId,
    user.id,
  );

  if (!targetCheck.ok) {
    return NextResponse.json(
      { error: targetCheck.error },
      { status: targetCheck.status },
    );
  }

  const admin = createAdminClient();

  const { data: block, error: blockError } = await admin
    .from("blocks")
    .upsert(
      {
        blocker_id: user.id,
        blocked_id: targetUserId,
      },
      {
        onConflict: "blocker_id,blocked_id",
        ignoreDuplicates: true,
      },
    )
    .select("blocker_id, blocked_id, created_at")
    .maybeSingle();

  if (blockError) {
    console.error(
      "Failed to create Agore block:",
      blockError,
    );

    return NextResponse.json(
      { error: "Unable to block this user." },
      { status: 500 },
    );
  }

  const { error: followCleanupError } = await admin
    .from("follows")
    .delete()
    .or(
      `and(follower_id.eq.${user.id},following_id.eq.${targetUserId}),and(follower_id.eq.${targetUserId},following_id.eq.${user.id})`,
    );

  if (followCleanupError) {
    console.error(
      "Failed to clean up Agore follows after block:",
      followCleanupError,
    );

    return NextResponse.json(
      {
        error:
          "The user was blocked, but the follow relationship could not be fully cleaned up.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    blocked: true,
    block: block ?? null,
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
      { error: "You cannot unblock yourself." },
      { status: 400 },
    );
  }

  const { error: deleteError } = await supabase
    .from("blocks")
    .delete()
    .eq("blocker_id", user.id)
    .eq("blocked_id", targetUserId);

  if (deleteError) {
    console.error(
      "Failed to remove Agore block:",
      deleteError,
    );

    return NextResponse.json(
      { error: "Unable to unblock this user." },
      { status: 500 },
    );
  }

  return new NextResponse(null, { status: 204 });
}