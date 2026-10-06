import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createInviteAssertion } from "@/lib/auth/invite";

const inviteSchema = z.object({
  code: z.string().trim().min(1).max(128),
  email: z.string().trim().toLowerCase().email(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = inviteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid invite request." },
        { status: 400 },
      );
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceRoleKey) {
      return NextResponse.json(
        { error: "Server configuration is incomplete." },
        { status: 500 },
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    const codeHash = createHash("sha256")
      .update(parsed.data.code)
      .digest("hex");

    const { data: invite, error: inviteError } = await supabase
      .schema("private")
      .from("platform_invites")
      .select("id, max_uses, uses_count, expires_at, revoked_at")
      .eq("code_hash", codeHash)
      .maybeSingle();

    if (inviteError) {
      return NextResponse.json(
        { error: "Unable to validate invite." },
        { status: 500 },
      );
    }

    if (!invite) {
      return NextResponse.json(
        { error: "Invalid invite code." },
        { status: 400 },
      );
    }

    const now = new Date();

    if (invite.revoked_at) {
      return NextResponse.json(
        { error: "This invite is no longer active." },
        { status: 400 },
      );
    }

    if (invite.expires_at && new Date(invite.expires_at) <= now) {
      return NextResponse.json(
        { error: "This invite has expired." },
        { status: 400 },
      );
    }

    if (invite.uses_count >= invite.max_uses) {
      return NextResponse.json(
        { error: "This invite has reached its usage limit." },
        { status: 400 },
      );
    }

    const assertion = createInviteAssertion(
      invite.id,
      parsed.data.email,
    );

    const response = NextResponse.json({
      valid: true,
    });

    response.cookies.set({
      name: "agore_invite_assertion",
      value: assertion,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/auth",
      maxAge: 60 * 60,
    });

    return response;
  } catch (error) {
    console.error("Invite validation failed:", error);

    return NextResponse.json(
      { error: "Unable to validate invite." },
      { status: 500 },
    );
  }
}