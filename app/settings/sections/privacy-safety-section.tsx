
"use client";

import {
  Eye,
  EyeOff,
  LockKeyhole,
  ShieldCheck,
  Users,
} from "lucide-react";

import type {
  ActivityVisibility,
  MessageAudience,
  UserSettings,
} from "./types";

type PrivacySafetySectionProps = {
  userSettings: UserSettings;
  activityVisibility: ActivityVisibility;
  onUpdateSetting: (
    key: "allow_messages_from" | "show_activity_status",
    value: MessageAudience | boolean,
  ) => void;
  onUpdateActivityVisibility: (
    value: ActivityVisibility,
  ) => void;
  savingKey?: string | null;
};

const messageAudienceOptions: {
  value: MessageAudience;
  label: string;
  description: string;
}[] = [
  {
    value: "everyone",
    label: "Everyone",
    description:
      "Allow messages from anyone on Agoré, subject to account and safety restrictions.",
  },
  {
    value: "followers",
    label: "Followers",
    description:
      "Limit incoming messages to accounts that follow you.",
  },
];

const activityVisibilityOptions: {
  value: ActivityVisibility;
  label: string;
  description: string;
}[] = [
  {
    value: "public",
    label: "Public",
    description:
      "Your activity visibility setting allows public access.",
  },
  {
    value: "private",
    label: "Private",
    description:
      "Restrict activity visibility to a more limited audience.",
  },
  {
    value: "confidential",
    label: "Confidential",
    description:
      "Use the most restrictive activity visibility option available in this setting.",
  },
];

function SettingRow({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 py-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--background)] text-[var(--muted)]">
          {icon}
        </span>

        <div className="min-w-0">
          <h3 className="text-sm font-semibold">
            {title}
          </h3>
          <p className="mt-1 max-w-xl text-sm leading-6 text-[var(--muted)]">
            {description}
          </p>
        </div>
      </div>

      <div className="w-full shrink-0 sm:w-64">
        {children}
      </div>
    </div>
  );
}

export default function PrivacySafetySection({
  userSettings,
  activityVisibility,
  onUpdateSetting,
  onUpdateActivityVisibility,
  savingKey = null,
}: PrivacySafetySectionProps) {
  return (
    <section
      aria-labelledby="settings-privacy-safety-title"
      className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <ShieldCheck size={19} />
        </span>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
            Privacy & Safety
          </p>

          <h2
            id="settings-privacy-safety-title"
            className="mt-1.5 text-lg font-semibold tracking-tight"
          >
            Control your privacy
          </h2>

          <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
            Choose how people can contact you and how
            your activity visibility is configured.
          </p>
        </div>
      </div>

      <div className="mt-5 divide-y divide-[var(--border)]">
        <SettingRow
          icon={<Users size={18} />}
          title="Who can message you"
          description="Choose which accounts are allowed to start a conversation with you."
        >
          <div className="space-y-2">
            {messageAudienceOptions.map((option) => {
              const selected =
                userSettings.allow_messages_from ===
                option.value;

              return (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                    selected
                      ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                      : "border-[var(--border)] bg-[var(--background)] hover:border-[var(--muted)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="allow_messages_from"
                    value={option.value}
                    checked={selected}
                    disabled={
                      savingKey === "allow_messages_from"
                    }
                    onChange={() =>
                      onUpdateSetting(
                        "allow_messages_from",
                        option.value,
                      )
                    }
                    className="mt-1 accent-[var(--accent)]"
                  />

                  <span className="min-w-0">
                    <span className="block text-sm font-medium">
                      {option.label}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-[var(--muted)]">
                      {option.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </SettingRow>

        <SettingRow
          icon={
            userSettings.show_activity_status ? (
              <Eye size={18} />
            ) : (
              <EyeOff size={18} />
            )
          }
          title="Activity status"
          description="Control whether Agoré displays your activity status where supported."
        >
          <button
            type="button"
            role="switch"
            aria-checked={userSettings.show_activity_status}
            disabled={
              savingKey === "show_activity_status"
            }
            onClick={() =>
              onUpdateSetting(
                "show_activity_status",
                !userSettings.show_activity_status,
              )
            }
            className={`flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm transition disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <span className="font-medium">
              {userSettings.show_activity_status
                ? "Visible"
                : "Hidden"}
            </span>

            <span
              className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                userSettings.show_activity_status
                  ? "bg-[var(--accent)]"
                  : "bg-[var(--muted)]/40"
              }`}
            >
              <span
                className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition ${
                  userSettings.show_activity_status
                    ? "left-6"
                    : "left-1"
                }`}
              />
            </span>
          </button>
        </SettingRow>

        <SettingRow
          icon={<LockKeyhole size={18} />}
          title="Activity visibility"
          description="Choose the visibility level used by Agoré's activity visibility setting."
        >
          <div className="space-y-2">
            {activityVisibilityOptions.map((option) => {
              const selected =
                activityVisibility === option.value;

              return (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                    selected
                      ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                      : "border-[var(--border)] bg-[var(--background)] hover:border-[var(--muted)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="activity_visibility"
                    value={option.value}
                    checked={selected}
                    disabled={
                      savingKey === "activity_visibility"
                    }
                    onChange={() =>
                      onUpdateActivityVisibility(
                        option.value,
                      )
                    }
                    className="mt-1 accent-[var(--accent)]"
                  />

                  <span className="min-w-0">
                    <span className="block text-sm font-medium">
                      {option.label}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-[var(--muted)]">
                      {option.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </SettingRow>
      </div>

      <p className="mt-4 text-xs leading-5 text-[var(--muted)]">
        These preferences configure the privacy options
        available in Settings. They do not replace
        server-side access checks or guarantee that every
        activity surface already enforces each visibility
        level.
      </p>
    </section>
  );
}
