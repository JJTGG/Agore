import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const onboardingSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9_]{3,24}$/,
      "Username must be 3–24 characters and use only letters, numbers, or underscores.",
    ),
  bio: z.string().trim().max(160).optional(),
});

export async function POST(request: Request) {
  try {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body." },
        { status: 400 },
      );
    }

    const parsed = onboardingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ??
            "Invalid profile details.",
        },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    const {
      data: { user: sessionUser },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !sessionUser) {
      return NextResponse.json(
        { error: "You must be signed in to continue." },
        { status: 401 },
      );
    }

    const admin = createAdminClient();

    const {
      data: { user: authoritativeUser },
      error: authoritativeUserError,
    } = await admin.auth.admin.getUserById(sessionUser.id);

    if (authoritativeUserError || !authoritativeUser) {
      return NextResponse.json(
        { error: "Unable to verify your Agoré account." },
        { status: 500 },
      );
    }

    if (!authoritativeUser.email_confirmed_at) {
      return NextResponse.json(
        {
          error:
            "Please verify your email before completing your profile.",
        },
        { status: 403 },
      );
    }

    const {
      data: existingProfile,
      error: profileLookupError,
    } = await admin
      .from("profiles")
      .select("id")
      .eq("id", authoritativeUser.id)
      .maybeSingle();

    if (profileLookupError) {
      console.error(
        "Failed to check Agore profile:",
        profileLookupError,
      );

      return NextResponse.json(
        { error: "Unable to check your profile." },
        { status: 500 },
      );
    }

    if (existingProfile) {
      return NextResponse.json({
        completed: true,
      });
    }

    const { error: profileError } = await admin
      .from("profiles")
      .insert({
        id: authoritativeUser.id,
        display_name: parsed.data.displayName,
        username: parsed.data.username,
        bio: parsed.data.bio || null,
      });

    if (profileError) {
      if (profileError.code === "23505") {
        return NextResponse.json(
          { error: "That username is already taken." },
          { status: 409 },
        );
      }

      console.error(
        "Agore profile creation failed:",
        profileError,
      );

      return NextResponse.json(
        { error: "Unable to create your profile." },
        { status: 500 },
      );
    }

    const [
      { error: preferencesError },
      { error: settingsError },
    ] = await Promise.all([
      admin
        .from("notification_preferences")
        .upsert(
          { user_id: authoritativeUser.id },
          { onConflict: "user_id" },
        ),

      admin
        .from("user_settings")
        .upsert(
          { user_id: authoritativeUser.id },
          { onConflict: "user_id" },
        ),
    ]);

    if (preferencesError || settingsError) {
      console.error(
        "Agore onboarding preference initialization failed:",
        {
          preferencesError,
          settingsError,
        },
      );

      return NextResponse.json(
        {
          error:
            "Profile created, but account preferences could not be initialized.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      completed: true,
    });
  } catch (error) {
    console.error("Onboarding failed:", error);

    return NextResponse.json(
      { error: "Unable to complete onboarding." },
      { status: 500 },
    );
  }
}