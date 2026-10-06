"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Ban,
  Check,
  MessageCircle,
  UserPlus,
} from "lucide-react";
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

export default function ProfilePage() {
  const params = useParams<{ userId: string }>();
  const router = useRouter();

  const userId = params.userId;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<
    "follow" | "block" | null
  >(null);
  const [error, setError] = useState("");

  const loadProfile = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    setError("");

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
        return;
      }

      setProfile(data.profile);
    } catch {
      setError("Unable to load this profile.");
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  async function toggleFollow() {
    if (!profile || actionLoading) return;

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
    if (!profile || actionLoading) return;

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
                    <div
                      aria-hidden="true"
                      className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-[#e5ebff] text-xl font-bold text-[#2148b8]"
                    >
                      {initials || "A"}
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
                    <button
                      type="button"
                      onClick={() => void toggleFollow()}
                      disabled={actionLoading !== null || profile.is_blocked}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-[#2148b8] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#183991] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {profile.is_following ? (
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
                      disabled
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-[#deddd7] bg-white px-4 py-2.5 text-sm font-semibold text-[#4d535b] disabled:cursor-not-allowed disabled:opacity-55"
                      title="Messaging will connect here next."
                    >
                      <MessageCircle size={16} />
                      Message
                    </button>

                    <button
                      type="button"
                      onClick={() => void toggleBlock()}
                      disabled={actionLoading !== null}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-[#deddd7] bg-white px-4 py-2.5 text-sm font-semibold text-[#4d535b] transition hover:border-[#c9c7c0] hover:bg-[#f8f7f3] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Ban size={16} />
                      {profile.is_blocked ? "Unblock" : "Block"}
                    </button>
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