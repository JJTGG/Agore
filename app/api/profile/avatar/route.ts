import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const MAX_AVATAR_SIZE =
  5 * 1024 * 1024;

const ALLOWED_TYPES =
  new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);

function hasValidSignature(
  bytes: Uint8Array,
  contentType: string,
) {
  if (
    contentType ===
    "image/jpeg"
  ) {
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  }

  if (
    contentType ===
    "image/png"
  ) {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }

  if (
    contentType ===
    "image/webp"
  ) {
    return (
      bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    );
  }

  return false;
}

function getAvatarPath(
  userId: string,
) {
  return `${userId}/${crypto.randomUUID()}`;
}

export async function POST(
  request: Request,
) {
  const supabase =
    await createClient();

  const {
    data: { user },
    error: userError,
  } =
    await supabase.auth.getUser();

  if (
    userError ||
    !user
  ) {
    return NextResponse.json(
      {
        error:
          "Authentication required.",
      },
      {
        status: 401,
      },
    );
  }

  let formData: FormData;

  try {
    formData =
      await request.formData();
  } catch {
    return NextResponse.json(
      {
        error:
          "Invalid upload request.",
      },
      {
        status: 400,
      },
    );
  }

  const fileValue =
    formData.get("file");

  if (
    !(fileValue instanceof File)
  ) {
    return NextResponse.json(
      {
        error:
          "An avatar image is required.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    fileValue.size <= 0
  ) {
    return NextResponse.json(
      {
        error:
          "The selected image is empty.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    fileValue.size >
    MAX_AVATAR_SIZE
  ) {
    return NextResponse.json(
      {
        error:
          "Avatar must be 5 MB or smaller.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    !ALLOWED_TYPES.has(
      fileValue.type,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Avatar must be a JPEG, PNG, or WebP image.",
      },
      {
        status: 400,
      },
    );
  }

  const buffer =
    new Uint8Array(
      await fileValue.arrayBuffer(),
    );

  if (
    !hasValidSignature(
      buffer,
      fileValue.type,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "The selected file is not a valid image.",
      },
      {
        status: 400,
      },
    );
  }

  const {
    data: currentProfile,
    error: currentProfileError,
  } =
    await supabase
      .from("profiles")
      .select(
        "id, display_name, username, bio, avatar_path, updated_at",
      )
      .eq(
        "id",
        user.id,
      )
      .single();

  if (
    currentProfileError
  ) {
    console.error(
      "Failed to load Agore profile before avatar upload:",
      currentProfileError,
    );

    return NextResponse.json(
      {
        error:
          "Unable to load your profile.",
      },
      {
        status: 500,
      },
    );
  }

  const previousAvatarPath =
    currentProfile.avatar_path;

  const newAvatarPath =
    getAvatarPath(
      user.id,
    );

  const {
    error: uploadError,
  } = await supabase.storage
    .from("avatars")
    .upload(
      newAvatarPath,
      fileValue,
      {
        cacheControl:
          "3600",
        contentType:
          fileValue.type,
        upsert: false,
      },
    );

  if (uploadError) {
    console.error(
      "Failed to upload Agore avatar:",
      uploadError,
    );

    return NextResponse.json(
      {
        error:
          "Unable to upload your avatar.",
      },
      {
        status: 500,
      },
    );
  }

  const {
    data: updatedProfile,
    error: updateError,
  } =
    await supabase
      .from("profiles")
      .update({
        avatar_path:
          newAvatarPath,
        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        user.id,
      )
      .select(
        "id, display_name, username, bio, avatar_path, updated_at",
      )
      .single();

  if (
    updateError
  ) {
    console.error(
      "Failed to save Agore avatar path:",
      updateError,
    );

    await supabase.storage
      .from("avatars")
      .remove([
        newAvatarPath,
      ]);

    return NextResponse.json(
      {
        error:
          "Avatar uploaded, but your profile could not be updated.",
      },
      {
        status: 500,
      },
    );
  }

  if (
    previousAvatarPath &&
    previousAvatarPath !==
      newAvatarPath
  ) {
    const {
      error: cleanupError,
    } =
      await supabase.storage
        .from("avatars")
        .remove([
          previousAvatarPath,
        ]);

    if (cleanupError) {
      console.error(
        "Agore avatar replaced, but previous avatar cleanup failed:",
        cleanupError,
      );

      return NextResponse.json({
        profile:
          updatedProfile,
        avatar_path:
          newAvatarPath,
        storage_cleanup_pending:
          true,
      });
    }
  }

  return NextResponse.json({
    profile:
      updatedProfile,
    avatar_path:
      newAvatarPath,
  });
}

export async function DELETE() {
  const supabase =
    await createClient();

  const {
    data: { user },
    error: userError,
  } =
    await supabase.auth.getUser();

  if (
    userError ||
    !user
  ) {
    return NextResponse.json(
      {
        error:
          "Authentication required.",
      },
      {
        status: 401,
      },
    );
  }

  const {
    data: currentProfile,
    error: profileError,
  } =
    await supabase
      .from("profiles")
      .select(
        "id, display_name, username, bio, avatar_path, updated_at",
      )
      .eq(
        "id",
        user.id,
      )
      .single();

  if (
    profileError
  ) {
    console.error(
      "Failed to load Agore profile before avatar removal:",
      profileError,
    );

    return NextResponse.json(
      {
        error:
          "Unable to load your profile.",
      },
      {
        status: 500,
      },
    );
  }

  if (
    !currentProfile.avatar_path
  ) {
    return NextResponse.json({
      profile:
        currentProfile,
      avatar_path:
        null,
    });
  }

  const avatarPath =
    currentProfile.avatar_path;

  const {
    data: updatedProfile,
    error: updateError,
  } =
    await supabase
      .from("profiles")
      .update({
        avatar_path: null,
        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        user.id,
      )
      .eq(
        "avatar_path",
        avatarPath,
      )
      .select(
        "id, display_name, username, bio, avatar_path, updated_at",
      )
      .single();

  if (
    updateError
  ) {
    console.error(
      "Failed to remove Agore avatar reference:",
      updateError,
    );

    return NextResponse.json(
      {
        error:
          "Unable to remove your profile photo.",
      },
      {
        status: 500,
      },
    );
  }

  const {
    error: storageError,
  } =
    await supabase.storage
      .from("avatars")
      .remove([
        avatarPath,
      ]);

  if (storageError) {
    console.error(
      "Agore avatar reference removed, but storage cleanup failed:",
      storageError,
    );

    return NextResponse.json({
      profile:
        updatedProfile,
      avatar_path:
        null,
      storage_cleanup_pending:
        true,
    });
  }

  return NextResponse.json({
    profile:
      updatedProfile,
    avatar_path:
      null,
  });
}