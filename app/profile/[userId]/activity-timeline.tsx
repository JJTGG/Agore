"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Clock3,
  FileText,
  Heart,
  Loader2,
  MessageCircle,
  RefreshCw,
  Repeat2,
  UserMinus,
  UserPlus,
} from "lucide-react";

import AgoreAvatar from "@/components/agore-avatar";

type PublicProfile = {
  id: string;
  username: string;
  display_name: string;
  avatar_path: string | null;
};

type ActivityPost = {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
  author: PublicProfile;
};

type ActivityItem = {
  id: string;
  type: string;
  occurred_at: string;
  post: ActivityPost | null;
  related_user: PublicProfile | null;
};

type ActivityResponse = {
  profile?: PublicProfile;
  activity?: ActivityItem[];
  pagination?: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
  error?: string;
};

type ActivityTimelineProps = {
  userId: string;
  isOwner: boolean;
};

function formatActivityDate(value: string) {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "Recently";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getActivityLabel(type: string) {
  switch (type) {
    case "post.created":
      return {
        label: "published a post",
        icon: FileText,
      };

    case "post.reaction.added":
      return {
        label: "reacted to a post",
        icon: Heart,
      };

    case "comment.created":
      return {
        label: "commented on a post",
        icon: MessageCircle,
      };

    case "repost.created":
      return {
        label: "reposted a post",
        icon: Repeat2,
      };

    case "follow.created":
      return {
        label: "started following",
        icon: UserPlus,
      };

    case "follow.deleted":
      return {
        label: "stopped following",
        icon: UserMinus,
      };

    default:
      return null;
  }
}

function ActivityEntry({
  item,
  profile,
}: {
  item: ActivityItem;
  profile: PublicProfile | null;
}) {
  const activity = getActivityLabel(item.type);

  if (!activity) {
    return null;
  }

  const ActivityIcon = activity.icon;

  const actorName =
    profile?.display_name ?? "This user";

  const actorUsername =
    profile?.username ?? "unknown";

  return (
    <article className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 transition hover:border-[var(--accent)]/30 sm:p-5">
      <div className="flex items-start gap-3">
        <Link
          href={`/profile/${encodeURIComponent(
            profile?.id ?? "",
          )}`}
          aria-label={`View @${actorUsername}'s profile`}
          className="shrink-0"
        >
          <AgoreAvatar
            avatarPath={profile?.avatar_path ?? null}
            name={actorName}
            className="h-10 w-10"
            textClassName="text-xs"
          />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 text-sm leading-6">
              <Link
                href={`/profile/${encodeURIComponent(
                  profile?.id ?? "",
                )}`}
                className="font-semibold text-[var(--foreground)] hover:text-[var(--accent)]"
              >
                {actorName}
              </Link>{" "}

              <span className="text-[var(--muted)]">
                {activity.label}
              </span>

              {item.related_user ? (
                <>
                  {" "}
                  <Link
                    href={`/profile/${encodeURIComponent(
                      item.related_user.id,
                    )}`}
                    className="font-semibold text-[var(--foreground)] hover:text-[var(--accent)]"
                  >
                    @{item.related_user.username}
                  </Link>
                </>
              ) : null}
            </div>

            <span
              className="mt-1 shrink-0 text-[var(--accent)]"
              aria-hidden="true"
            >
              <ActivityIcon size={17} />
            </span>
          </div>

          <time
            dateTime={item.occurred_at}
            className="mt-1 block text-[11px] text-[var(--muted)]"
          >
            {formatActivityDate(item.occurred_at)}
          </time>

          {item.post ? (
            <Link
              href={`/post/${encodeURIComponent(
                item.post.id,
              )}`}
              className="group mt-3 block rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 transition hover:border-[var(--accent)]/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-[var(--foreground)]">
                    {item.post.content}
                  </p>

                  <p className="mt-2 truncate text-xs text-[var(--muted)]">
                    @{item.post.author.username}
                  </p>
                </div>

                <ArrowUpRight
                  size={16}
                  className="mt-0.5 shrink-0 text-[var(--muted)] transition group-hover:text-[var(--accent)]"
                />
              </div>
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default function ActivityTimeline({
  userId,
  isOwner,
}: ActivityTimelineProps) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [profile, setProfile] = useState<PublicProfile | null>(
    null,
  );
  const [nextCursor, setNextCursor] = useState<string | null>(
    null,
  );
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const requestGeneration = useRef(0);

  const loadPage = useCallback(
    async (
      cursor: string | null,
      append: boolean,
    ) => {
      const generation = ++requestGeneration.current;

      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      setError("");

      try {
        const params = new URLSearchParams({
          limit: "20",
        });

        if (cursor) {
          params.set("beforeSequence", cursor);
        }

        const response = await fetch(
          `/api/users/${encodeURIComponent(
            userId,
          )}/activity?${params.toString()}`,
          {
            method: "GET",
            cache: "no-store",
          },
        );

        const data =
          (await response.json()) as ActivityResponse;

        if (generation !== requestGeneration.current) {
          return;
        }

        if (!response.ok) {
          throw new Error(
            data.error ?? "Unable to load activity.",
          );
        }

        const receivedItems = Array.isArray(data.activity)
          ? data.activity
          : [];

        setItems((current) =>
          append
            ? [
                ...current,
                ...receivedItems.filter(
                  (item) =>
                    !current.some(
                      (existing) =>
                        existing.id === item.id,
                    ),
                ),
              ]
            : receivedItems,
        );

        if (data.pagination) {
          setNextCursor(data.pagination.nextCursor);
          setHasMore(data.pagination.hasMore);
        } else {
          setNextCursor(null);
          setHasMore(false);
        }

        if (data.profile) {
          setProfile(data.profile);
        }
      } catch (requestError) {
        if (generation !== requestGeneration.current) {
          return;
        }

        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load activity.",
        );
      } finally {
        if (generation === requestGeneration.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [userId],
  );

  useEffect(() => {
    setItems([]);
    setProfile(null);
    setNextCursor(null);
    setHasMore(false);
    setLoading(true);
    setLoadingMore(false);
    setError("");

    void loadPage(null, false);

    return () => {
      requestGeneration.current += 1;
    };
  }, [loadPage]);

  function retry() {
    setItems([]);
    setNextCursor(null);
    setHasMore(false);
    void loadPage(null, false);
  }

  return (
    <section className="mt-7">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--accent)]">
          <Clock3 size={19} />
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold tracking-[-0.03em]">
            Activity history
          </h2>

          <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
            {isOwner
              ? "Review eligible activity from your account."
              : "Public activity shared by this profile."}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="flex animate-pulse gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"
            >
              <div className="h-10 w-10 shrink-0 rounded-full bg-[var(--surface-muted)]" />

              <div className="flex-1 space-y-3 pt-1">
                <div className="h-3 w-2/3 rounded-full bg-[var(--surface-muted)]" />
                <div className="h-3 w-1/3 rounded-full bg-[var(--surface-muted)]" />
                <div className="h-16 rounded-xl bg-[var(--surface-muted)]" />
              </div>
            </div>
          ))}
        </div>
      ) : error && items.length === 0 ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <p className="text-sm text-[var(--danger)]">
            {error}
          </p>

          <button
            type="button"
            onClick={retry}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--foreground)] px-4 py-2 text-sm font-semibold text-[var(--background)] transition hover:bg-[var(--accent)] hover:text-white"
          >
            <RefreshCw size={15} />
            Try again
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-6 py-12 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <Clock3 size={20} />
          </span>

          <p className="mt-4 text-sm font-semibold text-[var(--foreground)]">
            No activity to show yet.
          </p>

          <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-[var(--muted)]">
            {isOwner
              ? "Your eligible posts and interactions will appear here as you use Agoré."
              : "Eligible public activity will appear here when it is available."}
          </p>

          {error ? (
            <p className="mt-3 text-sm text-[var(--danger)]">
              {error}
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {items.map((item) => (
              <ActivityEntry
                key={item.id}
                item={item}
                profile={profile}
              />
            ))}
          </div>

          {error ? (
            <p className="mt-4 text-sm text-[var(--danger)]">
              {error}
            </p>
          ) : null}

          {hasMore ? (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => {
                  if (nextCursor && !loadingMore) {
                    void loadPage(nextCursor, true);
                  }
                }}
                disabled={!nextCursor || loadingMore}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-5 py-2.5 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)]/40 hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingMore ? (
                  <Loader2
                    size={16}
                    className="animate-spin"
                  />
                ) : null}

                {loadingMore
                  ? "Loading activity…"
                  : "Load more"}
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}