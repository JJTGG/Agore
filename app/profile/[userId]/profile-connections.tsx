"use client";

import Link from "next/link";
import {
  Loader2,
  Users,
  UserRoundCheck,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import AgoreAvatar from "@/components/agore-avatar";
import { createClient } from "@/lib/supabase/browser";

type ConnectionTab =
  | "followers"
  | "following";

type ConnectionProfile = {
  id: string;
  display_name: string;
  username: string;
  avatar_path: string | null;
};

type FollowRow = {
  follower_id: string;
  following_id: string;
  created_at: string;
};

type ProfileConnectionsProps = {
  userId: string;
  open: boolean;
  initialTab: ConnectionTab;
  onClose: () => void;
};

const supabase = createClient();

function formatConnectionDate(
  value: string,
) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    },
  ).format(date);
}

export default function ProfileConnections({
  userId,
  open,
  initialTab,
  onClose,
}: ProfileConnectionsProps) {
  const [
    activeTab,
    setActiveTab,
  ] = useState<ConnectionTab>(
    initialTab,
  );

  const [
    followers,
    setFollowers,
  ] = useState<
    ConnectionProfile[]
  >([]);

  const [
    following,
    setFollowing,
  ] = useState<
    ConnectionProfile[]
  >([]);

  const [
    followerDates,
    setFollowerDates,
  ] = useState<
    Record<string, string>
  >({});

  const [
    followingDates,
    setFollowingDates,
  ] = useState<
    Record<string, string>
  >({});

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    loaded,
    setLoaded,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }

    setActiveTab(initialTab);
  }, [initialTab, open]);

  useEffect(() => {
    if (!open || loaded) {
      return;
    }

    let active = true;

    async function loadConnections() {
      setLoading(true);
      setError("");

      try {
        const {
          data: { user },
          error: userError,
        } =
          await supabase.auth.getUser();

        if (userError || !user) {
          throw new Error(
            "Authentication required.",
          );
        }

        const {
          data: follows,
          error: followsError,
        } = await supabase
          .from("follows")
          .select(
            "follower_id, following_id, created_at",
          )
          .or(
            `follower_id.eq.${userId},following_id.eq.${userId}`,
          )
          .order("created_at", {
            ascending: false,
          })
          .limit(100);

        if (followsError) {
          throw followsError;
        }

        const rows =
          (follows ??
            []) as FollowRow[];

        const followerRows =
          rows.filter(
            (row) =>
              row.following_id ===
              userId,
          );

        const followingRows =
          rows.filter(
            (row) =>
              row.follower_id ===
              userId,
          );

        const connectionIds = [
          ...new Set([
            ...followerRows.map(
              (row) =>
                row.follower_id,
            ),
            ...followingRows.map(
              (row) =>
                row.following_id,
            ),
          ]),
        ];

        let profiles: ConnectionProfile[] =
          [];

        if (
          connectionIds.length >
          0
        ) {
          const {
            data: profileRows,
            error: profilesError,
          } = await supabase
            .from("profiles")
            .select(
              "id, display_name, username, avatar_path",
            )
            .in(
              "id",
              connectionIds,
            )
            .eq(
              "account_status",
              "active",
            );

          if (profilesError) {
            throw profilesError;
          }

          profiles =
            (profileRows ??
              []) as ConnectionProfile[];
        }

        if (!active) {
          return;
        }

        const profileMap =
          new Map(
            profiles.map(
              (profile) => [
                profile.id,
                profile,
              ],
            ),
          );

        const orderedFollowers =
          followerRows
            .map((row) =>
              profileMap.get(
                row.follower_id,
              ),
            )
            .filter(
              (
                profile,
              ): profile is ConnectionProfile =>
                Boolean(profile),
            );

        const orderedFollowing =
          followingRows
            .map((row) =>
              profileMap.get(
                row.following_id,
              ),
            )
            .filter(
              (
                profile,
              ): profile is ConnectionProfile =>
                Boolean(profile),
            );

        const nextFollowerDates =
          Object.fromEntries(
            followerRows
              .filter((row) =>
                profileMap.has(
                  row.follower_id,
                ),
              )
              .map((row) => [
                row.follower_id,
                row.created_at,
              ]),
          );

        const nextFollowingDates =
          Object.fromEntries(
            followingRows
              .filter((row) =>
                profileMap.has(
                  row.following_id,
                ),
              )
              .map((row) => [
                row.following_id,
                row.created_at,
              ]),
          );

        setFollowers(
          orderedFollowers,
        );

        setFollowing(
          orderedFollowing,
        );

        setFollowerDates(
          nextFollowerDates,
        );

        setFollowingDates(
          nextFollowingDates,
        );

        setLoaded(true);
      } catch (
        requestError
      ) {
        if (!active) {
          return;
        }

        setError(
          requestError instanceof
            Error
            ? requestError.message
            : "Unable to load connections.",
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadConnections();

    return () => {
      active = false;
    };
  }, [
    loaded,
    open,
    userId,
  ]);

  const activeConnections =
    useMemo(
      () =>
        activeTab ===
        "followers"
          ? followers
          : following,
      [
        activeTab,
        followers,
        following,
      ],
    );

  const activeDates =
    activeTab ===
    "followers"
      ? followerDates
      : followingDates;

  const heading =
    activeTab ===
    "followers"
      ? "Followers"
      : "Following";

  function closeOnBackdrop(
    event: React.MouseEvent<HTMLDivElement>,
  ) {
    if (
      event.target ===
      event.currentTarget
    ) {
      onClose();
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-connections-title"
      onMouseDown={
        closeOnBackdrop
      }
    >
      <section className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[1.75rem] border border-[var(--border)] bg-[var(--surface)] shadow-2xl sm:rounded-[1.75rem]">
        <header className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--accent)]">
              Social graph
            </p>

            <h2
              id="profile-connections-title"
              className="mt-1 text-xl font-bold tracking-[-0.03em]"
            >
              {heading}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close connections"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted-strong)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
          >
            <X size={17} />
          </button>
        </header>

        <div
          role="tablist"
          aria-label="Profile connections"
          className="grid shrink-0 grid-cols-2 border-b border-[var(--border)]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={
              activeTab ===
              "followers"
            }
            onClick={() =>
              setActiveTab(
                "followers",
              )
            }
            className={[
              "relative flex items-center justify-center gap-2 px-4 py-3.5 text-sm font-semibold transition",
              activeTab ===
              "followers"
                ? "text-[var(--foreground)]"
                : "text-[var(--muted)] hover:text-[var(--foreground)]",
            ].join(" ")}
          >
            <Users size={15} />
            Followers

            {followers.length >
            0 ? (
              <span className="rounded-full bg-[var(--background)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">
                {followers.length}
              </span>
            ) : null}

            {activeTab ===
            "followers" ? (
              <span className="absolute inset-x-8 bottom-0 h-0.5 rounded-full bg-[var(--accent)]" />
            ) : null}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={
              activeTab ===
              "following"
            }
            onClick={() =>
              setActiveTab(
                "following",
              )
            }
            className={[
              "relative flex items-center justify-center gap-2 px-4 py-3.5 text-sm font-semibold transition",
              activeTab ===
              "following"
                ? "text-[var(--foreground)]"
                : "text-[var(--muted)] hover:text-[var(--foreground)]",
            ].join(" ")}
          >
            <UserRoundCheck
              size={15}
            />
            Following

            {following.length >
            0 ? (
              <span className="rounded-full bg-[var(--background)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">
                {following.length}
              </span>
            ) : null}

            {activeTab ===
            "following" ? (
              <span className="absolute inset-x-8 bottom-0 h-0.5 rounded-full bg-[var(--accent)]" />
            ) : null}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex min-h-64 items-center justify-center px-6">
              <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
                <Loader2
                  size={18}
                  className="animate-spin"
                />
                Loading connections…
              </div>
            </div>
          ) : error ? (
            <div className="px-6 py-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--danger-soft)] text-[var(--danger)]">
                <Users size={19} />
              </div>

              <p className="mt-4 text-sm font-semibold text-[var(--danger)]">
                {error}
              </p>
            </div>
          ) : activeConnections.length ===
            0 ? (
            <div className="px-6 py-14 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                {activeTab ===
                "followers" ? (
                  <Users size={19} />
                ) : (
                  <UserRoundCheck
                    size={19}
                  />
                )}
              </div>

              <p className="mt-4 text-sm font-semibold">
                No{" "}
                {activeTab ===
                "followers"
                  ? "followers"
                  : "following"}{" "}
                yet.
              </p>

              <p className="mt-1 text-sm leading-5 text-[var(--muted)]">
                This part of the social graph is empty for now.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {activeConnections.map(
                (connection) => (
                  <Link
                    key={
                      connection.id
                    }
                    href={`/profile/${encodeURIComponent(
                      connection.id,
                    )}`}
                    onClick={
                      onClose
                    }
                    className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-[var(--surface-muted)]"
                  >
                    <AgoreAvatar
                      avatarPath={
                        connection.avatar_path
                      }
                      name={
                        connection.display_name
                      }
                      className="h-11 w-11 shrink-0"
                      textClassName="text-xs"
                    />

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {
                          connection.display_name
                        }
                      </p>

                      <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                        @
                        {
                          connection.username
                        }
                      </p>
                    </div>

                    {activeDates[
                      connection.id
                    ] ? (
                      <time
                        dateTime={
                          activeDates[
                            connection.id
                          ]
                        }
                        className="hidden shrink-0 text-[10px] text-[var(--muted)] sm:block"
                      >
                        {formatConnectionDate(
                          activeDates[
                            connection.id
                          ],
                        )}
                      </time>
                    ) : null}
                  </Link>
                ),
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}