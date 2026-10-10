
"use client";

import {
  Bell,
  MessageCircle,
  Repeat2,
  ThumbsUp,
  Users,
  UserRoundPlus,
} from "lucide-react";

import type {
  NotificationPreferenceKey,
  NotificationPreferences,
  UpdateNotificationPreference,
} from "./types";

type NotificationsSectionProps = {
  preferences: NotificationPreferences;
  onUpdatePreference: UpdateNotificationPreference;
  savingKey?: string | null;
};

const notificationOptions: {
  key: NotificationPreferenceKey;
  label: string;
  description: string;
  icon: typeof Bell;
}[] = [
  {
    key: "follows",
    label: "New followers",
    description:
      "When someone follows your account.",
    icon: UserRoundPlus,
  },
  {
    key: "reactions",
    label: "Reactions",
    description:
      "When someone reacts to your posts.",
    icon: ThumbsUp,
  },
  {
    key: "comments",
    label: "Comments",
    description:
      "When someone comments on your posts.",
    icon: MessageCircle,
  },
  {
    key: "reposts",
    label: "Reposts",
    description:
      "When someone reposts your content.",
    icon: Repeat2,
  },
  {
    key: "messages",
    label: "Direct messages",
    description:
      "Notifications related to your direct conversations.",
    icon: MessageCircle,
  },
  {
    key: "group_activity",
    label: "Group conversations",
    description:
      "Activity in group conversations you're part of.",
    icon: Users,
  },
];

export default function NotificationsSection({
  preferences,
  onUpdatePreference,
  savingKey = null,
}: NotificationsSectionProps) {
  return (
    <section
      aria-labelledby="settings-notifications-title"
      className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <Bell size={19} />
        </span>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
            Notifications
          </p>

          <h2
            id="settings-notifications-title"
            className="mt-1.5 text-lg font-semibold tracking-tight"
          >
            Choose what you're notified about
          </h2>

          <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
            Control which supported activity categories
            can generate notifications for your account.
          </p>
        </div>
      </div>

      <div className="mt-6 divide-y divide-[var(--border)]">
        {notificationOptions.map((option) => {
          const enabled = preferences[option.key];
          const isSaving = savingKey === option.key;
          const Icon = option.icon;

          return (
            <div
              key={option.key}
              className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--background)] text-[var(--muted)]">
                  <Icon size={18} />
                </span>

                <div className="min-w-0">
                  <h3 className="text-sm font-semibold">
                    {option.label}
                  </h3>

                  <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                    {option.description}
                  </p>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-label={option.label}
                aria-checked={enabled}
                disabled={isSaving}
                onClick={() =>
                  onUpdatePreference(
                    option.key,
                    !enabled,
                  )
                }
                className="flex shrink-0 items-center gap-3 rounded-xl p-1 transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="hidden text-xs font-medium text-[var(--muted)] sm:inline">
                  {isSaving
                    ? "Saving…"
                    : enabled
                      ? "On"
                      : "Off"}
                </span>

                <span
                  className={`relative h-6 w-11 rounded-full transition ${
                    enabled
                      ? "bg-[var(--accent)]"
                      : "bg-[var(--muted)]/40"
                  }`}
                >
                  <span
                    className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition ${
                      enabled
                        ? "left-6"
                        : "left-1"
                    }`}
                  />
                </span>
              </button>
            </div>
          );
        })}
      </div>

      <p className="mt-6 border-t border-[var(--border)] pt-4 text-xs leading-5 text-[var(--muted)]">
        These switches manage the notification preferences
        available to Agoré. Delivery through browser or
        phone push notifications depends on separate
        delivery support.
      </p>
    </section>
  );
}
