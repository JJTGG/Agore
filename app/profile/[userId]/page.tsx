"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Ban,
  Check,
  Edit3,
  Loader2,
  MessageCircle,
  UserPlus,
} from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import ProfilePosts from "./profile-posts";

type Profile = {
  id: string;
  display_name: string;
  username: string;
  bio: string | null;
  avatar_path: string | null;
  follower_count: number;
  following_count: number;
  is_following: boolean;
  is_blocked: boolean;
};

const supabase = createClient();

export default function ProfilePage() {
  const params = useParams<{ userId: string }>();
  const router = useRouter();

  const userId = params.userId;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<
    "follow" | "block" | null
  >(null);
  const [messageLoading, setMessageLoading] = useState(false);
  const [error, setError] = useState("");

  const loadProfile = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    setError("");
    setAvatarUrl(null);

    try {
      const response = await fetch(
        `/api/users/${encodeURIComponent(userId)}`,
        {
          cache: "no-store",
        },
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Unable to load this profile.");
        setProfile(null);
        setIsOwner(false);
        return;
      }

      const loadedProfile = data.profile as Profile;

      setProfile(loadedProfile);

      if (loadedProfile.avatar_path) {
        const { data: signedAvatar, error: signedUrlError } =
          await supabase.storage
            .from("avatars")
            .createSignedUrl(loadedProfile.avatar_path, 60 * 60);

        if (signedUrlError) {
          console.error(
            "Failed to create Agore profile avatar signed URL:",
            signedUrlError,
          );
          setAvatarUrl(null);
        } else {
          setAvatarUrl(signedAvatar.signedUrl);
        }
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      setIsOwner(user?.id === loadedProfile.id);
    } catch {
      setError("Unable to load this profile.");
      setProfile(null);
      setAvatarUrl(null);
      setIsOwner(false);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  async function toggleFollow() {
    if (!profile || actionLoading || messageLoading || isOwner) return;

    setActionLoading("follow");
    setError("");

    try {
      const method = profile.is_following ? "DELETE" : "POST";

      const response = await fetch(
        `/api/users/${encodeURIComponent(profile.id)}/follow`,
        {
          method,
        },
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Unable to update follow status.");
        return;
      }

      setProfile((current) =>
        current
          ? {
              ...current,
              is_following: !current.is_following,
              follower_count: current.is_following
                ? Math.max(0, current.follower_count - 1)
                : current.follower_count + 1,
            }
          : current,
      );
    } catch {
      setError("Unable to update follow status.");
    } finally {
      setActionLoading(null);
    }
  }

  async function toggleBlock() {
    if (!profile || actionLoading || messageLoading || isOwner) return;

    setActionLoading("block");
    setError("");

    try {
      const method = profile.is_blocked ? "DELETE" : "POST";

      const response = await fetch(
        `/api/users/${encodeURIComponent(profile.id)}/block`,
        {
          method,
        },
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Unable to update block status.");
        return;
      }

      if (!profile.is_blocked) {
        setProfile((current) =>
          current
            ? {
                ...current,
                is_blocked: true,
                is_following: false,
              }
            : current,
        );
      } else {
        setProfile((current) =>
          current
            ? {
                ...current,
                is_blocked: false,
              }
            : current,
        );
      }
    } catch {
      setError("Unable to update block status.");
    } finally {
      setActionLoading(null);
    }
  }

  async function startDirectConversation() {
    if (!profile || isOwner || profile.is_blocked || messageLoading) return;

    setMessageLoading(true);
    setError("");

    try {
      const response = await fetch("/api/conversations/direct", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: profile.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Unable to start the conversation.");
        return;
      }

      if (!data.conversation?.id) {
        setError("The conversation could not be opened.");
        return;
      }

      router.push(`/messages/${encodeURIComponent(data.conversation.id)}`);
    } catch {
      setError("Unable to start the conversation.");
    } finally {
      setMessageLoading(false);
    }
  }

  const initials = profile
    ? profile.display_name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("")
    : "";

  return (
    <main className="min-h-screen bg-[#f6f5f1] text-[#17191c]">
      <div className="mx-auto min-h-screen w-full max-w-3xl px-4 py-5 sm:px-6">
        <header className="mb-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 rounded-full border border-[#deddd7] bg-white px-4 py-2 text-sm font-medium transition hover:border-[#b9c7ea] hover:bg-[#f9fbff]"
          >
            <ArrowLeft size={16} />
            Back
          </button>

          <Link
            href="/home"
            className="text-sm font-semibold tracking-[0.14em] text-[#2148b8]"
          >
            AGORÉ
          </Link>
        </header>

        {loading ? (
          <section className="rounded-3xl border border-[#deddd7] bg-white p-6">
            <div className="animate-pulse space-y-5">
              <div className="h-20 w-20 rounded-full bg-[#e8e7e1]" />
              <div className="h-7 w-48 rounded bg-[#e8e7e1]" />
              <div className="h-4 w-32 rounded bg-[#e8e7e1]" />
              <div className="h-16 w-full rounded bg-[#e8e7e1]" />
            </div>
          </section>
        ) : error && !profile ? (
          <section className="rounded-3xl border border-[#deddd7] bg-white p-6">
            <p className="text-sm font-medium text-[#8d2f2f]">{error}</p>

            <button
              type="button"
              onClick={() => void loadProfile()}
              className="mt-4 rounded-full bg-[#2148b8] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#183991]"
            >
              Retry
            </button>
          </section>
        ) : profile ? (
          <>
            <section className="overflow-hidden rounded-3xl border border-[#deddd7] bg-white">
              <div className="border-b border-[#ebeae5] px-6 pb-6 pt-7 sm:px-8">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="flex h-20 w-20 shrink-0 overflow-hidden rounded-full bg-[#e5ebff] text-xl font-bold text-[#2148b8]">
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt={`${profile.display_name}'s profile photo`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="flex h-full w-full items-center justify-center"
                        >
                          {initials || "A"}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0">
                      <h1 className="truncate text-2xl font-semibold tracking-[-0.03em]">
                        {profile.display_name}
                      </h1>

                      <p className="mt-1 text-sm text-[#70747b]">
                        @{profile.username}
                      </p>

                      {profile.bio ? (
                        <p className="mt-4 max-w-xl whitespace-pre-wrap text-[15px] leading-6 text-[#30343a]">
                          {profile.bio}
                        </p>
                      ) : (
                        <p className="mt-4 text-sm text-[#8a8d92]">
                          No bio yet.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {isOwner ? (
                      <Link
                        href={`/profile/edit?userId=${encodeURIComponent(
                          profile.id,
                        )}`}
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-[#2148b8] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#183991]"
                      >
                        <Edit3 size={16} />
                        Edit profile
                      </Link>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => void toggleFollow()}
                          disabled={
                            actionLoading !== null ||
                            messageLoading ||
                            profile.is_blocked
                          }
                          className="inline-flex items-center justify-center gap-2 rounded-full bg-[#2148b8] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#183991] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {actionLoading === "follow" ? (
                            <Loader2 className="animate-spin" size={16} />
                          ) : profile.is_following ? (
                            <>
                              <Check size={16} />
                              Following
                            </>
                          ) : (
                            <>
                              <UserPlus size={16} />
                              Follow
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => void startDirectConversation()}
                          disabled={
                            actionLoading !== null ||
                            messageLoading ||
                            profile.is_blocked
                          }
                          className="inline-flex items-center justify-center gap-2 rounded-full border border-[#deddd7] bg-white px-4 py-2.5 text-sm font-semibold text-[#4d535b] transition hover:border-[#b9c7ea] hover:bg-[#f9fbff] disabled:cursor-not-allowed disabled:opacity-55"
                        >
                          {messageLoading ? (
                            <Loader2 className="animate-spin" size={16} />
                          ) : (
                            <MessageCircle size={16} />
                          )}
                          {messageLoading ? "Opening…" : "Message"}
                        </button>

                        <button
                          type="button"
                          onClick={() => void toggleBlock()}
                          disabled={
                            actionLoading !== null || messageLoading
                          }
                          className="inline-flex items-center justify-center gap-2 rounded-full border border-[#deddd7] bg-white px-4 py-2.5 text-sm font-semibold text-[#4d535b] transition hover:border-[#c9c7c0] hover:bg-[#f8f7f3] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {actionLoading === "block" ? (
                            <Loader2 className="animate-spin" size={16} />
                          ) : (
                            <Ban size={16} />
                          )}
                          {profile.is_blocked ? "Unblock" : "Block"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 divide-x divide-[#ebeae5]">
                <div className="px-6 py-5 text-center sm:px-8">
                  <p className="text-xl font-semibold">
                    {profile.following_count}
                  </p>
                  <p className="mt-1 text-sm text-[#74787e]">Following</p>
                </div>

                <div className="px-6 py-5 text-center sm:px-8">
                  <p className="text-xl font-semibold">
                    {profile.follower_count}
                  </p>
                  <p className="mt-1 text-sm text-[#74787e]">Followers</p>
                </div>
              </div>

              {error ? (
                <div className="border-t border-[#ebeae5] px-6 py-4 sm:px-8">
                  <p className="text-sm font-medium text-[#8d2f2f]">
                    {error}
                  </p>
                </div>
              ) : null}
            </section>

            <ProfilePosts userId={profile.id} />
          </>
        ) : null}
      </div>
    </main>
  );
}