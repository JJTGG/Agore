import { NextResponse } from "next/server";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const userIdSchema = z.uuid();

type VerificationGrant = {
  verification_kind: "agore_official" | "official" | "paid";
  expires_at: string | null;
  revoked_at: string | null;
};

function getActiveVerificationKind(
  grant: VerificationGrant | null,
): "agore_official" | "paid" | null {
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

    if (Number.isFinite(expiresAt) && expiresAt > Date.now()) {
      return "paid";
    }
  }

  return null;
}

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
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
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
    profileResult,
    blockResult,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, account_type, account_status")
      .eq("id", targetUserId)
      .maybeSingle(),

    admin
      .from("blocks")
      .select("blocker_id, blocked_id")
      .or(
        `blocker_id.eq.${user.id},blocked_id.eq.${user.id}`,
      ),
  ]);

  if (profileResult.error || blockResult.error) {
    console.error("Failed to load Agoré badge status:", {
      profileError: profileResult.error,
      blockError: blockResult.error,
    });

    return NextResponse.json(
      { error: "Unable to load badge status." },
      { status: 500 },
    );
  }

  const profile = profileResult.data;

  if (!profile || profile.account_status !== "active") {
    return NextResponse.json(
      { error: "User not found." },
      { status: 404 },
    );
  }

  const targetBlockedViewer = (blockResult.data ?? []).some(
    (relationship) =>
      relationship.blocker_id === targetUserId &&
      relationship.blocked_id === user.id,
  );

  if (targetBlockedViewer) {
    return NextResponse.json(
      { error: "User not found." },
      { status: 404 },
    );
  }

  const {
    data: grantData,
    error: verificationError,
  } = await admin
    .from("profile_verifications")
    .select("verification_kind, expires_at, revoked_at")
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (verificationError) {
    console.error(
      "Failed to load Agoré verification grant:",
      verificationError,
    );

    return NextResponse.json(
      { error: "Unable to load badge status." },
      { status: 500 },
    );
  }

  const kind = getActiveVerificationKind(
    grantData as VerificationGrant | null,
  );

  return NextResponse.json({
    badge: {
      accountType: profile.account_type,
      kind,
    },
  });
}