import { createHmac, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

type InviteAssertion = {
  inviteId: string;
  email: string;
  exp: number;
};

export function createInviteAssertion(
  inviteId: string,
  email: string,
) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }

  const payload = Buffer.from(
    JSON.stringify({
      inviteId,
      email: email.toLowerCase(),
      exp: Math.floor(Date.now() / 1000) + 60 * 60,
    }),
    "utf8",
  ).toString("base64url");

  const signature = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");

  return `${payload}.${signature}`;
}

export function verifyInviteAssertion(
  assertion: string,
): InviteAssertion | null {
  const separator = assertion.lastIndexOf(".");

  if (separator <= 0) {
    return null;
  }

  const encodedPayload = assertion.slice(0, separator);
  const encodedSignature = assertion.slice(separator + 1);

  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }

  const expectedSignature = createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");

  const expectedBuffer = Buffer.from(expectedSignature);
  const receivedBuffer = Buffer.from(encodedSignature);

  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as InviteAssertion;

    if (
      typeof payload.inviteId !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }

    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    return {
      inviteId: payload.inviteId,
      email: payload.email.toLowerCase(),
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

export async function consumeInviteForUser(
  userId: string,
  userEmail: string,
  assertion: string,
) {
  const invite = verifyInviteAssertion(assertion);

  if (!invite) {
    return {
      ok: false,
      status: 400,
      error: "Invalid or expired invite claim.",
    } as const;
  }

  if (userEmail.toLowerCase() !== invite.email) {
    return {
      ok: false,
      status: 400,
      error: "Invite claim does not match this account.",
    } as const;
  }

  const admin = createAdminClient();

  const {
    data: { user },
    error: userError,
  } = await admin.auth.admin.getUserById(userId);

  if (userError || !user || !user.email) {
    return {
      ok: false,
      status: 400,
      error: "Unable to verify account.",
    } as const;
  }

  if (user.email.toLowerCase() !== invite.email) {
    return {
      ok: false,
      status: 400,
      error: "Invite claim does not match this account.",
    } as const;
  }

  if (user.app_metadata?.agore_invite_consumed === true) {
    return {
      ok: true,
      consumed: true,
    } as const;
  }

  const { data: inviteRecord, error: inviteError } = await admin
    .schema("private")
    .from("platform_invites")
    .select("id, max_uses, uses_count, expires_at, revoked_at")
    .eq("id", invite.inviteId)
    .maybeSingle();

  if (inviteError || !inviteRecord) {
    return {
      ok: false,
      status: 400,
      error: "Invite is no longer available.",
    } as const;
  }

  if (inviteRecord.revoked_at) {
    return {
      ok: false,
      status: 400,
      error: "This invite is no longer active.",
    } as const;
  }

  if (
    inviteRecord.expires_at &&
    new Date(inviteRecord.expires_at) <= new Date()
  ) {
    return {
      ok: false,
      status: 400,
      error: "This invite has expired.",
    } as const;
  }

  const { data: updatedInvite, error: updateError } = await admin
    .schema("private")
    .from("platform_invites")
    .update({
      uses_count: inviteRecord.uses_count + 1,
    })
    .eq("id", inviteRecord.id)
    .eq("uses_count", inviteRecord.uses_count)
    .lt("uses_count", inviteRecord.max_uses)
    .select("id")
    .maybeSingle();

  if (updateError) {
    return {
      ok: false,
      status: 500,
      error: "Unable to claim invite.",
    } as const;
  }

  if (!updatedInvite) {
    return {
      ok: false,
      status: 400,
      error: "This invite is no longer available.",
    } as const;
  }

  const { error: metadataError } =
    await admin.auth.admin.updateUserById(userId, {
      app_metadata: {
        ...user.app_metadata,
        agore_invite_consumed: true,
        agore_invite_id: inviteRecord.id,
      },
    });

  if (metadataError) {
    return {
      ok: false,
      status: 500,
      error: "Invite claim could not be finalized.",
    } as const;
  }

  return {
    ok: true,
    consumed: true,
  } as const;
}