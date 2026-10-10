
"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Settings2,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/browser";

import AccountProfileSection from "./sections/account-profile-section";
import AppearanceSection from "./sections/appearance-section";
import LoginSecuritySection from "./sections/login-security-section";
import NotificationsSection from "./sections/notifications-section";
import PrivacySafetySection from "./sections/privacy-safety-section";
import SessionAboutSection from "./sections/session-about-section";

import type {
  ActivityVisibility,
  MessageAudience,
  NotificationPreferenceKey,
  NotificationPreferences,
  ProfileSummary,
  Theme,
  UserSettingKey,
  UserSettings,
} from "./sections/types";

const DEFAULT_USER_SETTINGS: Omit<
  UserSettings,
  "user_id"
> = {
  theme: "system",
  allow_messages_from: "everyone",
  show_activity_status: true,
  activity_visibility: "public",
};

const DEFAULT_NOTIFICATION_PREFERENCES: Omit<
  NotificationPreferences,
  "user_id"
> = {
  follows: true,
  reactions: true,
  comments: true,
  reposts: true,
  messages: true,
  group_activity: true,
};

const supabase = createClient();

function isTheme(value: unknown): value is Theme {
  return (
    value === "system" ||
    value === "light" ||
    value === "dark"
  );
}

function isMessageAudience(
  value: unknown,
): value is MessageAudience {
  return (
    value === "everyone" ||
    value === "followers"
  );
}

function isActivityVisibility(
  value: unknown,
): value is ActivityVisibility {
  return (
    value === "public" ||
    value === "private" ||
    value === "confidential"
  );
}

export default function SettingsPage() {
  const router = useRouter();

  const [profile, setProfile] =
    useState<ProfileSummary | null>(null);

  const [accountEmail, setAccountEmail] =
    useState<string | null>(null);

  const [emailVerified, setEmailVerified] =
    useState(false);

  const [userSettings, setUserSettings] =
    useState<UserSettings | null>(null);

  const [
    notificationPreferences,
    setNotificationPreferences,
  ] = useState<NotificationPreferences | null>(
    null,
  );

  const [loading, setLoading] = useState(true);

  const [savingKey, setSavingKey] =
    useState<string | null>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const initials = useMemo(() => {
    const value =
      profile?.display_name ?? "Agoré user";

    return (
      value
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(
          (part) => part[0]?.toUpperCase() ?? "",
        )
        .join("") || "A"
    );
  }, [profile]);

  useEffect(() => {
    let active = true;

    async function loadSettings() {
      setLoading(true);
      setError("");

      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) {
          throw authError;
        }

        if (!user) {
          if (active) {
            router.replace("/auth");
          }
          return;
        }

        const [
          profileResult,
          settingsResult,
          notificationResult,
        ] = await Promise.all([
          supabase
            .from("profiles")
            .select("display_name, username")
            .eq("id", user.id)
            .maybeSingle(),

          supabase
            .from("user_settings")
            .select(
              [
                "user_id",
                "theme",
                "allow_messages_from",
                "show_activity_status",
                "activity_visibility",
              ].join(", "),
            )
            .eq("user_id", user.id)
            .maybeSingle(),

          supabase
            .from("notification_preferences")
            .select(
              [
                "user_id",
                "follows",
                "reactions",
                "comments",
                "reposts",
                "messages",
                "group_activity",
              ].join(", "),
            )
            .eq("user_id", user.id)
            .maybeSingle(),
        ]);

        if (profileResult.error) {
          throw profileResult.error;
        }

        if (settingsResult.error) {
          throw settingsResult.error;
        }

        if (notificationResult.error) {
          throw notificationResult.error;
        }

        if (!active) {
          return;
        }

        const storedSettings =
          settingsResult.data as
            | Partial<UserSettings>
            | null;

        const loadedSettings: UserSettings = {
          user_id: user.id,

          theme: isTheme(storedSettings?.theme)
            ? storedSettings.theme
            : DEFAULT_USER_SETTINGS.theme,

          allow_messages_from: isMessageAudience(
            storedSettings?.allow_messages_from,
          )
            ? storedSettings.allow_messages_from
            : DEFAULT_USER_SETTINGS.allow_messages_from,

          show_activity_status:
            typeof storedSettings?.show_activity_status ===
            "boolean"
              ? storedSettings.show_activity_status
              : DEFAULT_USER_SETTINGS.show_activity_status,

          activity_visibility: isActivityVisibility(
            storedSettings?.activity_visibility,
          )
            ? storedSettings.activity_visibility
            : DEFAULT_USER_SETTINGS.activity_visibility,
        };

        const storedNotifications =
          notificationResult.data as
            | Partial<NotificationPreferences>
            | null;

        const loadedNotifications: NotificationPreferences = {
          user_id: user.id,

          follows:
            typeof storedNotifications?.follows ===
            "boolean"
              ? storedNotifications.follows
              : DEFAULT_NOTIFICATION_PREFERENCES.follows,

          reactions:
            typeof storedNotifications?.reactions ===
            "boolean"
              ? storedNotifications.reactions
              : DEFAULT_NOTIFICATION_PREFERENCES.reactions,

          comments:
            typeof storedNotifications?.comments ===
            "boolean"
              ? storedNotifications.comments
              : DEFAULT_NOTIFICATION_PREFERENCES.comments,

          reposts:
            typeof storedNotifications?.reposts ===
            "boolean"
              ? storedNotifications.reposts
              : DEFAULT_NOTIFICATION_PREFERENCES.reposts,

          messages:
            typeof storedNotifications?.messages ===
            "boolean"
              ? storedNotifications.messages
              : DEFAULT_NOTIFICATION_PREFERENCES.messages,

          group_activity:
            typeof storedNotifications?.group_activity ===
            "boolean"
              ? storedNotifications.group_activity
              : DEFAULT_NOTIFICATION_PREFERENCES.group_activity,
        };

        setProfile(
          (profileResult.data as ProfileSummary | null) ??
            null,
        );

        setAccountEmail(user.email ?? null);
        setEmailVerified(
          Boolean(user.email_confirmed_at),
        );

        setUserSettings(loadedSettings);
        setNotificationPreferences(
          loadedNotifications,
        );

        document.documentElement.dataset.theme =
          loadedSettings.theme;
      } catch (loadError) {
        console.error(
          "Failed to load Agoré settings:",
          loadError,
        );

        if (active) {
          setError(
            "Unable to load your settings. Please try again.",
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadSettings();

    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const status =
      url.searchParams.get("email_change");

    if (!status) {
      return;
    }

    if (status === "confirmation-received") {
      setSuccess(
        "The email confirmation link was processed. Check the account email shown below to confirm the current address.",
      );
    } else if (status === "invalid-link") {
      setError(
        "That email confirmation link is invalid or expired. Request a new email change and use the latest link.",
      );
    } else if (status === "error") {
      setError(
        "The email change could not be completed. Check your email instructions and try again.",
      );
    }

    // Remove the one-time callback status from the URL.
    url.searchParams.delete("email_change");

    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, []);

  async function updateUserSetting(
    key: UserSettingKey,
    value: UserSettings[UserSettingKey],
  ): Promise<boolean> {
    if (!userSettings) {
      return false;
    }

    const previousSettings = userSettings;

    const nextSettings = {
      ...previousSettings,
      [key]: value,
    } as UserSettings;

    setUserSettings(nextSettings);

    // Apply theme changes before waiting for persistence.
    if (key === "theme") {
      document.documentElement.dataset.theme =
        value as Theme;
    }

    setSavingKey(key);
    setError("");
    setSuccess("");

    try {
      const { error: updateError } =
        await supabase
          .from("user_settings")
          .upsert(nextSettings, {
            onConflict: "user_id",
          });

      if (updateError) {
        throw updateError;
      }

      setSuccess(
        key === "theme"
          ? "Appearance saved."
          : "Settings saved.",
      );

      return true;
    } catch (updateError) {
      console.error(
        "Failed to update Agoré user setting:",
        updateError,
      );

      setUserSettings(previousSettings);

      if (key === "theme") {
        document.documentElement.dataset.theme =
          previousSettings.theme;
      } else {
        setError(
          "Unable to save that setting. Your previous preference has been restored.",
        );
      }

      return false;
    } finally {
      setSavingKey(null);
    }
  }

  function updatePrivacySetting(
    key:
      | "allow_messages_from"
      | "show_activity_status",
    value: MessageAudience | boolean,
  ) {
    if (
      key === "allow_messages_from" &&
      isMessageAudience(value)
    ) {
      void updateUserSetting(key, value);
      return;
    }

    if (
      key === "show_activity_status" &&
      typeof value === "boolean"
    ) {
      void updateUserSetting(key, value);
    }
  }

  function updateActivityVisibility(
    value: ActivityVisibility,
  ) {
    void updateUserSetting(
      "activity_visibility",
      value,
    );
  }

  async function updateNotification(
    key: NotificationPreferenceKey,
    value: boolean,
  ) {
    if (!notificationPreferences) {
      return;
    }

    const previousPreferences =
      notificationPreferences;

    const nextPreferences = {
      ...previousPreferences,
      [key]: value,
    };

    setNotificationPreferences(nextPreferences);
    setSavingKey(`notification:${key}`);
    setError("");
    setSuccess("");

    try {
      const { error: updateError } =
        await supabase
          .from("notification_preferences")
          .upsert(nextPreferences, {
            onConflict: "user_id",
          });

      if (updateError) {
        throw updateError;
      }

      setSuccess(
        "Notification preference saved.",
      );
    } catch (updateError) {
      console.error(
        "Failed to update Agoré notification preference:",
        updateError,
      );

      setNotificationPreferences(
        previousPreferences,
      );

      setError(
        "Unable to save that notification preference. Your previous choice has been restored.",
      );
    } finally {
      setSavingKey(null);
    }
  }

  async function signOut() {
    const { error: signOutError } =
      await supabase.auth.signOut();

    if (signOutError) {
      throw signOutError;
    }

    router.replace("/auth");
    router.refresh();
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[var(--background)] px-4 py-6 text-[var(--foreground)] sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <div className="animate-pulse space-y-6">
            <div className="h-10 w-24 rounded-full bg-[var(--surface-muted)]" />

            <div className="space-y-3">
              <div className="h-3 w-20 rounded-full bg-[var(--surface-muted)]" />
              <div className="h-10 w-56 rounded bg-[var(--surface-muted)]" />
              <div className="h-4 w-80 max-w-full rounded bg-[var(--surface-muted)]" />
            </div>

            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-44 rounded-3xl border border-[var(--border)] bg-[var(--surface)]"
              />
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (
    error &&
    (!userSettings ||
      !notificationPreferences)
  ) {
    return (
      <main className="min-h-screen bg-[var(--background)] px-4 py-6 text-[var(--foreground)] sm:px-6">
        <div className="mx-auto max-w-2xl">
          <Link
            href="/home"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium"
          >
            <ArrowLeft size={16} />
            Back to home
          </Link>

          <section className="mt-8 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8">
            <h1 className="text-xl font-semibold">
              Settings unavailable
            </h1>

            <p
              role="alert"
              className="mt-3 text-sm leading-6 text-[var(--danger)]"
            >
              {error}
            </p>

            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white"
            >
              Retry
            </button>
          </section>
        </div>
      </main>
    );
  }

  if (!userSettings || !notificationPreferences) {
    return null;
  }

  const notificationSavingKey =
    savingKey?.startsWith("notification:")
      ? savingKey.slice("notification:".length)
      : savingKey;

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto w-full max-w-4xl px-4 pb-10 sm:px-6 lg:px-8">
        <header className="sticky top-0 z-30 bg-[color:var(--background)]/95 backdrop-blur">
          <div className="flex min-h-[72px] items-center justify-between border-b border-[var(--border)]">
            <Link
              href="/home"
              className="inline-flex items-center gap-2 text-sm font-semibold transition hover:text-[var(--accent)]"
            >
              <ArrowLeft size={16} />
              Home
            </Link>

            <Link
              href="/settings"
              aria-label="Agoré settings"
              className="flex items-center gap-2"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--foreground)] text-xs font-black text-[var(--background)]">
                A
              </span>

              <span className="hidden text-sm font-bold sm:block">
                Agoré
              </span>
            </Link>
          </div>
        </header>

        <section className="py-9 sm:py-12">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
                Control your space
              </p>

              <h1 className="mt-3 text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">
                Settings
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)] sm:text-base sm:leading-7">
                Manage your account, protect your privacy,
                choose your appearance, and decide which
                supported activities deserve your attention.
              </p>
            </div>

            <div className="hidden items-center gap-3 sm:flex">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent-soft)] text-sm font-bold text-[var(--accent)]">
                {initials}
              </span>

              <div className="min-w-0">
                <p className="max-w-44 truncate text-sm font-semibold">
                  {profile?.display_name ?? "Agoré user"}
                </p>

                <p className="mt-0.5 max-w-44 truncate text-xs text-[var(--muted)]">
                  @{profile?.username ?? "unknown"}
                </p>
              </div>
            </div>
          </div>

          {error ? (
            <div
              role="alert"
              className="mt-6 rounded-2xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-4 py-3"
            >
              <p className="text-sm leading-6 text-[var(--danger)]">
                {error}
              </p>
            </div>
          ) : null}

          {success ? (
            <div
              role="status"
              className="mt-6 flex items-start gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm leading-6"
            >
              <Check
                size={16}
                className="mt-0.5 shrink-0 text-[var(--accent)]"
              />
              <p>{success}</p>
            </div>
          ) : null}
        </section>

        <div className="space-y-5 sm:space-y-6">
          <AccountProfileSection
            profile={profile}
            accountEmail={accountEmail}
            emailVerified={emailVerified}
          />

          <LoginSecuritySection
            accountEmail={accountEmail}
          />

          <PrivacySafetySection
            userSettings={userSettings}
            activityVisibility={
              userSettings.activity_visibility
            }
            onUpdateSetting={updatePrivacySetting}
            onUpdateActivityVisibility={
              updateActivityVisibility
            }
            savingKey={savingKey}
          />

          <NotificationsSection
            preferences={notificationPreferences}
            onUpdatePreference={updateNotification}
            savingKey={notificationSavingKey}
          />

          <AppearanceSection
            theme={userSettings.theme}
            onUpdateTheme={(value) =>
              updateUserSetting("theme", value)
            }
          />

          <SessionAboutSection
            accountEmail={accountEmail}
            onSignOut={signOut}
          />
        </div>

        <footer className="mt-10 flex flex-col gap-2 border-t border-[var(--border)] py-6 text-xs text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between">
          <p>Agoré · Your social space.</p>

          <Link
            href="/home"
            className="font-semibold transition hover:text-[var(--foreground)]"
          >
            Return home
          </Link>
        </footer>
      </div>
    </main>
  );
}
