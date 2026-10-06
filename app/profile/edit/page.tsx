"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Profile = {
  id: string;
  display_name: string;
  username: string;
  bio: string | null;
  avatar_path: string | null;
};

export default function EditProfilePage() {
  const router = useRouter();
  const supabase = createClient();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      setLoading(true);
      setError("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/auth");
        return;
      }

      try {
        const response = await fetch(
          `/api/users/${encodeURIComponent(user.id)}`,
          {
            cache: "no-store",
          },
        );

        const data = await response.json();

        if (!response.ok) {
          if (active) {
            setError(data.error ?? "Unable to load your profile.");
          }
          return;
        }

        if (!active) return;

        const loadedProfile = data.profile as Profile;

        setProfile(loadedProfile);
        setDisplayName(loadedProfile.display_name);
        setUsername(loadedProfile.username);
        setBio(loadedProfile.bio ?? "");
      } catch {
        if (active) {
          setError("Unable to load your profile.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      active = false;
    };
  }, [router, supabase.auth]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!profile || saving) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          display_name: displayName,
          username,
          bio,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Unable to update your profile.");
        return;
      }

      setProfile(data.profile);
      setDisplayName(data.profile.display_name);
      setUsername(data.profile.username);
      setBio(data.profile.bio ?? "");
      setSuccess("Profile updated.");

      window.setTimeout(() => {
        router.push(`/profile/${profile.id}`);
      }, 500);
    } catch {
      setError("Unable to update your profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f5f1] text-[#17191c]">
      <div className="mx-auto min-h-screen w-full max-w-2xl px-4 py-5 sm:px-6">
        <header className="mb-6 flex items-center justify-between">
          <Link
            href={profile ? `/profile/${profile.id}` : "/home"}
            className="inline-flex items-center gap-2 rounded-full border border-[#deddd7] bg-white px-4 py-2 text-sm font-medium transition hover:border-[#b9c7ea] hover:bg-[#f9fbff]"
          >
            <ArrowLeft size={16} />
            Back
          </Link>

          <span className="text-sm font-semibold tracking-[0.14em] text-[#2148b8]">
            AGORÉ
          </span>
        </header>

        <section className="rounded-3xl border border-[#deddd7] bg-white p-6 sm:p-8">
          <div className="mb-7">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2148b8]">
              Profile
            </p>

            <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">
              Edit your profile
            </h1>

            <p className="mt-2 text-sm leading-6 text-[#74787e]">
              Keep the details people see when they find you on Agoré.
            </p>
          </div>

          {loading ? (
            <div className="animate-pulse space-y-5">
              <div className="space-y-2">
                <div className="h-4 w-24 rounded bg-[#e8e7e1]" />
                <div className="h-11 rounded-xl bg-[#e8e7e1]" />
              </div>

              <div className="space-y-2">
                <div className="h-4 w-24 rounded bg-[#e8e7e1]" />
                <div className="h-11 rounded-xl bg-[#e8e7e1]" />
              </div>

              <div className="space-y-2">
                <div className="h-4 w-24 rounded bg-[#e8e7e1]" />
                <div className="h-28 rounded-xl bg-[#e8e7e1]" />
              </div>
            </div>
          ) : error && !profile ? (
            <div>
              <p className="text-sm font-medium text-[#8d2f2f]">{error}</p>

              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mt-4 rounded-full bg-[#2148b8] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#183991]"
              >
                Retry
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="display-name"
                  className="mb-2 block text-sm font-semibold"
                >
                  Display name
                </label>

                <input
                  id="display-name"
                  name="display-name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  maxLength={80}
                  required
                  className="w-full rounded-xl border border-[#d9d8d2] bg-[#fcfcfa] px-4 py-3 text-sm outline-none transition placeholder:text-[#9b9da1] focus:border-[#2148b8] focus:ring-2 focus:ring-[#dce5ff]"
                  placeholder="Your name"
                />
              </div>

              <div>
                <label
                  htmlFor="username"
                  className="mb-2 block text-sm font-semibold"
                >
                  Username
                </label>

                <div className="flex items-center rounded-xl border border-[#d9d8d2] bg-[#fcfcfa] px-4 focus-within:border-[#2148b8] focus-within:ring-2 focus-within:ring-[#dce5ff]">
                  <span className="text-sm text-[#7d8187]">@</span>

                  <input
                    id="username"
                    name="username"
                    value={username}
                    onChange={(event) =>
                      setUsername(event.target.value.toLowerCase())
                    }
                    maxLength={30}
                    required
                    className="min-w-0 flex-1 bg-transparent px-2 py-3 text-sm outline-none"
                    placeholder="username"
                  />
                </div>

                <p className="mt-2 text-xs text-[#85898f]">
                  3–30 characters. Letters, numbers, and underscores only.
                </p>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label
                    htmlFor="bio"
                    className="block text-sm font-semibold"
                  >
                    Bio
                  </label>

                  <span className="text-xs text-[#85898f]">
                    {bio.length}/160
                  </span>
                </div>

                <textarea
                  id="bio"
                  name="bio"
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                  maxLength={160}
                  rows={5}
                  className="w-full resize-none rounded-xl border border-[#d9d8d2] bg-[#fcfcfa] px-4 py-3 text-sm leading-6 outline-none transition placeholder:text-[#9b9da1] focus:border-[#2148b8] focus:ring-2 focus:ring-[#dce5ff]"
                  placeholder="Tell people a little about yourself."
                />
              </div>

              {error ? (
                <div className="rounded-xl border border-[#ead1d1] bg-[#fff7f7] px-4 py-3">
                  <p className="text-sm font-medium text-[#8d2f2f]">
                    {error}
                  </p>
                </div>
              ) : null}

              {success ? (
                <div className="rounded-xl border border-[#d4e5d8] bg-[#f5fbf6] px-4 py-3">
                  <p className="text-sm font-medium text-[#316b3c]">
                    {success}
                  </p>
                </div>
              ) : null}

              <div className="flex justify-end border-t border-[#ebeae5] pt-5">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-full bg-[#2148b8] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#183991] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Save size={16} />
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}