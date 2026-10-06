import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

const consumeSchema = z.object({
  assertion: z.string().min(1).max(2048),
  userId: z.string().uuid(),
});

function verifyAssertion(assertion: string) {
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
    ) as {
      inviteId: string;
      email: string;
      exp: number;
    };

    if (
      typeof payload.inviteId !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.exp !== "number" ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = consumeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid invite claim." },
        { status: 400 },
      );
    }

    const assertion = verifyAssertion(parsed.data.assertion);

    if (!assertion) {
      return NextResponse.json(
        { error: "Invalid or expired invite claim." },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.admin.getUserById(parsed.data.userId);

    if (userError || !user) {
      return NextResponse.json(
        { error: "Unable to verify account." },
        { status: 400 },
      );
    }

    if (!user.email || user.email.toLowerCase() !== assertion.email) {
      return NextResponse.json(
        { error: "Invite claim does not match this account." },
        { status: 400 },
      );
    }

    if (user.app_metadata?.agore_invite_consumed === true) {
      return NextResponse.json({ consumed: true });
    }

    const { data: invite, error: inviteError } = await supabase
      .schema("private")
      .from("platform_invites")
      .select("id, max_uses, uses_count, expires_at, revoked_at")
      .eq("id", assertion.inviteId)
      .maybeSingle();

    if (inviteError || !invite) {
      return NextResponse.json(
        { error: "Invite is no longer available." },
        { status: 400 },
      );
    }

    if (invite.revoked_at) {
      return NextResponse.json(
        { error: "This invite is no longer active." },
        { status: 400 },
      );
    }

    if (invite.expires_at && new Date(invite.expires_at) <= new Date()) {
      return NextResponse.json(
        { error: "This invite has expired." },
        { status: 400 },
      );
    }

    const { data: updatedInvite, error: updateError } = await supabase
      .schema("private")
      .from("platform_invites")
      .update({
        uses_count: invite.uses_count + 1,
      })
      .eq("id", invite.id)
      .eq("uses_count", invite.uses_count)
      .lt("uses_count", invite.max_uses)
      .select("id")
      .maybeSingle();

    if (updateError) {
      return NextResponse.json(
        { error: "Unable to claim invite." },
        { status: 500 },
      );
    }

    if (!updatedInvite) {
      return NextResponse.json(
        { error: "This invite is no longer available." },
        { status: 400 },
      );
    }

    const { error: metadataError } =
      await supabase.auth.admin.updateUserById(user.id, {
        app_metadata: {
          ...user.app_metadata,
          agore_invite_consumed: true,
        },
      });

    if (metadataError) {
      return NextResponse.json(
        { error: "Invite claim could not be finalized." },
        { status: 500 },
      );
    }

    return NextResponse.json({ consumed: true });
  } catch (error) {
    console.error("Invite consumption failed:", error);

    return NextResponse.json(
      { error: "Unable to claim invite." },
      { status: 500 },
    );
  }
}