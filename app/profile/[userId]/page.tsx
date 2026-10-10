"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  Ban,
  Check,
  Copy,
  Edit3,
  ExternalLink,
  Flag,
  Loader2,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Settings,
  Share2,
  ShieldOff,
  UserPlus,
} from "lucide-react";

import { createClient } from "@/lib/supabase/browser";
import AgoreAvatar from "@/components/agore-avatar";
import VerificationBadge from "@/components/verification-badge";
import ProfilePosts from "./profile-posts";
import ProfileConnections from "./profile-connections";
import ProfileReportDialog from "./profile-report-dialog";

type AccountType =
  | "personal"
  | "creator"
  | "business"
  | "organization"
  | "institution";

type VerificationKind =
  | "agore_official"
  | "official"
  | "paid"
  | null;

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
  account_type: AccountType;
  verification: {
    status: "verified" | "unverified";
    kind: VerificationKind;
  };
  post_count: number;
  follower_count: number;
  following_count: number;
  is_following: boolean;
  is_blocked: boolean;
};

type ConnectionTab = "followers" | "following";

const supabase = createClient();

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
    .filter((link) => {
      try {
        const url = new URL(link.url);

        return (
          (url.protocol === "https:" ||
            url.protocol === "http:") &&
          !url.username &&
          !url.password
        );
      } catch {
        return false;
      }
    })
    .slice(0, 5);
}

export default function ProfilePage() {
  const params = useParams<{ userId: string }>();
  const router = useRouter();
  const userId = params.userId;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);

  const [actionLoading, setActionLoading] =
    useState<"follow" | "block" | null>(null);
  const [messageLoading, setMessageLoading] = useState(false);

  const [error, setError] = useState("");
  const [shareFeedback, setShareFeedback] = useState("");
  const [shareFallbackUrl, setShareFallbackUrl] = useState("");

  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [connectionsTab, setConnectionsTab] =
    useState<ConnectionTab>("followers");

  const [reportOpen, setReportOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const moreMenuRef = useRef<HTMLDivElement | null>(null);

  const loadProfile = useCallback(async () => {
    if (!userId) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/users/${encodeURIComponent(userId)}`,
        { cache: "no-store" },
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

      const {
        data: { user },
      } = await supabase.auth.getUser();

      setIsOwner(user?.id === loadedProfile.id);
    } catch {
      setError("Unable to load this profile.");
      setProfile(null);
      setIsOwner(false);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (!moreOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;

      if (
        target instanceof Node &&
        !moreMenuRef.current?.contains(target)
      ) {
        setMoreOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMoreOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [moreOpen]);

  async function toggleFollow() {
    if (
      !profile ||
      actionLoading ||
      messageLoading ||
      isOwner ||
      profile.is_blocked
    ) {
      return;
    }

    const targetProfileId = profile.id;
    const wasFollowing = profile.is_following;

    setActionLoading("follow");
    setError("");

    try {
      const response = await fetch(
        `/api/users/${encodeURIComponent(targetProfileId)}/follow`,
        {
          method: wasFollowing ? "DELETE" : "POST",
        },
      );

      const data = (await response.json().catch(() => null)) as
        | {
            error?: string;
            following?: boolean;
            changed?: boolean;
          }
        | null;

      if (!response.ok) {
        setError(
          data?.error ?? "Unable to update follow status.",
        );
        return;
      }

      const nextFollowing =
        typeof data?.following === "boolean"
          ? data.following
          : !wasFollowing;

      setProfile((current) =>
        current
          ? {
              ...current,
              is_following: nextFollowing,
              follower_count:
                data?.changed === true
                  ? nextFollowing
                    ? current.follower_count + 1
                    : Math.max(0, current.follower_count - 1)
                  : current.follower_count,
            }
          : current,
      );

      // Reconcile the displayed state with the latest server values.
      // This fetch is silent and does not trigger the page loading skeleton.
      try {
        const profileResponse = await fetch(
          `/api/users/${encodeURIComponent(targetProfileId)}`,
          { cache: "no-store" },
        );

        const profileData = await profileResponse.json();

        if (
          profileResponse.ok &&
          profileData.profile?.id === targetProfileId
        ) {
          setProfile(profileData.profile as Profile);
        }
      } catch {
        // Retain the successful follow API result if reconciliation fails.
      }
    } catch {
      setError("Unable to update follow status.");
    } finally {
      setActionLoading(null);
    }
  }

  async function toggleBlock() {
    if (!profile || actionLoading || messageLoading || isOwner) {
      return;
    }

    const wasBlocked = profile.is_blocked;

    setMoreOpen(false);
    setActionLoading("block");
    setError("");

    try {
      const response = await fetch(
        `/api/users/${encodeURIComponent(profile.id)}/block`,
        {
          method: wasBlocked ? "DELETE" : "POST",
        },
      );

      const data =
        response.status === 204 ? null : await response.json();

      if (!response.ok) {
        setError(data?.error ?? "Unable to update block status.");
        return;
      }

      if (!wasBlocked) {
        setConnectionsOpen(false);
        setReportOpen(false);
      }

      await loadProfile();
    } catch {
      setError("Unable to update block status.");
    } finally {
      setActionLoading(null);
    }
  }

  async function startDirectConversation() {
    if (
      !profile ||
      isOwner ||
      profile.is_blocked ||
      messageLoading ||
      actionLoading
    ) {
      return;
    }

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
        setError(
          data.error ?? "Unable to start the conversation.",
        );
        return;
      }

      if (!data.conversation?.id) {
        setError("The conversation could not be opened.");
        return;
      }

      router.push(
        `/messages/${encodeURIComponent(data.conversation.id)}`,
      );
    } catch {
      setError("Unable to start the conversation.");
    } finally {
      setMessageLoading(false);
    }
  }

  function openConnections(tab: ConnectionTab) {
    if (!profile || profile.is_blocked) {
      return;
    }

    setConnectionsTab(tab);
    setConnectionsOpen(true);
  }

  function openReport() {
    if (!profile || isOwner || profile.is_blocked) {
      return;
    }

    setMoreOpen(false);
    setError("");
    setReportOpen(true);
  }

  async function copyProfileUrl(url: string) {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard unavailable.");
      }

      await navigator.clipboard.writeText(url);
      setShareFallbackUrl("");
      setShareFeedback("Profile link copied.");
    } catch {
      setShareFallbackUrl(url);
      setShareFeedback("Copy the link below to share this profile.");
    }
  }

  async function shareProfile() {
    if (!profile) {
      return;
    }

    setMoreOpen(false);
    setError("");
    setShareFeedback("");
    setShareFallbackUrl("");

    const url =
      `${window.location.origin}/profile/${encodeURIComponent(profile.id)}`;

    const shareData = {
      title: `${profile.display_name} on Agoré`,
      text: `Visit @${profile.username} on Agoré.`,
      url,
    };

    if (typeof navigator.share === "function") {
      try {
        await navigator.share(shareData);
        setShareFeedback("Profile shared.");
        return;
      } catch (shareError) {
        if (
          shareError instanceof Error &&
          shareError.name === "AbortError"
        ) {
          return;
        }
      }
    }

    await copyProfileUrl(url);
  }

  function handleOwnPostDeleted() {
    setProfile((current) =>
      current
        ? {
            ...current,
            post_count: Math.max(
              0,
              current.post_count - 1,
            ),
          }
        : current,
    );
  }

  const safeLinks = normalizeProfileLinks(
    profile?.profile_links,
  );

  const hasProfileDetails = Boolean(
    profile?.location?.trim() || safeLinks.length > 0,
  );

  const showProfileDetails = Boolean(
    profile && !profile.is_blocked && (hasProfileDetails || isOwner),
  );

  function renderProfileDetails(headingId: string) {
    if (!profile || profile.is_blocked || !showProfileDetails) {
      return null;
    }

    return (
      <section aria-labelledby={headingId}>
        <h2
          id={headingId}
          className="text-sm font-semibold"
        >
          Profile details
        </h2>

        {profile.location?.trim() ? (
          <div className="mt-4 flex items-start gap-2.5 text-sm leading-6 text-[var(--muted-strong)]">
            <MapPin
              size={16}
              className="mt-1 shrink-0 text-[var(--muted)]"
            />
            <span className="break-words">{profile.location}</span>
          </div>
        ) : null}

        {safeLinks.length > 0 ? (
          <div className="mt-3 space-y-3">
            {safeLinks.map((link, index) => (
              <a
                key={`${link.url}-${index}`}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-w-0 items-start gap-2.5 text-sm font-medium text-[var(--accent)] transition hover:underline"
              >
                <ExternalLink
                  size={15}
                  className="mt-1 shrink-0"
                />
                <span className="min-w-0 break-words">
                  {link.label}
                </span>
              </a>
            ))}
          </div>
        ) : null}

        {!hasProfileDetails && isOwner ? (
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            Add a location or links to help people learn more about you.
          </p>
        ) : null}

        {isOwner ? (
          <Link
            href={`/profile/edit?userId=${encodeURIComponent(profile.id)}`}
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent)] transition hover:underline"
          >
            <Edit3 size={13} />
            Edit profile details
          </Link>
        ) : null}
      </section>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto w-full max-w-6xl px-4 pb-10 pt-4 sm:px-6 sm:pt-6">
        <header className="mb-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium transition hover:border-[var(--accent)]/50 hover:bg-[var(--surface-muted)]"
          >
            <ArrowLeft size={16} />
            Back
          </button>

          <div className="flex items-center gap-2">
            <Link
              href="/home"
              className="rounded-full px-3 py-2 text-sm font-semibold tracking-[0.14em] text-[var(--accent)] transition hover:bg-[var(--accent-soft)]"
            >
              AGORÉ
            </Link>

            {profile && (!profile.is_blocked || isOwner) ? (
              <div ref={moreMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setMoreOpen((current) => !current)}
                  aria-label="More profile options"
                  aria-haspopup="menu"
                  aria-expanded={moreOpen}
                  aria-controls="profile-more-menu"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-strong)] transition hover:border-[var(--accent)]/50 hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
                >
                  <MoreHorizontal size={18} />
                </button>

                {moreOpen ? (
                  <div
                    id="profile-more-menu"
                    role="menu"
                    aria-label="More profile options"
                    className="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-48 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-xl"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => void shareProfile()}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition hover:bg-[var(--surface-muted)]"
                    >
                      <Share2 size={16} />
                      Share profile
                    </button>

                    {isOwner ? (
                      <Link
                        href="/settings"
                        role="menuitem"
                        onClick={() => setMoreOpen(false)}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition hover:bg-[var(--surface-muted)]"
                      >
                        <Settings size={16} />
                        Settings
                      </Link>
                    ) : (
                      <>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => void toggleBlock()}
                          disabled={actionLoading !== null || messageLoading}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition hover:bg-[var(--danger-soft)] hover:text-[var(--danger)] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {actionLoading === "block" ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Ban size={16} />
                          )}
                          Block
                        </button>

                        <button
                          type="button"
                          role="menuitem"
                          onClick={openReport}
                          disabled={actionLoading !== null || messageLoading}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[var(--muted-strong)] transition hover:bg-[var(--danger-soft)] hover:text-[var(--danger)] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Flag size={16} />
                          Report
                        </button>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </header>

        {loading ? (
          <section
            aria-label="Loading profile"
            className="animate-pulse space-y-5 py-6"
          >
            <div className="h-20 w-20 rounded-full bg-[var(--surface-muted)]" />
            <div className="h-7 w-52 rounded bg-[var(--surface-muted)]" />
            <div className="h-4 w-36 rounded bg-[var(--surface-muted)]" />
            <div className="h-16 max-w-xl rounded bg-[var(--surface-muted)]" />
            <div className="h-16 rounded bg-[var(--surface-muted)]" />
          </section>
        ) : error && !profile ? (
          <section className="py-8">
            <p role="alert" className="text-sm font-medium text-[var(--danger)]">
              {error}
            </p>

            <button
              type="button"
              onClick={() => void loadProfile()}
              className="mt-4 rounded-full bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)]"
            >
              Retry
            </button>
          </section>
        ) : profile ? (
          <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_250px] lg:gap-10">
            <div className="min-w-0">
              <section aria-label="Profile identity">
                <div className="flex items-start gap-4 sm:gap-5">
                  <AgoreAvatar
                    avatarPath={profile.avatar_path}
                    name={profile.display_name}
                    className="h-[76px] w-[76px] shrink-0 sm:h-24 sm:w-24"
                    textClassName="text-2xl"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="break-words text-2xl font-bold tracking-[-0.035em] sm:text-[1.75rem]">
                        {profile.display_name}
                      </h1>

                      {!profile.is_blocked &&
                      profile.verification?.status === "verified" &&
                      profile.verification.kind ? (
                        <VerificationBadge
                          accountType={profile.account_type}
                          kind={profile.verification.kind}
                          size={20}
                        />
                      ) : null}

                      {profile.is_blocked ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--danger-soft)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--danger)]">
                          <Ban size={11} />
                          Blocked
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-1 break-words text-sm text-[var(--muted)]">
                      @{profile.username}
                    </p>

                    {profile.is_blocked ? null : profile.bio ? (
                      <p className="mt-4 max-w-2xl whitespace-pre-wrap break-words text-[15px] leading-7">
                        {profile.bio}
                      </p>
                    ) : (
                      <p className="mt-4 text-sm text-[var(--muted)]">
                        No bio yet.
                      </p>
                    )}
                  </div>
                </div>

                {profile.is_blocked ? null : (
                  <div className="mt-5 lg:hidden">
                    {renderProfileDetails("profile-details-heading-mobile")}
                  </div>
                )}

                <div className="mt-5 flex flex-wrap items-center gap-2">
                  {!isOwner && profile.is_blocked ? (
                    <button
                      type="button"
                      onClick={() => void toggleBlock()}
                      disabled={actionLoading !== null}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {actionLoading === "block" ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <ShieldOff size={15} />
                      )}
                      Unblock
                    </button>
                  ) : null}

                  {!isOwner && !profile.is_blocked ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void toggleFollow()}
                        disabled={actionLoading !== null || messageLoading}
                        className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                          profile.is_following
                            ? "border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-muted)]"
                            : "bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)]"
                        }`}
                      >
                        {actionLoading === "follow" ? (
                          <Loader2 size={15} className="animate-spin" />
                        ) : profile.is_following ? (
                          <Check size={15} />
                        ) : (
                          <UserPlus size={15} />
                        )}

                        {profile.is_following ? "Following" : "Follow"}
                      </button>

                      <button
                        type="button"
                        onClick={() => void startDirectConversation()}
                        disabled={actionLoading !== null || messageLoading}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-semibold transition hover:border-[var(--accent)]/50 hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-55"
                      >
                        {messageLoading ? (
                          <Loader2 size={15} className="animate-spin" />
                        ) : (
                          <MessageCircle size={15} />
                        )}
                        {messageLoading ? "Opening…" : "Message"}
                      </button>
                    </>
                  ) : null}
                </div>

                {shareFeedback ? (
                  <div
                    role="status"
                    aria-live="polite"
                    className="mt-3 text-sm text-[var(--muted-strong)]"
                  >
                    {shareFeedback}
                  </div>
                ) : null}

                {shareFallbackUrl ? (
                  <div className="mt-3 max-w-xl rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
                    <label
                      htmlFor="share-profile-url"
                      className="mb-2 block text-xs font-semibold text-[var(--muted)]"
                    >
                      Profile link
                    </label>

                    <div className="flex gap-2">
                      <input
                        id="share-profile-url"
                        readOnly
                        value={shareFallbackUrl}
                        onFocus={(event) => event.currentTarget.select()}
                        className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-xs"
                      />

                      <button
                        type="button"
                        onClick={() => void copyProfileUrl(shareFallbackUrl)}
                        aria-label="Copy profile link"
                        className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[var(--accent-strong)]"
                      >
                        <Copy size={14} />
                        Copy
                      </button>
                    </div>
                  </div>
                ) : null}

                {error ? (
                  <p
                    role="alert"
                    className="mt-3 text-sm font-medium text-[var(--danger)]"
                  >
                    {error}
                  </p>
                ) : null}
              </section>

              {profile.is_blocked ? (
                <section className="mt-7 border-t border-[var(--border)] py-7">
                  <div className="max-w-xl">
                    <h2 className="text-base font-semibold">
                      You blocked this person
                    </h2>

                    <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                      Their activity, connections and messaging actions remain
                      hidden until you unblock them.
                    </p>

                    <button
                      type="button"
                      onClick={() => void toggleBlock()}
                      disabled={actionLoading !== null}
                      className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-semibold transition hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {actionLoading === "block" ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <ShieldOff size={15} />
                      )}
                      Unblock
                    </button>
                  </div>
                </section>
              ) : (
                <>
                  <section
                    aria-label="Profile statistics"
                    className="mt-7 grid grid-cols-3 border-y border-[var(--border)]"
                  >
                    <div className="px-2 py-5 text-center sm:px-4">
                      <p className="text-xl font-bold tabular-nums">
                        {profile.post_count ?? 0}
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted)] sm:text-sm">
                        Posts
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => openConnections("followers")}
                      aria-label={`View ${profile.follower_count} followers`}
                      className="border-x border-[var(--border)] px-2 py-5 text-center transition hover:bg-[var(--surface-muted)] sm:px-4"
                    >
                      <p className="text-xl font-bold tabular-nums">
                        {profile.follower_count}
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted)] sm:text-sm">
                        Followers
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => openConnections("following")}
                      aria-label={`View ${profile.following_count} following`}
                      className="px-2 py-5 text-center transition hover:bg-[var(--surface-muted)] sm:px-4"
                    >
                      <p className="text-xl font-bold tabular-nums">
                        {profile.following_count}
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted)] sm:text-sm">
                        Following
                      </p>
                    </button>
                  </section>

                  <ProfilePosts
                    key={profile.id}
                    userId={profile.id}
                    onOwnPostDeleted={handleOwnPostDeleted}
                  />

                  <ProfileConnections
                    userId={profile.id}
                    open={connectionsOpen}
                    initialTab={connectionsTab}
                    onClose={() => setConnectionsOpen(false)}
                  />
                </>
              )}
            </div>

            <aside className="hidden min-w-0 border-l border-[var(--border)] pl-6 lg:block">
              <div className="sticky top-6 py-2">
                {renderProfileDetails("profile-details-heading-desktop")}
              </div>
            </aside>

            {!isOwner ? (
              <ProfileReportDialog
                userId={profile.id}
                displayName={profile.display_name}
                open={reportOpen}
                onClose={() => setReportOpen(false)}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}