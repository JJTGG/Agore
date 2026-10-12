"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Bell } from "lucide-react";

import { createClient } from "@/lib/supabase/browser";

import {
  useUnreadIndicators,
  UnreadBadge,
} from "@/components/unread-indicators";

type MessageAlertKind = "direct" | "group";

type IncomingNotification = {
  id?: unknown;
  type?: unknown;
  entity_id?: unknown;
  data?: unknown;
};

const MESSAGE_ALERT_SETTINGS_KEY = "agore:message-alert-settings:v1";

let messageAudioContext: AudioContext | null = null;

function getMessageAlertAudioContext() {
  if (typeof window === "undefined" || !("AudioContext" in window)) {
    return null;
  }

  if (!messageAudioContext || messageAudioContext.state === "closed") {
    messageAudioContext = new AudioContext();
  }

  return messageAudioContext;
}

function unlockMessageAlertAudio() {
  const context = getMessageAlertAudioContext();

  if (context?.state === "suspended") {
    void context.resume().catch(() => undefined);
  }
}

function playMessageAlert(kind: MessageAlertKind) {
  if (typeof window === "undefined") return;

  try {
    const stored = window.localStorage.getItem(MESSAGE_ALERT_SETTINGS_KEY);
    const settings = stored ? JSON.parse(stored) as {
      enabled?: unknown;
      volume?: unknown;
    } : null;

    if (settings?.enabled === false) return;

    const volume = typeof settings?.volume === "number"
      ? Math.min(1, Math.max(0, settings.volume))
      : 0.42;

    if (volume <= 0) return;

    const context = getMessageAlertAudioContext();

    if (!context || context.state !== "running") return;

    const notes = kind === "group"
      ? [
          { frequency: 587.33, offset: 0, duration: 0.095 },
          { frequency: 739.99, offset: 0.13, duration: 0.11 },
          { frequency: 880, offset: 0.29, duration: 0.12 },
        ]
      : [
          { frequency: 783.99, offset: 0, duration: 0.11 },
          { frequency: 987.77, offset: 0.14, duration: 0.14 },
        ];

    const startAt = context.currentTime + 0.015;

    for (const note of notes) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const noteStart = startAt + note.offset;
      const noteEnd = noteStart + note.duration;

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(note.frequency, noteStart);
      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(
        Math.max(0.0002, volume * 0.16),
        noteStart + 0.012,
      );
      gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(noteStart);
      oscillator.stop(noteEnd + 0.015);
    }
  } catch {
    // A sound alert is optional and must never interrupt messaging.
  }
}

type NotificationBellLinkProps = {
  className?: string;
  iconSize?: number;
};

export default function NotificationBellLink({
  className = "flex h-10 w-10 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]",
  iconSize = 19,
}: NotificationBellLinkProps) {
  const { unreadNotifications } = useUnreadIndicators();
  const seenNotificationIds = useRef(new Set<string>());

  useEffect(() => {
    let active = true;
    let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null;
    const supabase = createClient();

    const unlock = () => unlockMessageAlertAudio();
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);

    async function subscribeToMessageAlerts() {
      const { data: { user }, error } = await supabase.auth.getUser();

      if (!active || error || !user) return;

      channel = supabase
        .channel(`agore-message-alerts-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `recipient_id=eq.${user.id}`,
          },
          (payload) => {
            const notification = payload.new as IncomingNotification;
            const id = typeof notification.id === "string" ? notification.id : null;
            const conversationId = typeof notification.entity_id === "string"
              ? notification.entity_id
              : null;

            if (
              !id ||
              notification.type !== "message" ||
              seenNotificationIds.current.has(id)
            ) return;

            seenNotificationIds.current.add(id);
            if (seenNotificationIds.current.size > 100) {
              const oldest = seenNotificationIds.current.values().next().value;
              if (oldest) seenNotificationIds.current.delete(oldest);
            }

            // Avoid an alert when the recipient is already reading this chat.
            if (
              conversationId &&
              window.location.pathname.startsWith(
                `/messages/${encodeURIComponent(conversationId)}`,
              )
            ) return;

            const data = notification.data && typeof notification.data === "object"
              ? notification.data as Record<string, unknown>
              : {};
            const knownType = data.conversation_type;

            if (knownType === "group") {
              playMessageAlert("group");
              return;
            }

            if (knownType === "direct") {
              playMessageAlert("direct");
              return;
            }

            if (!conversationId) {
              playMessageAlert("direct");
              return;
            }

            void supabase
              .from("conversations")
              .select("type")
              .eq("id", conversationId)
              .maybeSingle()
              .then(
                ({ data: conversation }) => {
                  if (!active) return;
                  playMessageAlert(conversation?.type === "group" ? "group" : "direct");
                },
                () => undefined,
              );
          },
        )
        .subscribe();
    }

    void subscribeToMessageAlerts();

    return () => {
      active = false;
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

  return (
    <Link
      href="/notifications"
      aria-label={
        unreadNotifications > 0
          ? `Notifications, ${unreadNotifications} unread`
          : "Notifications"
      }
      title="Notifications"
      className={className}
    >
      <span className="relative inline-flex">
        <Bell size={iconSize} />
        <UnreadBadge count={unreadNotifications} />
      </span>
    </Link>
  );
}