import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const updateProfileSchema = z.object({
  display_name: z
    .string()
    .trim()
    .min(1, "Display name is required.")
    .max(80, "Display name must be 80 characters or fewer."),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9_]{3,30}$/,
      "Username must be 3–30 characters and contain only letters, numbers, and underscores.",
    ),
  bio: z
    .string()
    .trim()
    .max(160, "Bio must be 160 characters or fewer.")
    .nullable()
    .optional(),
});

export async function PATCH(request: Request) {
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

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const parsedBody = updateProfileSchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json(
      {
        error:
          parsedBody.error.issues[0]?.message ??
          "Invalid profile information.",
      },
      { status: 400 },
    );
  }

  const bio = parsedBody.data.bio?.trim() || null;

  const { data: profile, error: updateError } = await supabase
    .from("profiles")
    .update({
      display_name: parsedBody.data.display_name,
      username: parsedBody.data.username,
      bio,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id)
    .select("id, display_name, username, bio, avatar_path, updated_at")
    .single();

  if (updateError) {
    console.error("Failed to update Agore profile:", updateError);

    if (updateError.code === "23505") {
      return NextResponse.json(
        { error: "That username is already taken." },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: "Unable to update your profile." },
      { status: 500 },
    );
  }

  return NextResponse.json({ profile });
}