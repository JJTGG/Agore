"use client";

import Link from "next/link";
import {
  FormEvent,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  Check,
  Loader2,
  Save,
  Trash2,
  X,
} from "lucide-react";

import AgoreAvatar from "@/components/agore-avatar";
import { createClient } from "@/lib/supabase/browser";

type Profile = {
  id: string;
  display_name: string;
  username: string;
  bio: string | null;
  avatar_path: string | null;
};

const supabase = createClient();

const MAX_AVATAR_SIZE =
  5 * 1024 * 1024;

const ALLOWED_AVATAR_TYPES =
  new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);

function getInitials(
  value: string,
) {
  return (
    value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(
        (part) =>
          part[0]?.toUpperCase() ??
          "",
      )
      .join("") || "A"
  );
}

export default function EditProfilePage() {
  const router = useRouter();

  const [profile, setProfile] =
    useState<Profile | null>(
      null,
    );

  const [displayName, setDisplayName] =
    useState("");

  const [username, setUsername] =
    useState("");

  const [bio, setBio] = useState("");

  const [avatarUrl, setAvatarUrl] =
    useState<string | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [
    avatarUploading,
    setAvatarUploading,
  ] = useState(false);

  const [
    avatarRemoving,
    setAvatarRemoving,
  ] = useState(false);

  const [
    removeAvatarConfirm,
    setRemoveAvatarConfirm,
  ] = useState(false);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  async function getSignedAvatarUrl(
    path: string | null,
  ) {
    if (!path) {
      return null;
    }

    const {
      data,
      error: signedUrlError,
    } =
      await supabase.storage
        .from("avatars")
        .createSignedUrl(
          path,
          60 * 60,
        );

    if (signedUrlError) {
      console.error(
        "Failed to create Agore avatar signed URL:",
        signedUrlError,
      );

      return null;
    }

    return data.signedUrl;
  }

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      setLoading(true);
      setError("");

      const {
        data: { user },
      } =
        await supabase.auth.getUser();

      if (!user) {
        router.replace("/auth");
        return;
      }

      try {
        const response =
          await fetch(
            `/api/users/${encodeURIComponent(
              user.id,
            )}`,
            {
              cache: "no-store",
            },
          );

        const data =
          await response.json();

        if (!response.ok) {
          if (active) {
            setError(
              data.error ??
                "Unable to load your profile.",
            );
          }

          return;
        }

        if (!active) {
          return;
        }

        const loadedProfile =
          data.profile as Profile;

        setProfile(
          loadedProfile,
        );

        setDisplayName(
          loadedProfile.display_name,
        );

        setUsername(
          loadedProfile.username,
        );

        setBio(
          loadedProfile.bio ?? "",
        );

        const signedUrl =
          await getSignedAvatarUrl(
            loadedProfile.avatar_path,
          );

        if (active) {
          setAvatarUrl(
            signedUrl,
          );
        }
      } catch {
        if (active) {
          setError(
            "Unable to load your profile.",
          );
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
  }, [router]);

  async function handleAvatarChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file =
      event.target.files?.[0];

    event.target.value = "";

    if (
      !file ||
      avatarUploading ||
      avatarRemoving
    ) {
      return;
    }

    setError("");
    setSuccess("");
    setRemoveAvatarConfirm(false);

    if (
      !ALLOWED_AVATAR_TYPES.has(
        file.type,
      )
    ) {
      setError(
        "Avatar must be a JPEG, PNG, or WebP image.",
      );
      return;
    }

    if (file.size <= 0) {
      setError(
        "The selected image is empty.",
      );
      return;
    }

    if (
      file.size >
      MAX_AVATAR_SIZE
    ) {
      setError(
        "Avatar must be 5 MB or smaller.",
      );
      return;
    }

    setAvatarUploading(true);

    try {
      const formData =
        new FormData();

      formData.append(
        "file",
        file,
      );

      const response =
        await fetch(
          "/api/profile/avatar",
          {
            method: "POST",
            body: formData,
          },
        );

      const data =
        await response.json();

      if (
        response.status ===
        401
      ) {
        router.replace("/auth");
        return;
      }

      if (!response.ok) {
        setError(
          data.error ??
            "Unable to upload your avatar.",
        );
        return;
      }

      if (!data.profile) {
        setError(
          "Avatar uploaded, but the updated profile was not returned.",
        );
        return;
      }

      const updatedProfile =
        data.profile as Profile;

      setProfile(
        updatedProfile,
      );

      const signedUrl =
        await getSignedAvatarUrl(
          updatedProfile.avatar_path,
        );

      setAvatarUrl(
        signedUrl,
      );

      setSuccess(
        "Profile photo updated.",
      );
    } catch {
      setError(
        "Unable to upload your avatar.",
      );
    } finally {
      setAvatarUploading(
        false,
      );
    }
  }

  async function handleAvatarRemove() {
    if (
      !profile?.avatar_path ||
      avatarUploading ||
      avatarRemoving
    ) {
      return;
    }

    setAvatarRemoving(true);
    setError("");
    setSuccess("");

    try {
      const response =
        await fetch(
          "/api/profile/avatar",
          {
            method: "DELETE",
          },
        );

      const data =
        await response.json();

      if (
        response.status ===
        401
      ) {
        router.replace("/auth");
        return;
      }

      if (!response.ok) {
        setError(
          data.error ??
            "Unable to remove your profile photo.",
        );
        return;
      }

      if (!data.profile) {
        setError(
          "Your profile photo was removed, but the updated profile was not returned.",
        );
        setAvatarUrl(null);
        return;
      }

      const updatedProfile =
        data.profile as Profile;

      setProfile(
        updatedProfile,
      );

      setAvatarUrl(null);
      setRemoveAvatarConfirm(
        false,
      );

      setSuccess(
        "Profile photo removed.",
      );
    } catch {
      setError(
        "Unable to remove your profile photo.",
      );
    } finally {
      setAvatarRemoving(
        false,
      );
    }
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      !profile ||
      saving ||
      avatarUploading ||
      avatarRemoving
    ) {
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response =
        await fetch(
          "/api/profile",
          {
            method: "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              display_name:
                displayName,
              username,
              bio,
            }),
          },
        );

      const data =
        await response.json();

      if (!response.ok) {
        setError(
          data.error ??
            "Unable to update your profile.",
        );
        return;
      }

      const updatedProfile =
        data.profile as Profile;

      setProfile(
        updatedProfile,
      );

      setDisplayName(
        updatedProfile.display_name,
      );

      setUsername(
        updatedProfile.username,
      );

      setBio(
        updatedProfile.bio ?? "",
      );

      setSuccess(
        "Profile updated.",
      );

      window.setTimeout(
        () => {
          router.push(
            `/profile/${profile.id}`,
          );
        },
        500,
      );
    } catch {
      setError(
        "Unable to update your profile.",
      );
    } finally {
      setSaving(false);
    }
  }

  const previewName =
    displayName.trim() ||
    profile?.display_name ||
    "Agoré user";

  const previewUsername =
    username.trim() ||
    profile?.username ||
    "username";

  const initials =
    getInitials(
      previewName,
    );

  const hasProfileChanges =
    profile !== null &&
    (displayName.trim() !==
      profile.display_name ||
      username.trim().toLowerCase() !==
        profile.username ||
      bio.trim() !==
        (profile.bio ?? ""));

  const avatarBusy =
    avatarUploading ||
    avatarRemoving;

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto min-h-screen w-full max-w-2xl px-4 py-5 sm:px-6 sm:py-8">
        <header className="mb-6 flex items-center justify-between gap-3">
          <Link
            href={
              profile
                ? `/profile/${profile.id}`
                : "/home"
            }
            className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--accent)]/40 hover:bg-[var(--surface-muted)]"
          >
            <ArrowLeft size={16} />
            Back
          </Link>

          <span className="text-sm font-bold tracking-[0.16em] text-[var(--accent)]">
            AGORÉ
          </span>
        </header>

        <section className="overflow-hidden rounded-[1.75rem] border border-[var(--border)] bg-[var(--surface)] shadow-[0_12px_40px_rgba(0,0,0,0.05)]">
          <div className="border-b border-[var(--border)] px-5 py-6 sm:px-7">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
              Profile
            </p>

            <h1 className="mt-2 text-2xl font-bold tracking-[-0.03em]">
              Edit your profile
            </h1>

            <p className="mt-2 max-w-lg text-sm leading-6 text-[var(--muted)]">
              Update the identity people see when they find you across Agoré.
            </p>
          </div>

          <div className="border-b border-[var(--border)] bg-[var(--surface-raised)] px-5 py-5 sm:px-7">
            <div className="flex items-start gap-4">
              <div className="relative shrink-0">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt=""
                    className="h-20 w-20 rounded-full border border-[var(--border)] object-cover"
                  />
                ) : (
                  <AgoreAvatar
                    avatarPath={
                      null
                    }
                    name={previewName}
                    className="h-20 w-20"
                    textClassName="text-xl"
                  />
                )}

                {avatarBusy ? (
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white">
                    <Loader2
                      size={21}
                      className="animate-spin"
                    />
                  </div>
                ) : null}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-bold">
                  {previewName}
                </p>

                <p className="mt-0.5 truncate text-sm text-[var(--muted)]">
                  @{previewUsername}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label
                    htmlFor="avatar"
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2 text-xs font-semibold transition hover:border-[var(--accent)]/40 hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] ${
                      avatarBusy
                        ? "pointer-events-none opacity-55"
                        : ""
                    }`}
                  >
                    {avatarUploading ? (
                      <Loader2
                        size={14}
                        className="animate-spin"
                      />
                    ) : (
                      <Camera
                        size={14}
                      />
                    )}

                    {avatarUploading
                      ? "Uploading…"
                      : "Change photo"}
                  </label>

                  {profile?.avatar_path ? (
                    <button
                      type="button"
                      onClick={() =>
                        setRemoveAvatarConfirm(
                          true,
                        )
                      }
                      disabled={
                        avatarBusy
                      }
                      className="inline-flex items-center gap-2 rounded-full border border-[var(--danger)]/20 bg-[var(--danger-soft)] px-3.5 py-2 text-xs font-semibold text-[var(--danger)] transition hover:border-[var(--danger)]/40 hover:bg-[var(--danger)]/10 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <Trash2
                        size={14}
                      />
                      Remove photo
                    </button>
                  ) : null}
                </div>

                {removeAvatarConfirm ? (
                  <div className="mt-3 max-w-sm rounded-2xl border border-[var(--danger)]/20 bg-[var(--danger-soft)] px-3.5 py-3">
                    <p className="text-xs font-semibold text-[var(--danger)]">
                      Remove your current profile photo?
                    </p>

                    <div className="mt-2.5 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          void handleAvatarRemove()
                        }
                        disabled={
                          avatarBusy
                        }
                        className="inline-flex items-center gap-1.5 rounded-full bg-[var(--danger)] px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {avatarRemoving ? (
                          <Loader2
                            size={13}
                            className="animate-spin"
                          />
                        ) : (
                          <Trash2
                            size={13}
                          />
                        )}

                        {avatarRemoving
                          ? "Removing…"
                          : "Remove"}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setRemoveAvatarConfirm(
                            false,
                          )
                        }
                        disabled={
                          avatarBusy
                        }
                        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] transition hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <X
                          size={13}
                        />
                        Keep it
                      </button>
                    </div>
                  </div>
                ) : null}

                <p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">
                  JPEG, PNG, or WebP · maximum 5 MB
                </p>

                <p className="mt-0.5 text-[11px] leading-5 text-[var(--muted)]">
                  Photo changes are saved immediately.
                </p>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="space-y-5 px-5 py-6 sm:px-7">
              <div className="space-y-2">
                <div className="h-4 w-24 animate-pulse rounded bg-[var(--surface-muted)]" />
                <div className="h-11 animate-pulse rounded-xl bg-[var(--surface-muted)]" />
              </div>

              <div className="space-y-2">
                <div className="h-4 w-24 animate-pulse rounded bg-[var(--surface-muted)]" />
                <div className="h-11 animate-pulse rounded-xl bg-[var(--surface-muted)]" />
              </div>

              <div className="space-y-2">
                <div className="h-4 w-16 animate-pulse rounded bg-[var(--surface-muted)]" />
                <div className="h-28 animate-pulse rounded-xl bg-[var(--surface-muted)]" />
              </div>

              <div className="h-12 animate-pulse rounded-full bg-[var(--surface-muted)]" />
            </div>
          ) : error &&
            !profile ? (
            <div className="px-5 py-8 sm:px-7">
              <div className="rounded-2xl border border-[var(--danger)]/20 bg-[var(--danger-soft)] px-4 py-3">
                <p className="text-sm font-semibold leading-5 text-[var(--danger)]">
                  {error}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  window.location.reload()
                }
                className="mt-4 inline-flex rounded-full bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)]"
              >
                Retry
              </button>
            </div>
          ) : profile ? (
            <form
              onSubmit={
                handleSubmit
              }
              className="px-5 py-6 sm:px-7"
            >
              <div className="space-y-5">
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
                    value={
                      displayName
                    }
                    onChange={(
                      event,
                    ) =>
                      setDisplayName(
                        event.target
                          .value,
                      )
                    }
                    maxLength={80}
                    required
                    disabled={
                      saving
                    }
                    autoComplete="name"
                    className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3 text-sm outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)]/50 focus:ring-4 focus:ring-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-55"
                    placeholder="Your name"
                  />

                  <p className="mt-2 text-[11px] text-[var(--muted)]">
                    This is the name people will see on your profile and posts.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="username"
                    className="mb-2 block text-sm font-semibold"
                  >
                    Username
                  </label>

                  <div className="flex items-center rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] px-4 transition focus-within:border-[var(--accent)]/50 focus-within:ring-4 focus-within:ring-[var(--accent-soft)]">
                    <span className="shrink-0 text-sm font-medium text-[var(--muted)]">
                      @
                    </span>

                    <input
                      id="username"
                      name="username"
                      value={
                        username
                      }
                      onChange={(
                        event,
                      ) =>
                        setUsername(
                          event.target.value.toLowerCase(),
                        )
                      }
                      maxLength={30}
                      minLength={3}
                      required
                      disabled={
                        saving
                      }
                      autoComplete="username"
                      spellCheck={
                        false
                      }
                      className="min-w-0 flex-1 bg-transparent px-2 py-3 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-55"
                      placeholder="username"
                    />
                  </div>

                  <p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">
                    3–30 characters · letters, numbers, and underscores only.
                  </p>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <label
                      htmlFor="bio"
                      className="block text-sm font-semibold"
                    >
                      Bio
                    </label>

                    <span
                      className={`text-[11px] font-medium ${
                        bio.length >=
                        160
                          ? "text-[var(--danger)]"
                          : "text-[var(--muted)]"
                      }`}
                    >
                      {bio.length}/160
                    </span>
                  </div>

                  <textarea
                    id="bio"
                    name="bio"
                    value={bio}
                    onChange={(
                      event,
                    ) =>
                      setBio(
                        event.target
                          .value,
                      )
                    }
                    maxLength={160}
                    rows={5}
                    disabled={
                      saving
                    }
                    className="w-full resize-none rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3 text-sm leading-6 outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)]/50 focus:ring-4 focus:ring-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-55"
                    placeholder="Tell people a little about yourself."
                  />

                  <p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">
                    Keep it useful and recognizable. Your bio appears directly beneath your username.
                  </p>
                </div>
              </div>

              {error ? (
                <div className="mt-5 rounded-2xl border border-[var(--danger)]/20 bg-[var(--danger-soft)] px-4 py-3">
                  <p className="text-sm font-semibold leading-5 text-[var(--danger)]">
                    {error}
                  </p>
                </div>
              ) : null}

              {success ? (
                <div className="mt-5 rounded-2xl border border-[var(--success)]/20 bg-[var(--success-soft)] px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Check
                      size={15}
                      className="shrink-0 text-[var(--success)]"
                    />

                    <p className="text-sm font-semibold text-[var(--success)]">
                      {success}
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="mt-6 flex flex-col-reverse gap-2 border-t border-[var(--border)] pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[11px] leading-5 text-[var(--muted)]">
                  {hasProfileChanges
                    ? "You have unsaved changes."
                    : "Your profile is up to date."}
                </p>

                <div className="flex items-center justify-end gap-2">
                  <Link
                    href={`/profile/${profile.id}`}
                    className="inline-flex items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--surface-muted)]"
                  >
                    Cancel
                  </Link>

                  <button
                    type="submit"
                    disabled={
                      saving ||
                      avatarBusy ||
                      !hasProfileChanges
                    }
                    className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {saving ? (
                      <Loader2
                        size={16}
                        className="animate-spin"
                      />
                    ) : (
                      <Save
                        size={16}
                      />
                    )}

                    {saving
                      ? "Saving…"
                      : "Save changes"}
                  </button>
                </div>
              </div>
            </form>
          ) : null}
        </section>

        {profile ? (
          <section className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5">
            <p className="text-[11px] leading-5 text-[var(--muted)]">
              Your profile photo is saved immediately when uploaded or removed. Name, username, and bio are saved together when you press Save changes.
            </p>
          </section>
        ) : null}
      </div>
    </main>
  );
}