import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

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
    const body = await request.json();
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
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "You must be signed in to continue." },
        { status: 401 },
      );
    }

    const { data: existingProfile, error: profileLookupError } =
      await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();

    if (profileLookupError) {
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

    const { error: profileError } = await supabase
      .from("profiles")
      .insert({
        id: user.id,
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

      return NextResponse.json(
        { error: "Unable to create your profile." },
        { status: 500 },
      );
    }

    const [{ error: preferencesError }, { error: settingsError }] =
      await Promise.all([
        supabase
          .from("notification_preferences")
          .upsert(
            {
              user_id: user.id,
            },
            {
              onConflict: "user_id",
            },
          ),
        supabase
          .from("user_settings")
          .upsert(
            {
              user_id: user.id,
            },
            {
              onConflict: "user_id",
            },
          ),
      ]);

    if (preferencesError || settingsError) {
      return NextResponse.json(
        { error: "Profile created, but account preferences could not be initialized." },
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