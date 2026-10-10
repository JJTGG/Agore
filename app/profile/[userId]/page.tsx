"use client";

import Link from "next/link";
import {
  useParams,
  useRouter,
} from "next/navigation";
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
  Edit3,
  Flag,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Settings,
  ShieldOff,
  UserPlus,
} from "lucide-react";

import { createClient } from "@/lib/supabase/browser";
import AgoreAvatar from "@/components/agore-avatar";
import VerificationBadge from "@/components/verification-badge";
import ProfilePosts from "./profile-posts";
import ProfileConnections from "./profile-connections";
import ProfileReportDialog from "./profile-report-dialog";
import ActivityTimeline from "./activity-timeline";

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

type Profile = {
  id: string;
  display_name: string;
  username: string;
  bio: string | null;
  avatar_path: string | null;
  account_type: AccountType;
  verification: {
    status: "verified" | "unverified";
    kind: VerificationKind;
  };
  follower_count: number;
  following_count: number;
  is_following: boolean;
  is_blocked: boolean;
};

type ConnectionTab =
  | "followers"
  | "following";

const supabase = createClient();

export default function ProfilePage() {
  const params =
    useParams<{
      userId: string;
    }>();

  const router = useRouter();

  const userId = params.userId;

  const [
    profile,
    setProfile,
  ] = useState<Profile | null>(
    null,
  );

  const [
    isOwner,
    setIsOwner,
  ] = useState(false);

  const [loading, setLoading] =
    useState(true);

  const [
    actionLoading,
    setActionLoading,
  ] = useState<
    "follow" | "block" | null
  >(null);

  const [
    messageLoading,
    setMessageLoading,
  ] = useState(false);

  const [error, setError] =
    useState("");

  const [
    connectionsOpen,
    setConnectionsOpen,
  ] = useState(false);

  const [
    connectionsTab,
    setConnectionsTab,
  ] = useState<ConnectionTab>(
    "followers",
  );

  const [
    reportOpen,
    setReportOpen,
  ] = useState(false);

  const [
    moreOpen,
    setMoreOpen,
  ] = useState(false);

  const moreMenuRef =
    useRef<HTMLDivElement | null>(
      null,
    );

  const loadProfile =
    useCallback(async () => {
      if (!userId) {
        return;
      }

      setLoading(true);
      setError("");

      try {
        const response =
          await fetch(
            `/api/users/${encodeURIComponent(
              userId,
            )}`,
            {
              cache: "no-store",
            },
          );

        const data =
          await response.json();

        if (!response.ok) {
          setError(
            data.error ??
              "Unable to load this profile.",
          );
          setProfile(null);
          setIsOwner(false);
          return;
        }

        const loadedProfile =
          data.profile as Profile;

        setProfile(
          loadedProfile,
        );

        const {
          data: { user },
        } =
          await supabase.auth.getUser();

        setIsOwner(
          user?.id ===
            loadedProfile.id,
        );
      } catch {
        setError(
          "Unable to load this profile.",
        );
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

    function handlePointerDown(
      event: MouseEvent,
    ) {
      const target =
        event.target;

      if (
        target instanceof Node &&
        !moreMenuRef.current?.contains(
          target,
        )
      ) {
        setMoreOpen(false);
      }
    }

    function handleKeyDown(
      event: KeyboardEvent,
    ) {
      if (event.key === "Escape") {
        setMoreOpen(false);
      }
    }

    document.addEventListener(
      "mousedown",
      handlePointerDown,
    );

    document.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handlePointerDown,
      );

      document.removeEventListener(
        "keydown",
        handleKeyDown,
      );
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

    setActionLoading(
      "follow",
    );
    setError("");

    try {
      const method =
        profile.is_following
          ? "DELETE"
          : "POST";

      const response =
        await fetch(
          `/api/users/${encodeURIComponent(
            profile.id,
          )}/follow`,
          {
            method,
          },
        );

      const data =
        response.status === 204
          ? null
          : await response.json();

      if (!response.ok) {
        setError(
          data?.error ??
            "Unable to update follow status.",
        );
        return;
      }

      setProfile(
        (current) =>
          current
            ? {
                ...current,
                is_following:
                  !current.is_following,
                follower_count:
                  current.is_following
                    ? Math.max(
                        0,
                        current.follower_count -
                          1,
                      )
                    : current.follower_count +
                      1,
              }
            : current,
      );
    } catch {
      setError(
        "Unable to update follow status.",
      );
    } finally {
      setActionLoading(
        null,
      );
    }
  }

  async function toggleBlock() {
    if (
      !profile ||
      actionLoading ||
      messageLoading ||
      isOwner
    ) {
      return;
    }

    const wasBlocked =
      profile.is_blocked;

    setMoreOpen(false);
    setActionLoading(
      "block",
    );
    setError("");

    try {
      const method =
        wasBlocked
          ? "DELETE"
          : "POST";

      const response =
        await fetch(
          `/api/users/${encodeURIComponent(
            profile.id,
          )}/block`,
          {
            method,
          },
        );

      const data =
        response.status === 204
          ? null
          : await response.json();

      if (!response.ok) {
        setError(
          data?.error ??
            "Unable to update block status.",
        );
        return;
      }

      if (!wasBlocked) {
        setConnectionsOpen(
          false,
        );
        setReportOpen(
          false,
        );
      }

      await loadProfile();
    } catch {
      setError(
        "Unable to update block status.",
      );
    } finally {
      setActionLoading(
        null,
      );
    }
  }

  async function startDirectConversation() {
    if (
      !profile ||
      isOwner ||
      profile.is_blocked ||
      messageLoading
    ) {
      return;
    }

    setMessageLoading(
      true,
    );
    setError("");

    try {
      const response =
        await fetch(
          "/api/conversations/direct",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              userId:
                profile.id,
            }),
          },
        );

      const data =
        await response.json();

      if (!response.ok) {
        setError(
          data.error ??
            "Unable to start the conversation.",
        );
        return;
      }

      if (
        !data.conversation?.id
      ) {
        setError(
          "The conversation could not be opened.",
        );
        return;
      }

      router.push(
        `/messages/${encodeURIComponent(
          data.conversation.id,
        )}`,
      );
    } catch {
      setError(
        "Unable to start the conversation.",
      );
    } finally {
      setMessageLoading(
        false,
      );
    }
  }

  function openConnections(
    tab: ConnectionTab,
  ) {
    if (
      !profile ||
      profile.is_blocked
    ) {
      return;
    }

    setConnectionsTab(tab);
    setConnectionsOpen(
      true,
    );
  }

  function closeConnections() {
    setConnectionsOpen(
      false,
    );
  }

  function openReport() {
    if (
      !profile ||
      isOwner ||
      profile.is_blocked
    ) {
      return;
    }

    setMoreOpen(false);
    setError("");
    setReportOpen(
      true,
    );
  }

  function closeReport() {
    setReportOpen(
      false,
    );
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto min-h-screen w-full max-w-3xl px-4 py-5 sm:px-6">
        <header className="mb-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() =>
              router.back()
            }
            className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium transition hover:border-[var(--accent)] hover:bg-[var(--surface-muted)]"
          >
            <ArrowLeft
              size={16}
            />
            Back
          </button>

          <div className="flex items-center gap-2">
            <Link
              href="/home"
              className="rounded-full px-3 py-2 text-sm font-semibold tracking-[0.14em] text-[var(--accent)] transition hover:bg-[var(--accent-soft)]"
            >
              AGORÉ
            </Link>

            {isOwner ? (
              <Link
                href="/settings"
                aria-label="Settings"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] transition hover:border-[var(--accent)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
              >
                <Settings
                  size={17}
                />
              </Link>
            ) : null}
          </div>
        </header>

        {loading ? (
          <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <div className="animate-pulse space-y-5">
              <div className="h-20 w-20 rounded-full bg-[var(--surface-muted)]" />

              <div className="h-7 w-48 rounded bg-[var(--surface-muted)]" />

              <div className="h-4 w-32 rounded bg-[var(--surface-muted)]" />

              <div className="h-16 w-full rounded bg-[var(--surface-muted)]" />
            </div>
          </section>
        ) : error &&
          !profile ? (
          <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <p className="text-sm font-medium text-[var(--danger)]">
              {error}
            </p>

            <button
              type="button"
              onClick={() =>
                void loadProfile()
              }
              className="mt-4 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)]"
            >
              Retry
            </button>
          </section>
        ) : profile ? (
          <>
            <section className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)]">
              <div className="border-b border-[var(--border)] px-6 pb-6 pt-7 sm:px-8">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-start gap-4">
                    <AgoreAvatar
                      avatarPath={
                        profile.avatar_path
                      }
                      name={
                        profile.display_name
                      }
                      className="h-20 w-20 shrink-0"
                      textClassName="text-xl"
                    />

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h1 className="truncate text-2xl font-semibold tracking-[-0.03em]">
                          {
                            profile.display_name
                          }
                        </h1>

                        {!profile.is_blocked &&
                        profile.verification?.status ===
                          "verified" &&
                        profile.verification.kind ? (
                          <VerificationBadge
                            accountType={
                              profile.account_type
                            }
                            kind={
                              profile.verification.kind
                            }
                            size={20}
                          />
                        ) : null}

                        {profile.is_blocked ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--danger-soft)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--danger)]">
                            <Ban
                              size={11}
                            />
                            Blocked
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-1 text-sm text-[var(--muted)]">
                        @
                        {
                          profile.username
                        }
                      </p>

                      {profile.bio &&
                      !profile.is_blocked ? (
                        <p className="mt-4 max-w-xl whitespace-pre-wrap text-[15px] leading-6 text-[var(--foreground)]">
                          {
                            profile.bio
                          }
                        </p>
                      ) : profile.is_blocked ? null : (
                        <p className="mt-4 text-sm text-[var(--muted)]">
                          No bio yet.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {isOwner ? (
                      <Link
                        href={`/profile/edit?userId=${encodeURIComponent(
                          profile.id,
                        )}`}
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)]"
                      >
                        <Edit3
                          size={16}
                        />
                        Edit profile
                      </Link>
                    ) : (
                      <>
                        {!profile.is_blocked ? (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                void toggleFollow()
                              }
                              disabled={
                                actionLoading !==
                                  null ||
                                messageLoading
                              }
                              className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {actionLoading ===
                              "follow" ? (
                                <Loader2
                                  className="animate-spin"
                                  size={16}
                                />
                              ) : profile.is_following ? (
                                <>
                                  <Check
                                    size={16}
                                  />
                                  Following
                                </>
                              ) : (
                                <>
                                  <UserPlus
                                    size={16}
                                  />
                                  Follow
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                void startDirectConversation()
                              }
                              disabled={
                                actionLoading !==
                                  null ||
                                messageLoading
                              }
                              className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)] hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-55"
                            >
                              {messageLoading ? (
                                <Loader2
                                  className="animate-spin"
                                  size={16}
                                />
                              ) : (
                                <MessageCircle
                                  size={16}
                                />
                              )}

                              {messageLoading
                                ? "Opening…"
                                : "Message"}
                            </button>

                            <div
                              ref={
                                moreMenuRef
                              }
                              className="relative"
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  setMoreOpen(
                                    (current) =>
                                      !current,
                                  )
                                }
                                aria-label="More profile actions"
                                aria-haspopup="menu"
                                aria-expanded={
                                  moreOpen
                                }
                                aria-controls="profile-actions-menu"
                                disabled={
                                  actionLoading !==
                                    null ||
                                  messageLoading
                                }
                                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-strong)] transition hover:border-[var(--accent)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-55"
                              >
                                <MoreHorizontal
                                  size={18}
                                />
                              </button>

                              {moreOpen ? (
                                <div
                                  id="profile-actions-menu"
                                  role="menu"
                                  aria-label="Profile actions"
                                  className="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-44 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-xl"
                                >
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() =>
                                      void toggleBlock()
                                    }
                                    disabled={
                                      actionLoading !==
                                        null ||
                                      messageLoading
                                    }
                                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--danger-soft)] hover:text-[var(--danger)] disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {actionLoading ===
                                    "block" ? (
                                      <Loader2
                                        size={16}
                                        className="animate-spin"
                                      />
                                    ) : (
                                      <Ban
                                        size={16}
                                      />
                                    )}

                                    Block
                                  </button>

                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={
                                      openReport
                                    }
                                    disabled={
                                      actionLoading !==
                                        null ||
                                      messageLoading
                                    }
                                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[var(--muted-strong)] transition hover:bg-[var(--danger-soft)] hover:text-[var(--danger)] disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    <Flag
                                      size={16}
                                    />
                                    Report
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              void toggleBlock()
                            }
                            disabled={
                              actionLoading !==
                              null
                            }
                            className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {actionLoading ===
                            "block" ? (
                              <Loader2
                                className="animate-spin"
                                size={16}
                              />
                            ) : (
                              <ShieldOff
                                size={16}
                              />
                            )}

                            Unblock
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              {profile.is_blocked ? (
                <div className="px-6 py-8 sm:px-8">
                  <div className="rounded-3xl border border-[var(--danger)]/20 bg-[var(--danger-soft)] p-6">
                    <div className="flex items-start gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface)] text-[var(--danger)]">
                        <ShieldOff
                          size={20}
                        />
                      </div>

                      <div className="min-w-0">
                        <h2 className="text-base font-semibold">
                          You blocked this person
                        </h2>

                        <p className="mt-1 max-w-xl text-sm leading-6 text-[var(--muted-strong)]">
                          Their activity, connections, and messaging actions are hidden until you unblock them.
                        </p>

                        <button
                          type="button"
                          onClick={() =>
                            void toggleBlock()
                          }
                          disabled={
                            actionLoading !==
                            null
                          }
                          className="mt-5 inline-flex items-center justify-center gap-2 rounded-full bg-[var(--foreground)] px-4 py-2.5 text-sm font-semibold text-[var(--background)] transition hover:bg-[var(--accent)] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {actionLoading ===
                          "block" ? (
                            <Loader2
                              className="animate-spin"
                              size={16}
                            />
                          ) : (
                            <ShieldOff
                              size={16}
                            />
                          )}

                          Unblock
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 divide-x divide-[var(--border)]">
                    <button
                      type="button"
                      onClick={() =>
                        openConnections(
                          "following",
                        )
                      }
                      aria-label={`View ${profile.following_count} following`}
                      className="group px-6 py-5 text-center transition hover:bg-[var(--surface-muted)] sm:px-8"
                    >
                      <p className="text-xl font-semibold transition group-hover:text-[var(--accent)]">
                        {
                          profile.following_count
                        }
                      </p>

                      <p className="mt-1 text-sm text-[var(--muted)] transition group-hover:text-[var(--foreground)]">
                        Following
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        openConnections(
                          "followers",
                        )
                      }
                      aria-label={`View ${profile.follower_count} followers`}
                      className="group px-6 py-5 text-center transition hover:bg-[var(--surface-muted)] sm:px-8"
                    >
                      <p className="text-xl font-semibold transition group-hover:text-[var(--accent)]">
                        {
                          profile.follower_count
                        }
                      </p>

                      <p className="mt-1 text-sm text-[var(--muted)] transition group-hover:text-[var(--foreground)]">
                        Followers
                      </p>
                    </button>
                  </div>

                  {error ? (
                    <div className="border-t border-[var(--border)] px-6 py-4 sm:px-8">
                      <p className="text-sm font-medium text-[var(--danger)]">
                        {error}
                      </p>
                    </div>
                  ) : null}
                </>
              )}
            </section>

            {!profile.is_blocked ? (
              <>
                <ProfilePosts
                  key={profile.id}
                  userId={
                    profile.id
                  }
                />

                <ActivityTimeline
                  key={`activity-${profile.id}`}
                  userId={profile.id}
                  isOwner={isOwner}
                />

                <ProfileConnections
                  userId={
                    profile.id
                  }
                  open={
                    connectionsOpen
                  }
                  initialTab={
                    connectionsTab
                  }
                  onClose={
                    closeConnections
                  }
                />
              </>
            ) : null}

            {!isOwner &&
            profile ? (
              <ProfileReportDialog
                userId={
                  profile.id
                }
                displayName={
                  profile.display_name
                }
                open={
                  reportOpen
                }
                onClose={
                  closeReport
                }
              />
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}