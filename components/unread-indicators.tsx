"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type UnreadState = {
  hasUnreadMessages: boolean;
  unreadNotifications: number;
};

type NotificationsResponse = {
  unreadCount?: number;
};

type ConversationsResponse = {
  conversations?: Array<{
    has_unread_messages?: boolean;
  }>;
};

export function useUnreadIndicators() {
  const [state, setState] = useState<UnreadState>({
    hasUnreadMessages: false,
    unreadNotifications: 0,
  });

  const inFlight = useRef(false);
  const mounted = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;

    inFlight.current = true;

    try {
      const [notifications, conversations] =
        await Promise.all([
          fetch("/api/notifications?limit=1", {
            cache: "no-store",
          })
            .then(async (response) =>
              response.ok
                ? (await response.json()) as NotificationsResponse
                : null,
            )
            .catch(() => null),

          fetch("/api/conversations?limit=50", {
            cache: "no-store",
          })
            .then(async (response) =>
              response.ok
                ? (await response.json()) as ConversationsResponse
                : null,
            )
            .catch(() => null),
        ]);

      if (!mounted.current) return;

      setState((current) => ({
        hasUnreadMessages: conversations
          ? Boolean(
              conversations.conversations?.some(
                (conversation) =>
                  conversation.has_unread_messages,
              ),
            )
          : current.hasUnreadMessages,

        unreadNotifications:
          typeof notifications?.unreadCount === "number"
            ? Math.max(0, notifications.unreadCount)
            : current.unreadNotifications,
      }));
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };

    void refresh();

    const interval = window.setInterval(
      refreshWhenVisible,
      60_000,
    );

    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener(
      "visibilitychange",
      refreshWhenVisible,
    );

    return () => {
      mounted.current = false;
      window.clearInterval(interval);
      window.removeEventListener(
        "focus",
        refreshWhenVisible,
      );
      document.removeEventListener(
        "visibilitychange",
        refreshWhenVisible,
      );
    };
  }, [refresh]);

  return { ...state, refresh };
}

export function UnreadBadge({
  count,
  dotOnly = false,
}: {
  count: number;
  dotOnly?: boolean;
}) {
  if (count <= 0) return null;

  if (dotOnly) {
    return (
      <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full bg-[var(--accent)] ring-2 ring-[var(--surface)]">
        <span className="sr-only">Unread messages</span>
      </span>
    );
  }

  return (
    <span className="absolute -right-2 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-bold leading-none text-white ring-2 ring-[var(--surface)]">
      {count > 9 ? "9+" : count}
      <span className="sr-only">unread notifications</span>
    </span>
  );
}