"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/browser";

const supabase = createClient();

type PresencePayload = {
  userId?: unknown;
  onlineAt?: unknown;
};

type ConversationPresenceProps = {
  conversationId: string;
  currentUserId: string | null;
  conversationType: "direct" | "group";
  participantId: string | null;
  fallback: string;
};

function getOnlineUserIds(
  state: Record<
    string,
    PresencePayload[]
  >,
) {
  const userIds = new Set<string>();

  Object.values(state).forEach(
    (presences) => {
      presences.forEach(
        (presence) => {
          if (
            typeof presence.userId ===
            "string"
          ) {
            userIds.add(
              presence.userId,
            );
          }
        },
      );
    },
  );

  return userIds;
}

export default function ConversationPresence({
  conversationId,
  currentUserId,
  conversationType,
  participantId,
  fallback,
}: ConversationPresenceProps) {
  const [
    onlineUserIds,
    setOnlineUserIds,
  ] = useState<Set<string>>(
    () => new Set(),
  );

  const [
    groupMemberIds,
    setGroupMemberIds,
  ] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    if (
      !conversationId ||
      !currentUserId
    ) {
      setOnlineUserIds(
        new Set(),
      );
      setGroupMemberIds(
        new Set(),
      );
      return;
    }

    let active = true;

    async function loadGroupMemberIds() {
      if (
        conversationType !==
        "group"
      ) {
        setGroupMemberIds(
          new Set(),
        );
        return;
      }

      try {
        const response =
          await fetch(
            `/api/conversations/${encodeURIComponent(
              conversationId,
            )}/members`,
            {
              cache: "no-store",
            },
          );

        if (!response.ok) {
          return;
        }

        const data =
          await response.json();

        if (!active) {
          return;
        }

        const members =
          Array.isArray(
            data.members,
          )
            ? data.members
            : [];

        setGroupMemberIds(
          new Set(
            members
              .map(
                (member: {
                  userId?: unknown;
                }) =>
                  typeof member.userId ===
                  "string"
                    ? member.userId
                    : null,
              )
              .filter(
                (
                  userId: unknown,
                ): userId is string =>
                  Boolean(userId),
              ),
          ),
        );
      } catch {
        if (active) {
          setGroupMemberIds(
            new Set(),
          );
        }
      }
    }

    const channel: RealtimeChannel =
      supabase.channel(
        `conversation:${conversationId}:presence`,
        {
          config: {
            private: true,
            presence: {
              key: currentUserId,
            },
          },
        },
      );

    const syncPresence = () => {
      if (!active) {
        return;
      }

      const state =
        channel.presenceState() as Record<
          string,
          PresencePayload[]
        >;

      setOnlineUserIds(
        getOnlineUserIds(state),
      );
    };

    channel.on(
      "presence",
      { event: "sync" },
      syncPresence,
    );

    channel.on(
      "presence",
      { event: "join" },
      syncPresence,
    );

    channel.on(
      "presence",
      { event: "leave" },
      syncPresence,
    );

    async function connect() {
      try {
        await Promise.all([
          supabase.realtime.setAuth(),
          loadGroupMemberIds(),
        ]);

        if (!active) {
          return;
        }

        channel.subscribe(
          async (status) => {
            if (
              status !== "SUBSCRIBED"
            ) {
              return;
            }

            await channel.track({
              userId:
                currentUserId,
              onlineAt:
                new Date().toISOString(),
            });

            syncPresence();
          },
        );
      } catch {
        if (active) {
          setOnlineUserIds(
            new Set(),
          );
        }
      }
    }

    void connect();

    return () => {
      active = false;

      setOnlineUserIds(
        new Set(),
      );

      setGroupMemberIds(
        new Set(),
      );

      void channel.untrack();

      void supabase.removeChannel(
        channel,
      );
    };
  }, [
    conversationId,
    conversationType,
    currentUserId,
  ]);

  const participantOnline =
    Boolean(
      conversationType ===
        "direct" &&
        participantId &&
        onlineUserIds.has(
          participantId,
        ),
    );

  const onlineGroupCount =
    useMemo(() => {
      if (
        conversationType !==
        "group"
      ) {
        return 0;
      }

      let count = 0;

      onlineUserIds.forEach(
        (userId) => {
          if (
            userId !==
              currentUserId &&
            groupMemberIds.has(
              userId,
            )
          ) {
            count += 1;
          }
        },
      );

      return count;
    }, [
      conversationType,
      currentUserId,
      groupMemberIds,
      onlineUserIds,
    ]);

  const isOnline =
    conversationType ===
    "direct"
      ? participantOnline
      : onlineGroupCount > 0;

  const text = useMemo(() => {
    if (
      conversationType ===
      "direct"
    ) {
      return participantOnline
        ? "Online"
        : fallback;
    }

    if (onlineGroupCount === 1) {
      return "1 online";
    }

    if (onlineGroupCount > 1) {
      return `${onlineGroupCount} online`;
    }

    return fallback;
  }, [
    conversationType,
    fallback,
    onlineGroupCount,
    participantOnline,
  ]);

  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
          isOnline
            ? "bg-[var(--success)]"
            : "bg-[var(--muted)]/55"
        }`}
      />

      <span
        className={
          isOnline
            ? "text-[var(--success)]"
            : undefined
        }
      >
        {text}
      </span>
    </span>
  );
}