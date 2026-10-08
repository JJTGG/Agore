"use client";

import Link from "next/link";
import {
  Loader2,
  UserRoundCheck,
  Users,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

type ConnectionTab =
  | "followers"
  | "following";

type ProfileConnection = {
  id: string;
  display_name: string;
  username: string;
  avatar_path: string | null;
  created_at: string;
};

type ProfileConnectionsProps = {
  userId: string;
  open: boolean;
  initialTab: ConnectionTab;
  onClose: () => void;
};

type ConnectionsResponse = {
  blocked?: boolean;
  followers?: ProfileConnection[];
  following?: ProfileConnection[];
  error?: string;
};

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

function getInitials(
  name: string,
) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return "A";
  }

  if (parts.length === 1) {
    return parts[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function ConnectionAvatar({
  connection,
}: {
  connection: ProfileConnection;
}) {
  const [
    imageFailed,
    setImageFailed,
  ] = useState(false);

  const initials = getInitials(
    connection.display_name,
  );

  const showImage =
    Boolean(
      connection.avatar_path,
    ) && !imageFailed;

  if (showImage) {
    return (
      <img
        src={connection.avatar_path ?? ""}
        alt=""
        className="h-11 w-11 shrink-0 rounded-full border border-[var(--border)] bg-[var(--surface-muted)] object-cover"
        loading="lazy"
        onError={() =>
          setImageFailed(true)
        }
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--accent-soft)] text-xs font-bold text-[var(--accent)]"
    >
      {initials}
    </span>
  );
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
    ProfileConnection[]
  >([]);

  const [
    following,
    setFollowing,
  ] = useState<
    ProfileConnection[]
  >([]);

  const [
    loading,
    setLoading,
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
  }, [
    initialTab,
    open,
  ]);

  useEffect(() => {
    if (!open || !userId) {
      return;
    }

    let active = true;

    async function loadConnections() {
      setLoading(true);
      setError("");

      try {
        const response =
          await fetch(
            `/api/users/${encodeURIComponent(
              userId,
            )}/connections`,
            {
              method: "GET",
              cache: "no-store",
            },
          );

        const data =
          (await response.json()) as ConnectionsResponse;

        if (!response.ok) {
          throw new Error(
            data.error ??
              "Unable to load connections.",
          );
        }

        if (!active) {
          return;
        }

        setFollowers(
          Array.isArray(
            data.followers,
          )
            ? data.followers
            : [],
        );

        setFollowing(
          Array.isArray(
            data.following,
          )
            ? data.following
            : [],
        );
      } catch (requestError) {
        if (!active) {
          return;
        }

        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load connections.",
        );

        setFollowers([]);
        setFollowing([]);
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
                <Users size={19} />
              </div>

              <p className="mt-4 text-sm font-semibold">
                No {activeTab} yet.
              </p>

              <p className="mx-auto mt-1 max-w-xs text-sm leading-6 text-[var(--muted)]">
                Connections that are visible to you will appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {activeConnections.map(
                (
                  connection,
                ) => (
                  <Link
                    key={`${activeTab}-${connection.id}`}
                    href={`/profile/${encodeURIComponent(
                      connection.id,
                    )}`}
                    onClick={
                      onClose
                    }
                    className="flex items-center gap-3 px-5 py-4 transition hover:bg-[var(--surface-muted)]"
                  >
                    <ConnectionAvatar
                      connection={
                        connection
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

                    <time
                      dateTime={
                        connection.created_at
                      }
                      className="hidden shrink-0 text-right text-[10px] text-[var(--muted)] sm:block"
                    >
                      {formatConnectionDate(
                        connection.created_at,
                      )}
                    </time>
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