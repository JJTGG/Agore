"use client";

import { useEffect, useState } from "react";
import {
  AtSign,
  Bell,
  Check,
  MessageCircle,
  Play,
  Repeat2,
  ThumbsUp,
  Users,
  UserRoundPlus,
  Volume2,
} from "lucide-react";

import {
  CALL_RINGTONE_OPTIONS,
  DEFAULT_CALL_RINGTONE_SETTINGS,
  getCallRingtoneSettings,
  previewCallRingtone,
  saveCallRingtoneSettings,
  stopCallRingtone,
  type CallRingtoneSettings,
} from "@/lib/audio/call-ringtones";

import type {
  NotificationPreferenceKey,
  NotificationPreferences,
  UpdateNotificationPreference,
} from "./types";

type MessageAlertSettings = {
  enabled: boolean;
  volume: number;
};

const MESSAGE_ALERT_SETTINGS_KEY = "agore:message-alert-settings:v1";
const DEFAULT_MESSAGE_ALERT_SETTINGS: MessageAlertSettings = {
  enabled: true,
  volume: 42,
};

function getMessageAlertSettings(): MessageAlertSettings {
  try {
    const stored = window.localStorage.getItem(MESSAGE_ALERT_SETTINGS_KEY);
    if (!stored) return DEFAULT_MESSAGE_ALERT_SETTINGS;
    const value = JSON.parse(stored) as { enabled?: unknown; volume?: unknown };
    return {
      enabled: value.enabled !== false,
      volume: typeof value.volume === "number"
        ? Math.round(Math.min(1, Math.max(0, value.volume)) * 100)
        : DEFAULT_MESSAGE_ALERT_SETTINGS.volume,
    };
  } catch {
    return DEFAULT_MESSAGE_ALERT_SETTINGS;
  }
}

function saveMessageAlertSettings(
  current: MessageAlertSettings,
  patch: Partial<MessageAlertSettings>,
): MessageAlertSettings {
  const next = { ...current, ...patch };
  try {
    window.localStorage.setItem(
      MESSAGE_ALERT_SETTINGS_KEY,
      JSON.stringify({ enabled: next.enabled, volume: next.volume / 100 }),
    );
  } catch {
    // Keep settings errors from interrupting notification controls.
  }
  return next;
}

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
    description: "When someone follows your account.",
    icon: UserRoundPlus,
  },
  {
    key: "reactions",
    label: "Reactions",
    description: "When someone reacts to your posts.",
    icon: ThumbsUp,
  },
  {
    key: "comments",
    label: "Comments",
    description: "When someone comments on your posts.",
    icon: MessageCircle,
  },
  {
    key: "reposts",
    label: "Reposts",
    description: "When someone reposts your content.",
    icon: Repeat2,
  },
  {
    key: "messages",
    label: "Direct messages",
    description: "Notifications related to your direct conversations.",
    icon: MessageCircle,
  },
  {
    key: "group_activity",
    label: "Group conversations",
    description: "Activity in group conversations you're part of.",
    icon: Users,
  },
  {
    key: "mentions",
    label: "Mentions",
    description: "When someone tags you in a post.",
    icon: AtSign,
  },
];

export default function NotificationsSection({
  preferences,
  onUpdatePreference,
  savingKey = null,
}: NotificationsSectionProps) {
  const [ringtoneSettings, setRingtoneSettings] =
    useState<CallRingtoneSettings>(DEFAULT_CALL_RINGTONE_SETTINGS);
  const [ringtoneSettingsLoaded, setRingtoneSettingsLoaded] = useState(false);
  const [messageAlertSettings, setMessageAlertSettings] =
    useState<MessageAlertSettings>(DEFAULT_MESSAGE_ALERT_SETTINGS);
  const [messageAlertSettingsLoaded, setMessageAlertSettingsLoaded] = useState(false);

  useEffect(() => {
    setRingtoneSettings(getCallRingtoneSettings());
    setRingtoneSettingsLoaded(true);
  }, []);

  useEffect(() => {
    setMessageAlertSettings(getMessageAlertSettings());
    setMessageAlertSettingsLoaded(true);
  }, []);

  const updateMessageAlertSettings = (patch: Partial<MessageAlertSettings>) => {
    const next = saveMessageAlertSettings(messageAlertSettings, patch);
    setMessageAlertSettings(next);
  };

  const updateRingtoneSettings = (patch: Partial<CallRingtoneSettings>) => {
    const next = saveCallRingtoneSettings(patch);
    setRingtoneSettings(next);

    if (!next.enabled) {
      stopCallRingtone();
    }
  };

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
            Control which supported activity categories can generate
            notifications for your account.
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
                  <h3 className="text-sm font-semibold">{option.label}</h3>
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
                onClick={() => onUpdatePreference(option.key, !enabled)}
                className="flex shrink-0 items-center gap-3 rounded-xl p-1 transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="hidden text-xs font-medium text-[var(--muted)] sm:inline">
                  {isSaving ? "Saving…" : enabled ? "On" : "Off"}
                </span>

                <span
                  className={
                    "relative h-6 w-11 rounded-full transition " +
                    (enabled
                      ? "bg-[var(--accent)]"
                      : "bg-[var(--muted)]/40")
                  }
                >
                  <span
                    className={
                      "absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition " +
                      (enabled ? "left-6" : "left-1")
                    }
                  />
                </span>
              </button>
            </div>
          );
        })}
      </div>

      <p className="mt-6 border-t border-[var(--border)] pt-4 text-xs leading-5 text-[var(--muted)]">
        These switches manage supported in-app notification preferences.
        Browser or phone push delivery depends on separate delivery support.
      </p>

      <div className="mt-8 border-t border-[var(--border)] pt-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <Volume2 size={19} />
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
              Messages
            </p>
            <h2 className="mt-1.5 text-lg font-semibold tracking-tight">
              Message alert sounds
            </h2>
            <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
              Direct messages and group chats have distinct alert tones. These
              controls affect message sounds only; call ringtones stay separate.
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">Play message alert sounds</p>
              <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                Turn direct-message and group-chat sounds on or off.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={messageAlertSettings.enabled}
              aria-label="Play message alert sounds"
              onClick={() =>
                updateMessageAlertSettings({
                  enabled: !messageAlertSettings.enabled,
                })
              }
              disabled={!messageAlertSettingsLoaded}
              className={
                "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] " +
                (messageAlertSettings.enabled
                  ? "bg-[var(--accent)]"
                  : "bg-[var(--muted)]/40")
              }
            >
              <span
                className={
                  "absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition " +
                  (messageAlertSettings.enabled ? "left-6" : "left-1")
                }
              />
            </button>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between gap-4">
              <label htmlFor="agore-message-alert-volume" className="text-sm font-semibold">
                Message alert volume
              </label>
              <span className="min-w-12 text-right text-sm tabular-nums text-[var(--muted)]">
                {messageAlertSettings.volume}%
              </span>
            </div>
            <input
              id="agore-message-alert-volume"
              type="range"
              min={0}
              max={100}
              step={5}
              value={messageAlertSettings.volume}
              onChange={(event) =>
                updateMessageAlertSettings({ volume: Number(event.target.value) })
              }
              disabled={!messageAlertSettingsLoaded || !messageAlertSettings.enabled}
              className="mt-4 w-full accent-[var(--accent)] disabled:opacity-40"
            />
            <div className="mt-1 flex justify-between text-[11px] text-[var(--muted)]">
              <span>Quiet</span>
              <span>Loud</span>
            </div>
          </div>
        </div>

        <p className="mt-4 text-xs leading-5 text-[var(--muted)]">
          These preferences are saved locally for this browser. Browser audio
          permissions still apply; background or closed-app push alerts are separate.
        </p>
      </div>

      <div className="mt-8 border-t border-[var(--border)] pt-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <Volume2 size={19} />
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
              Calls
            </p>
            <h2 className="mt-1.5 text-lg font-semibold tracking-tight">
              Call ringtone
            </h2>
            <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
              Choose the sound for incoming Agoré audio calls. Preview each
              tone and set its volume for this browser.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-3" aria-label="Call ringtone options">
          {CALL_RINGTONE_OPTIONS.map((option) => {
            const selected = ringtoneSettings.ringtone === option.id;

            return (
              <div
                key={option.id}
                className={
                  "flex items-center gap-3 rounded-2xl border p-3 transition sm:p-4 " +
                  (selected
                    ? "border-[var(--accent)]/60 bg-[var(--accent-soft)]/40"
                    : "border-[var(--border)] bg-[var(--background)]")
                }
              >
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => updateRingtoneSettings({ ringtone: option.id })}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  <span
                    className={
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border " +
                      (selected
                        ? "border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent)]"
                        : "border-[var(--border)] text-[var(--muted)]")
                    }
                    aria-hidden="true"
                  >
                    {selected ? <Check size={18} /> : <Volume2 size={18} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">
                      {option.name}
                    </span>
                    <span className="mt-0.5 block text-xs leading-5 text-[var(--muted)]">
                      {option.description}
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    previewCallRingtone(option.id, ringtoneSettings.volume)
                  }
                  aria-label={"Preview " + option.name}
                  title={"Preview " + option.name}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[var(--foreground)] transition hover:border-[var(--accent)]/50 hover:bg-[var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  <Play size={16} fill="currentColor" />
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4">
          <div className="flex items-center justify-between gap-4">
            <label
              htmlFor="agore-call-ringtone-volume"
              className="text-sm font-semibold"
            >
              Ringtone volume
            </label>
            <span className="min-w-12 text-right text-sm tabular-nums text-[var(--muted)]">
              {ringtoneSettings.volume}%
            </span>
          </div>
          <input
            id="agore-call-ringtone-volume"
            type="range"
            min={0}
            max={100}
            step={5}
            value={ringtoneSettings.volume}
            onChange={(event) =>
              updateRingtoneSettings({ volume: Number(event.target.value) })
            }
            disabled={!ringtoneSettingsLoaded}
            className="mt-4 w-full accent-[var(--accent)]"
          />
          <div className="mt-1 flex justify-between text-[11px] text-[var(--muted)]">
            <span>Quiet</span>
            <span>Loud</span>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Play call ringtones</h3>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
              Turn off to silence generated call tones in this browser.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-label="Play call ringtones"
            aria-checked={ringtoneSettings.enabled}
            disabled={!ringtoneSettingsLoaded}
            onClick={() =>
              updateRingtoneSettings({ enabled: !ringtoneSettings.enabled })
            }
            className="flex shrink-0 items-center gap-3 rounded-xl p-1 transition disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="hidden text-xs font-medium text-[var(--muted)] sm:inline">
              {ringtoneSettings.enabled ? "On" : "Off"}
            </span>
            <span
              className={
                "relative h-6 w-11 rounded-full transition " +
                (ringtoneSettings.enabled
                  ? "bg-[var(--accent)]"
                  : "bg-[var(--muted)]/40")
              }
            >
              <span
                className={
                  "absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition " +
                  (ringtoneSettings.enabled ? "left-6" : "left-1")
                }
              />
            </span>
          </button>
        </div>

        <p className="mt-4 text-xs leading-5 text-[var(--muted)]">
          Ringtone choice and volume are saved locally on this browser. Preview
          works after you tap it; browsers may restrict sound until a user
          gesture has occurred. App-closed ringing is not guaranteed.
        </p>
      </div>
    </section>
  );
}
