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
  participantId,
  fallback,
}: ConversationPresenceProps) {
  const [onlineUserIds, setOnlineUserIds] =
    useState<Set<string>>(
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
      return;
    }

    let active = true;

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
        await supabase.realtime.setAuth();

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

      void channel.untrack();
      void supabase.removeChannel(
        channel,
      );
    };
  }, [
    conversationId,
    currentUserId,
  ]);

  const participantOnline =
    Boolean(
      participantId &&
        onlineUserIds.has(
          participantId,
        ),
    );

  const text = useMemo(() => {
    if (participantOnline) {
      return "Online";
    }

    return fallback;
  }, [
    fallback,
    participantOnline,
  ]);

  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
          participantOnline
            ? "bg-[var(--success)]"
            : "bg-[var(--muted)]/55"
        }`}
      />

      <span
        className={
          participantOnline
            ? "text-[var(--success)]"
            : undefined
        }
      >
        {text}
      </span>
    </span>
  );
}