
import { NextResponse } from "next/server";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const postIdSchema = z.uuid();

const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0",
};

type AccountType =
  | "personal"
  | "creator"
  | "business"
  | "organization"
  | "institution";

type VerificationKind = "agore_official" | "paid" | null;

type ProfileRow = {
  display_name: string;
  username: string;
  avatar_path: string | null;
  account_type: AccountType;
  account_status: string;
};

type MediaRow = {
  id: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  sort_order: number;
  created_at: string;
};

type VerificationRow = {
  verification_kind: "agore_official" | "paid" | "official";
  expires_at: string | null;
  revoked_at: string | null;
};

type PostRow = {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  post_media: MediaRow[] | null;
  profiles: ProfileRow | ProfileRow[] | null;
};

type PublicMediaRow = MediaRow & {
  signed_url: string | null;
};

function normalizeProfile(
  profile: ProfileRow | ProfileRow[] | null,
): ProfileRow | null {
  if (!profile) {
    return null;
  }

  return Array.isArray(profile)
    ? profile[0] ?? null
    : profile;
}

function sortMedia(media: MediaRow[] | null | undefined) {
  return [...(media ?? [])].sort(
    (a, b) =>
      a.sort_order - b.sort_order ||
      new Date(a.created_at).getTime() -
        new Date(b.created_at).getTime(),
  );
}

function getActiveVerificationKind(
  grant: VerificationRow | null,
): VerificationKind {
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
    grant.expires_at !== null &&
    Date.parse(grant.expires_at) > Date.now()
  ) {
    return "paid";
  }

  return null;
}

export async function GET(
  _: Request,
  context: {
    params: Promise<{ postId: string }>;
  },
) {
  const { postId } = await context.params;
  const parsedId = postIdSchema.safeParse(postId);

  if (!parsedId.success) {
    return NextResponse.json(
      { error: "Invalid post ID." },
      { status: 400, headers: noStoreHeaders },
    );
  }

  try {
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("posts")
      .select(`
        id,
        author_id,
        content,
        created_at,
        updated_at,
        post_media (
          id,
          storage_path,
          mime_type,
          size_bytes,
          width,
          height,
          sort_order,
          created_at
        ),
        profiles!posts_author_id_fkey (
          display_name,
          username,
          avatar_path,
          account_type,
          account_status
        )
      `)
      .eq("id", parsedId.data)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      console.error("Failed to load shared Agoré post:", error);

      return NextResponse.json(
        { error: "Unable to load this post." },
        { status: 500, headers: noStoreHeaders },
      );
    }

    const post = data as unknown as PostRow | null;

    if (!post) {
      return NextResponse.json(
        { error: "Post not found." },
        { status: 404, headers: noStoreHeaders },
      );
    }

    const profile = normalizeProfile(post.profiles);

    // Only active accounts can expose posts through public share links.
    if (!profile || profile.account_status !== "active") {
      return NextResponse.json(
        { error: "Post not found." },
        { status: 404, headers: noStoreHeaders },
      );
    }

    const [verificationResult, avatarResult] =
      await Promise.all([
        admin
          .from("profile_verifications")
          .select("verification_kind, expires_at, revoked_at")
          .eq("user_id", post.author_id)
          .maybeSingle(),

        profile.avatar_path
          ? admin.storage
              .from("avatars")
              .createSignedUrl(profile.avatar_path, 60 * 60)
          : Promise.resolve({ data: null, error: null }),
      ]);

    if (verificationResult.error) {
      console.error(
        "Unable to load shared-post verification status:",
        verificationResult.error,
      );
    }

    const verificationKind = getActiveVerificationKind(
      verificationResult.error
        ? null
        : (verificationResult.data as VerificationRow | null),
    );

    const avatarUrl =
      avatarResult.data && !avatarResult.error
        ? avatarResult.data.signedUrl
        : null;

    // The buckets remain private. These links are temporary and are
    // created only for attachments belonging to this visible post.
    const media: PublicMediaRow[] = await Promise.all(
      sortMedia(post.post_media).map(async (item) => {
        if (!item.storage_path.startsWith(`${post.id}/`)) {
          return { ...item, signed_url: null };
        }

        const { data: signedData, error: signedError } =
          await admin.storage
            .from("post-media")
            .createSignedUrl(item.storage_path, 60 * 60);

        if (signedError) {
          console.error(
            "Unable to sign shared-post attachment:",
            signedError,
          );

          return { ...item, signed_url: null };
        }

        return {
          ...item,
          signed_url: signedData.signedUrl,
        };
      }),
    );

    return NextResponse.json(
      {
        post: {
          id: post.id,
          author_id: post.author_id,
          content: post.content,
          created_at: post.created_at,
          updated_at: post.updated_at,
          post_media: media,
          profiles: {
            display_name: profile.display_name,
            username: profile.username,
            avatar_path: profile.avatar_path,
            avatar_url: avatarUrl,
            account_type: profile.account_type,
            verification_kind: verificationKind,
          },
        },
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("Public Agoré post endpoint failed:", error);

    return NextResponse.json(
      { error: "Unable to load this post." },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
