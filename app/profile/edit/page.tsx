"use client";

import Link from "next/link";
import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  Check,
  ExternalLink,
  Loader2,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";

import AgoreAvatar from "@/components/agore-avatar";
import { createClient } from "@/lib/supabase/browser";

type ProfileLink = {
  label: string;
  url: string;
};

type Profile = {
  id: string;
  display_name: string;
  username: string;
  bio: string | null;
  avatar_path: string | null;
  location?: string | null;
  profile_links?: unknown;
};

const supabase = createClient();

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

const ALLOWED_AVATAR_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function normalizeProfileLinks(value: unknown): ProfileLink[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" &&
        item !== null &&
        !Array.isArray(item),
    )
    .filter(
      (item) =>
        typeof item.label === "string" &&
        typeof item.url === "string",
    )
    .map((item) => ({
      label: item.label as string,
      url: item.url as string,
    }))
    .slice(0, 5);
}

function cleanProfileLinks(links: ProfileLink[]): ProfileLink[] {
  return links
    .filter(
      (link) =>
        link.label.trim().length > 0 ||
        link.url.trim().length > 0,
    )
    .map((link) => ({
      label: link.label.trim(),
      url: link.url.trim(),
    }));
}

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

export default function EditProfilePage() {
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [profileLinks, setProfileLinks] = useState<ProfileLink[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarRemoving, setAvatarRemoving] = useState(false);
  const [removeAvatarConfirm, setRemoveAvatarConfirm] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const avatarBusy = avatarUploading || avatarRemoving;

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      setLoading(true);
      setError("");

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.replace("/auth");
          return;
        }

        const response = await fetch(
          `/api/users/${encodeURIComponent(user.id)}`,
          { cache: "no-store" },
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ?? "Unable to load your profile.",
          );
        }

        if (!active) {
          return;
        }

        const loadedProfile = data.profile as Profile;

        setProfile(loadedProfile);
        setDisplayName(loadedProfile.display_name ?? "");
        setUsername(loadedProfile.username ?? "");
        setBio(loadedProfile.bio ?? "");
        setLocation(loadedProfile.location ?? "");
        setProfileLinks(
          normalizeProfileLinks(loadedProfile.profile_links),
        );
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load your profile.",
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
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const input = event.currentTarget;
    const file = input.files?.[0] ?? null;

    // Allow the same file to be selected again after an error.
    input.value = "";

    if (!file || !profile || saving || avatarBusy) {
      return;
    }

    setError("");
    setSuccess("");
    setRemoveAvatarConfirm(false);

    if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
      setError("Choose a JPEG, PNG, or WebP image.");
      return;
    }

    if (file.size <= 0) {
      setError("The selected image is empty.");
      return;
    }

    if (file.size > MAX_AVATAR_SIZE) {
      setError("Your profile photo must be 5 MB or smaller.");
      return;
    }

    setAvatarUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/profile/avatar", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (response.status === 401) {
        router.replace("/auth");
        return;
      }

      if (!response.ok) {
        setError(data.error ?? "Unable to upload your profile photo.");
        return;
      }

      if (!data.profile || typeof data.profile.avatar_path !== "string") {
        setError(
          "The upload response did not include the saved profile photo.",
        );
        return;
      }

      setProfile((current) =>
        current
          ? {
              ...current,
              avatar_path: data.profile.avatar_path,
            }
          : current,
      );

      setSuccess(
        data.storage_cleanup_pending
          ? "Profile photo updated. Previous-photo cleanup is still pending."
          : "Profile photo updated.",
      );

      router.refresh();
    } catch {
      setError("Unable to upload your profile photo. Please try again.");
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleAvatarRemove() {
    if (!profile?.avatar_path || saving || avatarBusy) {
      return;
    }

    setAvatarRemoving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/profile/avatar", {
        method: "DELETE",
      });

      const data = await response.json();

      if (response.status === 401) {
        router.replace("/auth");
        return;
      }

      if (!response.ok) {
        setError(
          data.error ?? "Unable to remove your profile photo.",
        );
        return;
      }

      setProfile((current) =>
        current
          ? {
              ...current,
              avatar_path: null,
            }
          : current,
      );

      setRemoveAvatarConfirm(false);

      setSuccess(
        data.storage_cleanup_pending
          ? "Profile photo removed. Storage cleanup is still pending."
          : "Profile photo removed.",
      );

      router.refresh();
    } catch {
      setError("Unable to remove your profile photo. Please try again.");
    } finally {
      setAvatarRemoving(false);
    }
  }

  function updateProfileLink(
    index: number,
    field: keyof ProfileLink,
    value: string,
  ) {
    setProfileLinks((current) =>
      current.map((link, linkIndex) =>
        linkIndex === index
          ? { ...link, [field]: value }
          : link,
      ),
    );
  }

  function addProfileLink() {
    if (profileLinks.length >= 5 || saving || avatarBusy) {
      return;
    }

    setProfileLinks((current) => [
      ...current,
      { label: "", url: "" },
    ]);
  }

  function removeProfileLink(index: number) {
    if (saving || avatarBusy) {
      return;
    }

    setProfileLinks((current) =>
      current.filter((_, linkIndex) => linkIndex !== index),
    );
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!profile || saving || avatarBusy) {
      return;
    }

    setError("");
    setSuccess("");

    const cleanedLinks = cleanProfileLinks(profileLinks);

    for (const link of cleanedLinks) {
      if (!link.label) {
        setError("Add a label to every profile link.");
        return;
      }

      if (link.label.length > 40) {
        setError("Profile link labels must be 40 characters or fewer.");
        return;
      }

      if (link.url.length > 2048 || !isAllowedProfileUrl(link.url)) {
        setError(
          "Each profile link must be a valid HTTP or HTTPS URL without embedded credentials.",
        );
        return;
      }
    }

    if (location.trim().length > 100) {
      setError("Location must be 100 characters or fewer.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          display_name: displayName.trim(),
          username: username.trim().toLowerCase(),
          bio: bio.trim() || null,
          location: location.trim() || null,
          profile_links: cleanedLinks,
        }),
      });

      const data = await response.json();

      if (response.status === 401) {
        router.replace("/auth");
        return;
      }

      if (!response.ok) {
        setError(data.error ?? "Unable to update your profile.");
        return;
      }

      if (!data.profile) {
        setError("The server did not return the updated profile.");
        return;
      }

      const updatedProfile = data.profile as Profile;

      setProfile(updatedProfile);
      setDisplayName(updatedProfile.display_name ?? "");
      setUsername(updatedProfile.username ?? "");
      setBio(updatedProfile.bio ?? "");
      setLocation(updatedProfile.location ?? "");
      setProfileLinks(
        normalizeProfileLinks(updatedProfile.profile_links),
      );

      setSuccess("Profile updated.");

      window.setTimeout(() => {
        router.push(`/profile/${updatedProfile.id}`);
      }, 500);
    } catch {
      setError("Unable to update your profile. Please try again.");
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

  const originalLinks = normalizeProfileLinks(
    profile?.profile_links,
  );

  const currentLinks = cleanProfileLinks(profileLinks);

  const hasProfileChanges =
    profile !== null &&
    (displayName.trim() !== profile.display_name ||
      username.trim().toLowerCase() !== profile.username ||
      bio.trim() !== (profile.bio ?? "") ||
      location.trim() !== (profile.location ?? "") ||
      JSON.stringify(currentLinks) !== JSON.stringify(originalLinks));

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto min-h-screen w-full max-w-2xl px-4 py-5 sm:px-6 sm:py-8">
        <header className="mb-6 flex items-center justify-between gap-3">
          <Link
            href={profile ? `/profile/${profile.id}` : "/home"}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium transition hover:border-[var(--accent)]/40 hover:bg-[var(--surface-muted)]"
          >
            <ArrowLeft size={16} />
            Back
          </Link>

          <Link
            href="/home"
            className="rounded-full px-3 py-2 text-sm font-bold tracking-[0.16em] text-[var(--accent)] transition hover:bg-[var(--accent-soft)]"
          >
            AGORÉ
          </Link>
        </header>

        {loading ? (
          <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <div className="animate-pulse space-y-5">
              <div className="h-7 w-48 rounded bg-[var(--surface-muted)]" />
              <div className="h-4 w-64 max-w-full rounded bg-[var(--surface-muted)]" />
              <div className="h-20 w-20 rounded-full bg-[var(--surface-muted)]" />
              <div className="h-12 rounded-xl bg-[var(--surface-muted)]" />
              <div className="h-12 rounded-xl bg-[var(--surface-muted)]" />
              <div className="h-28 rounded-xl bg-[var(--surface-muted)]" />
            </div>
          </section>
        ) : null}

        {!loading && !profile ? (
          <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <h1 className="text-xl font-bold">Your profile could not be loaded</h1>

            <p className="mt-3 text-sm leading-6 text-[var(--danger)]">
              {error || "Please sign in and try again."}
            </p>

            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 rounded-full bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)]"
            >
              Try again
            </button>
          </section>
        ) : null}

        {!loading && profile ? (
          <section className="overflow-hidden rounded-[1.75rem] border border-[var(--border)] bg-[var(--surface)]">
            <div className="border-b border-[var(--border)] px-5 py-6 sm:px-7">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
                Profile
              </p>

              <h1 className="mt-2 text-2xl font-bold tracking-[-0.03em]">
                Edit your profile
              </h1>

              <p className="mt-2 max-w-lg text-sm leading-6 text-[var(--muted)]">
                Update the information people see when they visit your profile.
              </p>
            </div>

            <div className="border-b border-[var(--border)] bg-[var(--surface-raised)] px-5 py-5 sm:px-7">
              <div className="flex items-start gap-4">
                <div className="relative shrink-0">
                  <AgoreAvatar
                    avatarPath={profile.avatar_path}
                    name={previewName}
                    className="h-20 w-20"
                    textClassName="text-xl"
                    refreshKey={profile.avatar_path ?? "no-avatar"}
                  />

                  {avatarBusy ? (
                    <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white">
                      <Loader2 size={21} className="animate-spin" />
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

                  {/* This real file input connects the visible label to
                      the Android/browser image picker. */}
                  <input
                    id="avatar"
                    name="avatar"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => void handleAvatarChange(event)}
                    disabled={saving || avatarBusy}
                    className="sr-only"
                    aria-label="Choose a profile photo"
                  />

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <label
                      htmlFor="avatar"
                      className={`inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2 text-xs font-semibold transition hover:border-[var(--accent)]/40 hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] ${
                        saving || avatarBusy
                          ? "pointer-events-none opacity-55"
                          : "cursor-pointer"
                      }`}
                    >
                      {avatarUploading ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Camera size={14} />
                      )}

                      {avatarUploading ? "Uploading…" : "Choose photo"}
                    </label>

                    {profile.avatar_path ? (
                      <button
                        type="button"
                        onClick={() => {
                          setError("");
                          setSuccess("");
                          setRemoveAvatarConfirm(true);
                        }}
                        disabled={saving || avatarBusy}
                        className="inline-flex items-center gap-2 rounded-full border border-[var(--danger)]/20 bg-[var(--danger-soft)] px-3.5 py-2 text-xs font-semibold text-[var(--danger)] transition hover:border-[var(--danger)]/40 hover:bg-[var(--danger)]/10 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <Trash2 size={14} />
                        Remove photo
                      </button>
                    ) : null}
                  </div>

                  {removeAvatarConfirm ? (
                    <div className="mt-3 max-w-sm rounded-2xl border border-[var(--danger)]/20 bg-[var(--danger-soft)] px-3.5 py-3">
                      <p className="text-xs font-semibold text-[var(--danger)]">
                        Remove your current profile photo?
                      </p>

                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleAvatarRemove()}
                          disabled={saving || avatarBusy}
                          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--danger)] px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          {avatarRemoving ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Trash2 size={13} />
                          )}

                          {avatarRemoving ? "Removing…" : "Confirm removal"}
                        </button>

                        <button
                          type="button"
                          onClick={() => setRemoveAvatarConfirm(false)}
                          disabled={avatarBusy}
                          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold transition hover:bg-[var(--surface-muted)] disabled:opacity-45"
                        >
                          <X size={13} />
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">
                    JPEG, PNG or WebP · maximum 5 MB.
                  </p>

                  <p className="mt-0.5 text-[11px] leading-5 text-[var(--muted)]">
                    Your photo is uploaded immediately and saved to your profile.
                  </p>
                </div>
              </div>
            </div>

            <form
              onSubmit={(event) => void handleSubmit(event)}
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
                    name="display_name"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    maxLength={80}
                    required
                    disabled={saving || avatarBusy}
                    autoComplete="name"
                    className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]/50 focus:ring-4 focus:ring-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-55"
                    placeholder="Your name"
                  />

                  <p className="mt-2 text-[11px] text-[var(--muted)]">
                    This name appears on your profile and posts.
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
                      value={username}
                      onChange={(event) =>
                        setUsername(event.target.value.toLowerCase())
                      }
                      maxLength={30}
                      minLength={3}
                      required
                      disabled={saving || avatarBusy}
                      autoComplete="username"
                      spellCheck={false}
                      className="min-w-0 flex-1 bg-transparent px-2 py-3 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-55"
                      placeholder="username"
                    />
                  </div>

                  <p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">
                    3–30 characters: letters, numbers and underscores.
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
                        bio.length >= 160
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
                    onChange={(event) => setBio(event.target.value)}
                    maxLength={160}
                    rows={4}
                    disabled={saving || avatarBusy}
                    className="w-full resize-y rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3 text-sm leading-6 outline-none transition focus:border-[var(--accent)]/50 focus:ring-4 focus:ring-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-55"
                    placeholder="Tell people a little about yourself."
                  />
                </div>
              </div>

              <div className="my-7 border-t border-[var(--border)]" />

              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--accent)]">
                  Profile details
                </p>

                <h2 className="mt-2 text-lg font-bold">
                  Optional profile details · Links
                </h2>

                <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                  Add a location and useful links. Leave either section empty if
                  you prefer not to share it.
                </p>

                <div className="mt-5">
                  <label
                    htmlFor="location"
                    className="mb-2 block text-sm font-semibold"
                  >
                    Location
                  </label>

                  <input
                    id="location"
                    name="location"
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                    maxLength={100}
                    disabled={saving || avatarBusy}
                    autoComplete="address-level2"
                    className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]/50 focus:ring-4 focus:ring-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-55"
                    placeholder="City, region or country (optional)"
                  />

                  <p className="mt-2 text-[11px] text-[var(--muted)]">
                    Maximum 100 characters.
                  </p>
                </div>

                <div className="mt-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">
                        Links
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                        Website, portfolio or other public pages.
                      </p>
                    </div>

                    <span className="shrink-0 text-xs tabular-nums text-[var(--muted)]">
                      {profileLinks.length}/5
                    </span>
                  </div>

                  {profileLinks.length === 0 ? (
                    <div className="mt-3 rounded-2xl border border-dashed border-[var(--border)] px-4 py-5">
                      <p className="text-sm text-[var(--muted)]">
                        No profile links added.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {profileLinks.map((link, index) => (
                        <div
                          key={index}
                          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-3 sm:p-4"
                        >
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <p className="text-xs font-semibold text-[var(--muted)]">
                              Link {index + 1}
                            </p>

                            <button
                              type="button"
                              onClick={() => removeProfileLink(index)}
                              disabled={saving || avatarBusy}
                              aria-label={`Remove link ${index + 1}`}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--danger-soft)] hover:text-[var(--danger)] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>

                          <div className="space-y-3">
                            <div>
                              <label
                                htmlFor={`profile-link-label-${index}`}
                                className="mb-1.5 block text-xs font-medium"
                              >
                                Label
                              </label>

                              <input
                                id={`profile-link-label-${index}`}
                                value={link.label}
                                onChange={(event) =>
                                  updateProfileLink(
                                    index,
                                    "label",
                                    event.target.value,
                                  )
                                }
                                maxLength={40}
                                disabled={saving || avatarBusy}
                                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm outline-none transition focus:border-[var(--accent)]/50 focus:ring-4 focus:ring-[var(--accent-soft)] disabled:opacity-55"
                                placeholder="e.g. Portfolio"
                              />
                            </div>

                            <div>
                              <label
                                htmlFor={`profile-link-url-${index}`}
                                className="mb-1.5 block text-xs font-medium"
                              >
                                URL
                              </label>

                              <input
                                id={`profile-link-url-${index}`}
                                type="url"
                                inputMode="url"
                                autoCapitalize="none"
                                autoCorrect="off"
                                spellCheck={false}
                                value={link.url}
                                onChange={(event) =>
                                  updateProfileLink(
                                    index,
                                    "url",
                                    event.target.value,
                                  )
                                }
                                maxLength={2048}
                                disabled={saving || avatarBusy}
                                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm outline-none transition focus:border-[var(--accent)]/50 focus:ring-4 focus:ring-[var(--accent-soft)] disabled:opacity-55"
                                placeholder="https://example.com"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {profileLinks.length < 5 ? (
                    <button
                      type="button"
                      onClick={addProfileLink}
                      disabled={saving || avatarBusy}
                      className="mt-3 inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-4 py-2.5 text-sm font-semibold transition hover:border-[var(--accent)]/40 hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <Plus size={16} />
                      Add a link
                    </button>
                  ) : (
                    <p className="mt-3 text-xs text-[var(--muted)]">
                      You have reached the five-link limit.
                    </p>
                  )}

                  <p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">
                    Labels are limited to 40 characters. Links must begin with
                    http:// or https://. URLs with embedded credentials are not
                    allowed.
                  </p>
                </div>
              </div>

              {error ? (
                <div
                  role="alert"
                  className="mt-5 rounded-2xl border border-[var(--danger)]/20 bg-[var(--danger-soft)] px-4 py-3"
                >
                  <p className="text-sm font-semibold leading-5 text-[var(--danger)]">
                    {error}
                  </p>
                </div>
              ) : null}

              {success ? (
                <div
                  role="status"
                  className="mt-5 rounded-2xl border border-[var(--success)]/20 bg-[var(--success-soft)] px-4 py-3"
                >
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

              <div className="mt-6 flex flex-col-reverse gap-3 border-t border-[var(--border)] pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[11px] leading-5 text-[var(--muted)]">
                  {hasProfileChanges
                    ? "You have unsaved changes."
                    : "Your profile is up to date."}
                </p>

                <div className="flex items-center justify-end gap-2">
                  <Link
                    href={`/profile/${profile.id}`}
                    className="inline-flex items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-semibold transition hover:bg-[var(--surface-muted)]"
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
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {saving ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Save size={16} />
                    )}

                    {saving ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </div>
            </form>
          </section>
        ) : null}

        {profile ? (
          <section className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5">
            <p className="text-[11px] leading-5 text-[var(--muted)]">
              Your photo uploads or removals are saved immediately. Your name,
              username, bio, location and links are saved together when you
              choose Save changes.
            </p>
          </section>
        ) : null}
      </div>
    </main>
  );
}