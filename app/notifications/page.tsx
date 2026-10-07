"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Bell,
  Check,
  CheckCheck,
  Loader2,
  RefreshCw,
} from "lucide-react";

type Actor = {
  id: string;
  username: string;
  display_name: string;
} | null;

type Notification = {
  id: string;
  actor_id: string | null;
  type: string;
  entity_id: string | null;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
  actor: Actor;
};

type NotificationsResponse = {
  notifications: Notification[];
  unreadCount: number;
};

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) {
    return "now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m`;
  }

  if (diffHours < 24) {
    return `${diffHours}h`;
  }

  if (diffDays < 7) {
    return `${diffDays}d`;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function getNotificationText(notification: Notification) {
  const actorName =
    notification.actor?.display_name ?? "Someone";

  switch (notification.type) {
    case "follow":
      return `${actorName} followed you.`;

    case "reaction":
      return `${actorName} reacted to your post.`;

    case "comment":
      return `${actorName} commented on your post.`;

    case "repost":
      return `${actorName} reposted your post.`;

    case "message":
      return `${actorName} sent you a message.`;

    case "group_activity":
      return `${actorName} updated a group conversation.`;

    default:
      return `${actorName} sent you a notification.`;
  }
}

function getNotificationHref(notification: Notification) {
  switch (notification.type) {
    case "follow":
      return notification.actor_id
        ? `/profile/${encodeURIComponent(notification.actor_id)}`
        : null;

    case "message":
      return notification.entity_id
        ? `/messages/${encodeURIComponent(notification.entity_id)}`
        : "/messages";

    default:
      return notification.entity_id
        ? `/home#post-${encodeURIComponent(notification.entity_id)}`
        : null;
  }
}

function getInitials(value: string) {
  return (
    value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "A"
  );
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadNotifications = useCallback(
    async (manual = false) => {
      if (manual) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      try {
        const response = await fetch(
          "/api/notifications?limit=50",
          {
            cache: "no-store",
          },
        );

        const data = await response.json();

        if (response.status === 401) {
          window.location.href = "/auth";
          return;
        }

        if (!response.ok) {
          throw new Error(
            data &&
            typeof data === "object" &&
            "error" in data &&
            typeof data.error === "string"
              ? data.error
              : "Unable to load notifications.",
          );
        }

        const successData = data as NotificationsResponse;

        setNotifications(
          Array.isArray(successData.notifications)
            ? successData.notifications
            : [],
        );

        setUnreadCount(
          typeof successData.unreadCount === "number"
            ? successData.unreadCount
            : 0,
        );
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load notifications.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  async function markAsRead(notificationId: string) {
    if (markingId) {
      return;
    }

    setMarkingId(notificationId);
    setError("");

    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          notificationId,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (response.status === 401) {
        window.location.href = "/auth";
        return;
      }

      if (!response.ok) {
        throw new Error(
          data.error ?? "Unable to mark notification as read.",
        );
      }

      setNotifications((current) =>
        current.map((notification) =>
          notification.id === notificationId
            ? {
                ...notification,
                read_at: new Date().toISOString(),
              }
            : notification,
        ),
      );

      setUnreadCount((current) => Math.max(current - 1, 0));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to mark notification as read.",
      );
    } finally {
      setMarkingId(null);
    }
  }

  async function markAllAsRead() {
    if (markingAll || unreadCount === 0) {
      return;
    }

    setMarkingAll(true);
    setError("");

    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          all: true,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (response.status === 401) {
        window.location.href = "/auth";
        return;
      }

      if (!response.ok) {
        throw new Error(
          data.error ?? "Unable to mark notifications as read.",
        );
      }

      const now = new Date().toISOString();

      setNotifications((current) =>
        current.map((notification) => ({
          ...notification,
          read_at: notification.read_at ?? now,
        })),
      );

      setUnreadCount(0);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to mark notifications as read.",
      );
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f5f1] text-[#17191c]">
      <div className="mx-auto min-h-screen w-full max-w-2xl px-4 py-5 sm:px-6">
        <header className="mb-5 flex items-center justify-between">
          <Link
            href="/home"
            className="inline-flex items-center gap-2 rounded-full border border-[#deddd7] bg-white px-4 py-2 text-sm font-medium transition hover:border-[#b9c7ea] hover:bg-[#f9fbff]"
          >
            <ArrowLeft size={16} />
            Home
          </Link>

          <span className="text-sm font-semibold tracking-[0.14em] text-[#2148b8]">
            AGORÉ
          </span>
        </header>

        <section className="overflow-hidden rounded-3xl border border-[#deddd7] bg-white">
          <div className="flex items-center justify-between gap-4 border-b border-[#ebeae5] px-5 py-5 sm:px-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2148b8]">
                Notifications
              </p>

              <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em]">
                Activity
              </h1>

              <p className="mt-1 text-sm text-[#777b81]">
                Stay up to date with what is happening around you.
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => void markAllAsRead()}
                disabled={markingAll || unreadCount === 0}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-[#deddd7] bg-white px-4 text-sm font-semibold text-[#4d535b] transition hover:bg-[#f8f7f3] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {markingAll ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <CheckCheck size={16} />
                )}
                Read all
              </button>

              <button
                type="button"
                onClick={() => void loadNotifications(true)}
                disabled={refreshing || loading}
                aria-label="Refresh notifications"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#deddd7] bg-white text-[#555a60] transition hover:bg-[#f8f7f3] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw
                  size={16}
                  className={refreshing ? "animate-spin" : ""}
                />
              </button>
            </div>
          </div>

          {unreadCount > 0 && !loading ? (
            <div className="flex items-center gap-2 border-b border-[#ebeae5] bg-[#f8faff] px-5 py-3 text-sm text-[#4d535b] sm:px-6">
              <Bell size={15} className="text-[#2148b8]" />
              <span>
                {unreadCount} unread notification
                {unreadCount === 1 ? "" : "s"}.
              </span>
            </div>
          ) : null}

          {error ? (
            <div className="border-b border-[#ead1d1] bg-[#fff7f7] px-5 py-4 text-sm font-medium text-[#8d2f2f] sm:px-6">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="space-y-1 p-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <div
                  key={index}
                  className="animate-pulse rounded-2xl px-4 py-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-full bg-[#e8e7e1]" />

                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="h-4 w-3/4 rounded bg-[#e8e7e1]" />
                      <div className="h-3 w-16 rounded bg-[#e8e7e1]" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#e9edfb] text-[#2148b8]">
                <Bell size={22} />
              </div>

              <h2 className="mt-5 text-lg font-semibold">
                Nothing new
              </h2>

              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#777b81]">
                Notifications about follows, reactions, comments,
                reposts, messages, and group activity will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-1 p-2">
              {notifications.map((notification) => {
                const href = getNotificationHref(notification);
                const unread = !notification.read_at;
                const actorName =
                  notification.actor?.display_name ?? "Agoré user";
                const initials = getInitials(actorName);
                const isMarking = markingId === notification.id;

                const content = (
                  <div
                    className={`flex items-start gap-3 rounded-2xl px-4 py-4 transition ${
                      unread
                        ? "bg-[#f7f9ff]"
                        : "hover:bg-[#f8f7f3]"
                    }`}
                  >
                    <div
                      aria-hidden="true"
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        unread
                          ? "bg-[#dfe7ff] text-[#2148b8]"
                          : "bg-[#ecebe6] text-[#686d73]"
                      }`}
                    >
                      {initials}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p
                            className={`text-sm leading-6 ${
                              unread
                                ? "font-semibold"
                                : "font-medium"
                            }`}
                          >
                            {getNotificationText(notification)}
                          </p>

                          <p className="mt-1 text-xs text-[#85898f]">
                            {formatDate(notification.created_at)}
                          </p>
                        </div>

                        {unread ? (
                          <span
                            aria-label="Unread"
                            className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#2148b8]"
                          />
                        ) : null}
                      </div>
                    </div>

                    {unread ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void markAsRead(notification.id);
                        }}
                        disabled={isMarking}
                        aria-label="Mark notification as read"
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#deddd7] bg-white text-[#666b72] transition hover:bg-[#f8f7f3] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isMarking ? (
                          <Loader2
                            size={14}
                            className="animate-spin"
                          />
                        ) : (
                          <Check size={14} />
                        )}
                      </button>
                    ) : null}
                  </div>
                );

                return href ? (
                  <Link
                    key={notification.id}
                    href={href}
                    onClick={() => {
                      if (unread) {
                        void markAsRead(notification.id);
                      }
                    }}
                    className="block"
                  >
                    {content}
                  </Link>
                ) : (
                  <div key={notification.id}>{content}</div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}