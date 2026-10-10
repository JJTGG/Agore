
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

function isAllowedProfileUrl(value: string) {
  try {
    const url = new URL(value);

    return (
      (url.protocol === "https:" ||
        url.protocol === "http:") &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

const profileLinkSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, "Every profile link needs a label.")
    .max(40, "Link labels must be 40 characters or fewer."),
  url: z
    .string()
    .trim()
    .max(2048, "Profile URLs must be 2048 characters or fewer.")
    .url("Enter a valid URL for each profile link.")
    .refine(
      isAllowedProfileUrl,
      "Profile links must use HTTP or HTTPS and cannot contain embedded credentials.",
    ),
});

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
  location: z
    .string()
    .trim()
    .max(100, "Location must be 100 characters or fewer.")
    .nullable()
    .optional(),
  profile_links: z
    .array(profileLinkSchema)
    .max(5, "You can add up to five profile links.")
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

  const updates = {
    display_name: parsedBody.data.display_name,
    username: parsedBody.data.username,
    bio,
    updated_at: new Date().toISOString(),
    ...(parsedBody.data.location !== undefined
      ? {
          location:
            parsedBody.data.location?.trim() || null,
        }
      : {}),
    ...(parsedBody.data.profile_links !== undefined
      ? {
          profile_links: parsedBody.data.profile_links,
        }
      : {}),
  };

  const { data: profile, error: updateError } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", user.id)
    .select(
      "id, display_name, username, bio, avatar_path, location, profile_links, updated_at",
    )
    .single();

  if (updateError) {
    console.error("Failed to update Agore profile:", updateError);

    if (updateError.code === "23505") {
      return NextResponse.json(
        { error: "That username is already taken." },
        { status: 409 },
      );
    }

    if (updateError.code === "23514") {
      return NextResponse.json(
        { error: "The supplied profile details are invalid." },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: "Unable to update your profile." },
      { status: 500 },
    );
  }

  return NextResponse.json({ profile });
}
