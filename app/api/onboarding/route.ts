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

    if (!existingProfile) {
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

      const { error: profileError } = await admin
        .from("profiles")
        .insert({
          id: authoritativeUser.id,
          display_name: parsed.data.displayName,
          username: parsed.data.username,
          bio: parsed.data.bio || null,
        });

      if (profileError) {
        if (profileError.code !== "23505") {
          console.error(
            "Agore profile creation failed:",
            profileError,
          );

          return NextResponse.json(
            { error: "Unable to create your profile." },
            { status: 500 },
          );
        }

        // A concurrent request may have created this user's profile
        // after the initial lookup. Distinguish that case from a
        // username collision belonging to another account.
        const {
          data: concurrentProfile,
          error: concurrentProfileLookupError,
        } = await admin
          .from("profiles")
          .select("id")
          .eq("id", authoritativeUser.id)
          .maybeSingle();

        if (concurrentProfileLookupError) {
          console.error(
            "Failed to verify profile after creation conflict:",
            concurrentProfileLookupError,
          );

          return NextResponse.json(
            { error: "Unable to verify your profile." },
            { status: 500 },
          );
        }

        if (!concurrentProfile) {
          return NextResponse.json(
            { error: "That username is already taken." },
            { status: 409 },
          );
        }
      }
    }

    // Always initialize these records, including when the profile
    // already exists. This makes retries recover from partial failure.
    //
    // Only user_id is supplied. Existing preference values are not
    // intentionally replaced; missing rows use database defaults.
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
            "Your profile exists, but account preferences could not be initialized. Please try again.",
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