"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  Bell,
  Check,
  CheckCheck,
  Loader2,
  RefreshCw,
  Smartphone,
} from "lucide-react";

import { createClient } from "@/lib/supabase/browser";

type Actor = {
  id: string;
  username: string;
  display_name: string;
  account_status: string;
} | null;

type AgoreNotification = {
  id: string;
  event_id: string | null;
  actor_id: string | null;
  type: string;
  entity_id: string | null;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
  actor: Actor;
};

type NotificationsResponse = {
  notifications: AgoreNotification[];
  unreadCount: number;
  totalCount?: number;
  error?: string;
};

type PushConfigResponse = {
  enabled: boolean;
  publicKey: string | null;
  error?: string;
};

const supabase = createClient();

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const now = new Date();
  const difference = now.getTime() - date.getTime();

  const minutes = Math.floor(difference / 60_000);
  const hours = Math.floor(difference / 3_600_000);
  const days = Math.floor(difference / 86_400_000);

  if (minutes < 1) {
    return "now";
  }

  if (minutes < 60) {
    return `${minutes}m`;
  }

  if (hours < 24) {
    return `${hours}h`;
  }

  if (days < 7) {
    return `${days}d`;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function getNotificationText(
  notification: AgoreNotification,
): string {
  const actorName =
    notification.actor?.display_name ?? "Someone";

  switch (notification.type) {
    case "follow":
      return `${actorName} followed you.`;

    case "reaction":
      return `${actorName} reacted to your post.`;

    case "comment":
      return notification.data?.is_reply === true
        ? `${actorName} replied to your comment.`
        : `${actorName} commented on your post.`;

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

function getNotificationHref(
  notification: AgoreNotification,
): string | null {
  switch (notification.type) {
    case "follow":
      return notification.actor_id
        ? `/profile/${encodeURIComponent(notification.actor_id)}`
        : null;

    case "message":
    case "group_activity":
      return notification.entity_id
        ? `/messages/${encodeURIComponent(notification.entity_id)}`
        : "/messages";

    default:
      return notification.entity_id
        ? `/post/${encodeURIComponent(notification.entity_id)}`
        : null;
  }
}

function getInitials(value: string): string {
  return (
    value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "A"
  );
}

function urlBase64ToUint8Array(value: string): Uint8Array {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);

  const base64 = (value + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const raw = window.atob(base64);

  return Uint8Array.from(
    [...raw].map((character) => character.charCodeAt(0)),
  );
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<
    AgoreNotification[]
  >([]);

  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [pushSupported, setPushSupported] = useState(false);
  const [pushConfigured, setPushConfigured] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState("");

  /*
   * Track notification IDs already seen through the initial load
   * or realtime channel. This prevents duplicate INSERT deliveries
   * from incrementing the unread count more than once.
   */
  const seenNotificationIds = useRef(new Set<string>());

  /*
   * Realtime events can arrive more than once while a hydration
   * request is still running. Track pending IDs to avoid duplicate
   * requests for the same notification.
   */
  const pendingNotificationIds = useRef(new Set<string>());

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

        const data = (await response.json()) as NotificationsResponse;

        if (response.status === 401) {
          window.location.href = "/auth";
          return;
        }

        if (!response.ok) {
          throw new Error(
            data.error ?? "Unable to load notifications.",
          );
        }

        const loadedNotifications = Array.isArray(data.notifications)
          ? data.notifications
          : [];

        for (const notification of loadedNotifications) {
          seenNotificationIds.current.add(notification.id);
        }

        setNotifications(loadedNotifications);

        setUnreadCount(
          typeof data.unreadCount === "number"
            ? data.unreadCount
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

  const refreshRealtimeNotification = useCallback(
    async (notificationId: string) => {
      try {
        const response = await fetch(
          `/api/notifications?notificationId=${encodeURIComponent(
            notificationId,
          )}`,
          {
            cache: "no-store",
          },
        );

        if (!response.ok) {
          return;
        }

        const data =
          (await response.json()) as NotificationsResponse;

        const incoming = data.notifications?.[0];

        if (!incoming) {
          return;
        }

        /*
         * Only a previously unseen notification should increment
         * the unread counter. The ref is updated synchronously,
         * before React processes the state updates.
         */
        const isNewNotification =
          !seenNotificationIds.current.has(incoming.id);

        seenNotificationIds.current.add(incoming.id);

        setNotifications((current) => {
          const withoutExisting = current.filter(
            (notification) => notification.id !== incoming.id,
          );

          return [incoming, ...withoutExisting].slice(0, 50);
        });

        if (isNewNotification && !incoming.read_at) {
          setUnreadCount((current) => current + 1);
        }
      } catch (realtimeError) {
        console.error(
          "Failed to hydrate Agoré realtime notification:",
          realtimeError,
        );
      }
    },
    [],
  );

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  /*
   * Subscribe to the signed-in user's notification INSERT events.
   * Cleanup removes the actual Supabase channel, including when
   * authentication lookup is still resolving during unmount.
   */
  useEffect(() => {
    let active = true;

    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function initialiseRealtime() {
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (!active || authError || !user) {
          return;
        }

        channel = supabase
          .channel(`agore-notifications-${user.id}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "notifications",
              filter: `recipient_id=eq.${user.id}`,
            },
            (payload) => {
              const id =
                typeof payload.new?.id === "string"
                  ? payload.new.id
                  : null;

              if (
                !id ||
                seenNotificationIds.current.has(id) ||
                pendingNotificationIds.current.has(id)
              ) {
                return;
              }

              pendingNotificationIds.current.add(id);

              void refreshRealtimeNotification(id).finally(() => {
                pendingNotificationIds.current.delete(id);
              });
            },
          )
          .subscribe((status, subscriptionError) => {
            if (subscriptionError) {
              console.error(
                "Agoré notification realtime subscription error:",
                subscriptionError,
              );
            }

            if (status === "CHANNEL_ERROR") {
              console.error(
                "Agoré notification realtime channel failed.",
              );
            }
          });
      } catch (realtimeInitError) {
        console.error(
          "Unable to initialise Agoré notification realtime:",
          realtimeInitError,
        );
      }
    }

    void initialiseRealtime();

    return () => {
      active = false;

      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [refreshRealtimeNotification]);

  /*
   * Detect Web Push support and determine whether VAPID is
   * configured. This checks capability and configuration without
   * requesting notification permission from the user.
   */
  useEffect(() => {
    let active = true;

    async function initialisePush() {
      const supported =
        typeof window !== "undefined" &&
        "Notification" in window &&
        "serviceWorker" in navigator &&
        "PushManager" in window;

      if (!supported) {
        return;
      }

      setPushSupported(true);

      try {
        const response = await fetch("/api/push/config", {
          cache: "no-store",
        });

        const config =
          (await response.json()) as PushConfigResponse;

        if (!active) {
          return;
        }

        if (!response.ok) {
          throw new Error(
            config.error ?? "Unable to read push configuration.",
          );
        }

        setPushConfigured(config.enabled);

        if (!config.enabled) {
          return;
        }

        const registration =
          await navigator.serviceWorker.register("/sw.js");

        const subscription =
          await registration.pushManager.getSubscription();

        if (active) {
          setPushEnabled(Boolean(subscription));
        }
      } catch (pushInitError) {
        console.error(
          "Failed to initialise Agoré push notifications:",
          pushInitError,
        );
      }
    }

    void initialisePush();

    return () => {
      active = false;
    };
  }, []);

  async function enablePush() {
    if (pushBusy || !pushSupported || !pushConfigured) {
      return;
    }

    setPushBusy(true);
    setPushError("");

    try {
      const permission = await Notification.requestPermission();

      if (permission !== "granted") {
        throw new Error(
          permission === "denied"
            ? "Browser notifications are blocked. Enable them in your browser settings."
            : "Notification permission was not granted.",
        );
      }

      const configResponse = await fetch("/api/push/config", {
        cache: "no-store",
      });

      const config =
        (await configResponse.json()) as PushConfigResponse;

      if (
        !configResponse.ok ||
        !config.enabled ||
        !config.publicKey
      ) {
        throw new Error(
          config.error ??
            "Push notifications are not configured on this Agoré deployment.",
        );
      }

      const registration =
        await navigator.serviceWorker.register("/sw.js");

      const existingSubscription =
        await registration.pushManager.getSubscription();

      const subscription =
        existingSubscription ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(
            config.publicKey,
          ),
        }));

      const response = await fetch("/api/push/subscription", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(subscription.toJSON()),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          data.error ?? "Unable to enable push notifications.",
        );
      }

      setPushEnabled(true);
    } catch (pushEnableError) {
      setPushError(
        pushEnableError instanceof Error
          ? pushEnableError.message
          : "Unable to enable push notifications.",
      );
    } finally {
      setPushBusy(false);
    }
  }

  async function disablePush() {
    if (pushBusy || !pushSupported) {
      return;
    }

    setPushBusy(true);
    setPushError("");

    try {
      const registration =
        await navigator.serviceWorker.getRegistration("/");

      const subscription =
        await registration?.pushManager.getSubscription();

      if (subscription) {
        const response = await fetch(
          "/api/push/subscription",
          {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              endpoint: subscription.endpoint,
            }),
          },
        );

        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as {
            error?: string;
          };

          throw new Error(
            data.error ?? "Unable to disable push notifications.",
          );
        }

        await subscription.unsubscribe();
      }

      setPushEnabled(false);
    } catch (pushDisableError) {
      setPushError(
        pushDisableError instanceof Error
          ? pushDisableError.message
          : "Unable to disable push notifications.",
      );
    } finally {
      setPushBusy(false);
    }
  }

  async function markAsRead(notificationId: string) {
    if (markingId) {
      return;
    }

    const existingNotification = notifications.find(
      (notification) => notification.id === notificationId,
    );

    const wasUnread = Boolean(
      existingNotification && !existingNotification.read_at,
    );

    if (existingNotification && !wasUnread) {
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

      if (wasUnread) {
        setUnreadCount((current) => Math.max(current - 1, 0));
      }
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

  const unreadLabel = useMemo(
    () =>
      `${unreadCount} unread notification${
        unreadCount === 1 ? "" : "s"
      }.`,
    [unreadCount],
  );

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto min-h-screen w-full max-w-2xl px-4 py-5 sm:px-6">
        <header className="mb-5 flex items-center justify-between gap-3">
          <Link
            href="/home"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium transition hover:border-[var(--accent)] hover:bg-[var(--surface-muted)]"
          >
            <ArrowLeft size={16} />
            Home
          </Link>

          <span className="text-sm font-semibold tracking-[0.14em] text-[var(--accent)]">
            AGORÉ
          </span>
        </header>

        <section className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] px-5 py-5 sm:px-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
                Notifications
              </p>

              <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em]">
                Activity
              </h1>

              <p className="mt-1 text-sm text-[var(--muted)]">
                Stay up to date with what is happening around you.
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => void markAllAsRead()}
                disabled={markingAll || unreadCount === 0}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
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
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw
                  size={16}
                  className={refreshing ? "animate-spin" : ""}
                />
              </button>
            </div>
          </div>

          <div className="border-b border-[var(--border)] bg-[var(--background)] px-5 py-4 sm:px-6">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                <Smartphone size={18} />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  Push notifications
                </p>

                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                  Receive Agoré alerts even when this page is not open.
                </p>

                {pushError ? (
                  <p className="mt-2 text-xs font-medium text-[var(--danger)]">
                    {pushError}
                  </p>
                ) : !pushSupported ? (
                  <p className="mt-2 text-xs text-[var(--muted)]">
                    This browser does not support Web Push.
                  </p>
                ) : !pushConfigured ? (
                  <p className="mt-2 text-xs text-[var(--muted)]">
                    Push is not configured on this deployment yet.
                  </p>
                ) : null}
              </div>

              {pushConfigured && pushSupported ? (
                <button
                  type="button"
                  onClick={() =>
                    void (pushEnabled ? disablePush() : enablePush())
                  }
                  disabled={pushBusy}
                  className={[
                    "relative h-7 w-12 shrink-0 rounded-full p-1 transition",
                    pushEnabled
                      ? "bg-[var(--accent)]"
                      : "bg-[var(--surface-muted)]",
                    pushBusy
                      ? "cursor-not-allowed opacity-50"
                      : "",
                  ].join(" ")}
                  aria-label={
                    pushEnabled
                      ? "Disable push notifications"
                      : "Enable push notifications"
                  }
                  aria-pressed={pushEnabled}
                >
                  <span
                    className={[
                      "block h-5 w-5 rounded-full bg-white shadow-sm transition",
                      pushEnabled
                        ? "translate-x-5"
                        : "translate-x-0",
                    ].join(" ")}
                  />
                </button>
              ) : null}
            </div>
          </div>

          {unreadCount > 0 && !loading ? (
            <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--accent-soft)] px-5 py-3 text-sm text-[var(--foreground)] sm:px-6">
              <Bell
                size={15}
                className="text-[var(--accent)]"
              />

              <span>{unreadLabel}</span>
            </div>
          ) : null}

          {error ? (
            <div className="border-b border-[var(--border)] bg-[var(--surface-muted)] px-5 py-4 text-sm font-medium text-[var(--danger)] sm:px-6">
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
                    <div className="h-11 w-11 rounded-full bg-[var(--surface-muted)]" />

                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="h-4 w-3/4 rounded bg-[var(--surface-muted)]" />
                      <div className="h-3 w-16 rounded bg-[var(--surface-muted)]" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                <Bell size={22} />
              </div>

              <h2 className="mt-5 text-lg font-semibold">
                Nothing new
              </h2>

              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--muted)]">
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
                    className={[
                      "flex items-start gap-3 rounded-2xl px-4 py-4 transition",
                      unread
                        ? "bg-[var(--accent-soft)]"
                        : "hover:bg-[var(--surface-muted)]",
                    ].join(" ")}
                  >
                    <div
                      aria-hidden="true"
                      className={[
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                        unread
                          ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                          : "bg-[var(--surface-muted)] text-[var(--muted)]",
                      ].join(" ")}
                    >
                      {initials}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p
                            className={[
                              "text-sm leading-6",
                              unread
                                ? "font-semibold"
                                : "font-medium",
                            ].join(" ")}
                          >
                            {getNotificationText(notification)}
                          </p>

                          <p className="mt-1 text-xs text-[var(--muted)]">
                            {formatDate(notification.created_at)}
                          </p>
                        </div>

                        {unread ? (
                          <span
                            aria-label="Unread"
                            className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--accent)]"
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
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50"
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