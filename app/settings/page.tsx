"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Bell,
  Check,
  ChevronRight,
  LogOut,
  Lock,
  Monitor,
  Moon,
  Palette,
  Settings2,
  Shield,
  Sun,
  UserRound,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/browser";
import ActivityVisibilitySetting from "./activity-visibility-setting";

type Theme =
  | "system"
  | "light"
  | "dark";

type MessageAudience =
  | "everyone"
  | "followers";

type UserSettings = {
  user_id: string;
  theme: Theme;
  allow_messages_from: MessageAudience;
  show_activity_status: boolean;
};

type NotificationPreferences = {
  user_id: string;
  follows: boolean;
  reactions: boolean;
  comments: boolean;
  reposts: boolean;
  messages: boolean;
  group_activity: boolean;
};

type Profile = {
  display_name: string;
  username: string;
};

type ToggleProps = {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  label: string;
};

const DEFAULT_USER_SETTINGS: Omit<
  UserSettings,
  "user_id"
> = {
  theme: "system",
  allow_messages_from: "everyone",
  show_activity_status: true,
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

function Toggle({
  checked,
  onChange,
  disabled = false,
  label,
}: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full p-1 transition ${
        checked
          ? "bg-[var(--accent)]"
          : "bg-[var(--surface-muted)]"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <span
        className={`block h-5 w-5 rounded-full bg-white shadow-sm transition ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
  icon,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
        {icon}
      </span>

      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
          {eyebrow}
        </p>

        <h2 className="mt-1.5 text-lg font-semibold tracking-[-0.025em]">
          {title}
        </h2>

        <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
          {description}
        </p>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();

  const [profile, setProfile] =
    useState<Profile | null>(null);

  const [userSettings, setUserSettings] =
    useState<UserSettings | null>(null);

  const [
    notificationPreferences,
    setNotificationPreferences,
  ] =
    useState<NotificationPreferences | null>(
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
          (part: string) =>
            part[0]?.toUpperCase() ?? "",
        )
        .join("") || "A"
    );
  }, [profile]);

  useEffect(() => {
    let active = true;

    async function loadSettings() {
      setLoading(true);
      setError("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/auth");
        return;
      }

      try {
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
              "user_id, theme, allow_messages_from, show_activity_status",
            )
            .eq("user_id", user.id)
            .maybeSingle(),

          supabase
            .from("notification_preferences")
            .select(
              "user_id, follows, reactions, comments, reposts, messages, group_activity",
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

        setProfile(
          profileResult.data ?? null,
        );

        setUserSettings(
          settingsResult.data
            ? (settingsResult.data as UserSettings)
            : {
                user_id: user.id,
                ...DEFAULT_USER_SETTINGS,
              },
        );

        setNotificationPreferences(
          notificationResult.data
            ? (notificationResult.data as NotificationPreferences)
            : {
                user_id: user.id,
                ...DEFAULT_NOTIFICATION_PREFERENCES,
              },
        );
      } catch (loadError) {
        console.error(
          "Failed to load Agore settings:",
          loadError,
        );

        if (active) {
          setError(
            "Unable to load your settings.",
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

  async function updateUserSetting(
    key: keyof Omit<UserSettings, "user_id">,
    value: string | boolean,
  ) {
    if (!userSettings) {
      return;
    }

    const nextSettings = {
      ...userSettings,
      [key]: value,
    } as UserSettings;

    setUserSettings(nextSettings);
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

      setSuccess("Settings saved.");
    } catch (updateError) {
      console.error(
        "Failed to update Agore user setting:",
        updateError,
      );

      setUserSettings(userSettings);

      setError(
        "Unable to save that setting.",
      );
    } finally {
      setSavingKey(null);
    }
  }

  async function updateNotification(
    key: keyof Omit<
      NotificationPreferences,
      "user_id"
    >,
    value: boolean,
  ) {
    if (!notificationPreferences) {
      return;
    }

    const nextPreferences = {
      ...notificationPreferences,
      [key]: value,
    } as NotificationPreferences;

    setNotificationPreferences(
      nextPreferences,
    );

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

      setSuccess("Notification preference saved.");
    } catch (updateError) {
      console.error(
        "Failed to update Agore notification preference:",
        updateError,
      );

      setNotificationPreferences(
        notificationPreferences,
      );

      setError(
        "Unable to save that preference.",
      );
    } finally {
      setSavingKey(null);
    }
  }

  async function signOut() {
    setSavingKey("signout");
    setError("");

    const { error: signOutError } =
      await supabase.auth.signOut();

    if (signOutError) {
      setSavingKey(null);
      setError(
        "Unable to sign out. Please try again.",
      );
      return;
    }

    router.replace("/auth");
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[var(--background)] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <div className="animate-pulse space-y-6">
            <div className="h-10 w-24 rounded-full bg-[var(--surface-muted)]" />

            <div className="space-y-3">
              <div className="h-3 w-20 rounded-full bg-[var(--surface-muted)]" />
              <div className="h-10 w-56 rounded bg-[var(--surface-muted)]" />
              <div className="h-4 w-80 rounded bg-[var(--surface-muted)]" />
            </div>

            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-52 rounded-[2rem] border border-[var(--border)] bg-[var(--surface)]"
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
      <main className="min-h-screen bg-[var(--background)] px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-2xl">
          <Link
            href="/home"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium"
          >
            <ArrowLeft size={16} />
            Back to home
          </Link>

          <section className="mt-8 rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8">
            <p className="text-sm font-medium text-[#8d2f2f]">
              {error}
            </p>

            <button
              type="button"
              onClick={() =>
                window.location.reload()
              }
              className="mt-5 rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white"
            >
              Retry
            </button>
          </section>
        </div>
      </main>
    );
  }

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

            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--foreground)] text-xs font-black text-[var(--background)]">
                A
              </span>

              <span className="hidden text-sm font-bold sm:block">
                Agoré
              </span>
            </div>
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
                Shape how Agoré looks, how people can reach you, and what
                deserves your attention.
              </p>
            </div>

            <div className="hidden items-center gap-3 sm:flex">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent-soft)] text-sm font-bold text-[var(--accent)]">
                {initials}
              </span>

              <div>
                <p className="text-sm font-semibold">
                  {profile?.display_name ??
                    "Agoré user"}
                </p>

                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  @{profile?.username ??
                    "unknown"}
                </p>
              </div>
            </div>
          </div>

          {error ? (
            <div className="mt-6 rounded-2xl border border-[#ead1d1] bg-[#fff7f7] px-4 py-3">
              <p className="text-sm font-medium text-[#8d2f2f]">
                {error}
              </p>
            </div>
          ) : null}

          {success ? (
            <div className="mt-6 flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm">
              <Check
                size={16}
                className="text-[var(--accent)]"
              />
              <p>{success}</p>
            </div>
          ) : null}
        </section>

        <div className="space-y-6">
          <section className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7">
            <SectionHeading
              eyebrow="Account"
              title="Your identity"
              description="Manage the profile information people see across Agoré."
              icon={<UserRound size={18} />}
            />

            <div className="mt-6 divide-y divide-[var(--border)]">
              <Link
                href="/profile/edit"
                className="group flex items-center justify-between gap-4 py-4 first:pt-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    Edit profile
                  </p>

                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Display name, username, bio, and profile photo.
                  </p>
                </div>

                <ChevronRight
                  size={18}
                  className="shrink-0 text-[var(--muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--accent)]"
                />
              </Link>

              <div className="flex items-center justify-between gap-4 py-4 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    Username
                  </p>

                  <p className="mt-1 truncate text-sm text-[var(--muted)]">
                    @{profile?.username ??
                      "unknown"}
                  </p>
                </div>

                <span className="rounded-full bg-[var(--background)] px-3 py-1.5 text-xs font-medium text-[var(--muted)]">
                  Public
                </span>
              </div>
            </div>
          </section>

          <section className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7">
            <SectionHeading
              eyebrow="Privacy & safety"
              title="Control access"
              description="Choose who can start conversations with you and whether your presence is visible."
              icon={<Shield size={18} />}
            />

            <div className="mt-6 divide-y divide-[var(--border)]">
              <div className="py-4 first:pt-0">
                <p className="text-sm font-semibold">
                  Who can message you
                </p>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={
                      savingKey ===
                      "allow_messages_from"
                    }
                    onClick={() =>
                      void updateUserSetting(
                        "allow_messages_from",
                        "everyone",
                      )
                    }
                    className={`rounded-2xl border p-4 text-left transition ${
                      userSettings
                        ?.allow_messages_from ===
                      "everyone"
                        ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                        : "border-[var(--border)] bg-[var(--background)] hover:border-[var(--accent)]/40"
                    }`}
                  >
                    <p className="text-sm font-semibold">
                      Everyone
                    </p>

                    <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                      Any Agoré user can start a conversation.
                    </p>
                  </button>

                  <button
                    type="button"
                    disabled={
                      savingKey ===
                      "allow_messages_from"
                    }
                    onClick={() =>
                      void updateUserSetting(
                        "allow_messages_from",
                        "followers",
                      )
                    }
                    className={`rounded-2xl border p-4 text-left transition ${
                      userSettings
                        ?.allow_messages_from ===
                      "followers"
                        ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                        : "border-[var(--border)] bg-[var(--background)] hover:border-[var(--accent)]/40"
                    }`}
                  >
                    <p className="text-sm font-semibold">
                      Followers
                    </p>

                    <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                      Only people following you can start one.
                    </p>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 py-4 last:pb-0">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 text-[var(--muted)]">
                    <Lock size={17} />
                  </span>

                  <div>
                    <p className="text-sm font-semibold">
                      Activity status
                    </p>

                    <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                      Let people see when you are active.
                    </p>
                  </div>
                </div>

                <Toggle
                  checked={
                    userSettings
                      ?.show_activity_status ?? true
                  }
                  onChange={(value) =>
                    void updateUserSetting(
                      "show_activity_status",
                      value,
                    )
                  }
                  disabled={
                    savingKey ===
                    "show_activity_status"
                  }
                  label="Activity status"
                />
              </div>
            </div>
          </section>

          <ActivityVisibilitySetting />

          <section className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7">
            <SectionHeading
              eyebrow="Notifications"
              title="Choose what reaches you"
              description="Keep important activity close without making every interaction noisy."
              icon={<Bell size={18} />}
            />

            <div className="mt-6 divide-y divide-[var(--border)]">
              {[
                {
                  key: "follows" as const,
                  title: "New followers",
                  description:
                    "When someone follows you.",
                },
                {
                  key: "reactions" as const,
                  title: "Post reactions",
                  description:
                    "When someone reacts to your post.",
                },
                {
                  key: "comments" as const,
                  title: "Comments",
                  description:
                    "When someone comments on your post.",
                },
                {
                  key: "reposts" as const,
                  title: "Reposts",
                  description:
                    "When someone reposts your post.",
                },
                {
                  key: "messages" as const,
                  title: "Messages",
                  description:
                    "When you receive a new message.",
                },
                {
                  key: "group_activity" as const,
                  title: "Group activity",
                  description:
                    "When something important happens in a group conversation.",
                },
              ].map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {item.title}
                    </p>

                    <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                      {item.description}
                    </p>
                  </div>

                  <Toggle
                    checked={
                      notificationPreferences?.[
                        item.key
                      ] ?? true
                    }
                    onChange={(value) =>
                      void updateNotification(
                        item.key,
                        value,
                      )
                    }
                    disabled={
                      savingKey ===
                      `notification:${item.key}`
                    }
                    label={item.title}
                  />
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7">
            <SectionHeading
              eyebrow="Appearance"
              title="Make Agoré yours"
              description="Choose the visual mode you prefer for the app."
              icon={<Palette size={18} />}
            />

            <div className="mt-6 grid gap-2 sm:grid-cols-3">
              {[
                {
                  value: "system" as const,
                  label: "System",
                  description:
                    "Follow your device.",
                  icon: <Monitor size={18} />,
                },
                {
                  value: "light" as const,
                  label: "Light",
                  description:
                    "Bright and airy.",
                  icon: <Sun size={18} />,
                },
                {
                  value: "dark" as const,
                  label: "Dark",
                  description:
                    "Lower-light interface.",
                  icon: <Moon size={18} />,
                },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={
                    savingKey === "theme"
                  }
                  onClick={() =>
                    void updateUserSetting(
                      "theme",
                      option.value,
                    )
                  }
                  className={`rounded-2xl border p-4 text-left transition ${
                    userSettings?.theme ===
                    option.value
                      ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                      : "border-[var(--border)] bg-[var(--background)] hover:border-[var(--accent)]/40"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--accent)]">
                      {option.icon}
                    </span>

                    <span className="text-sm font-semibold">
                      {option.label}
                    </span>
                  </div>

                  <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                    {option.description}
                  </p>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7">
            <SectionHeading
              eyebrow="Agoré"
              title="About your space"
              description="A few useful details about this version of Agoré."
              icon={<Settings2 size={18} />}
            />

            <div className="mt-6 divide-y divide-[var(--border)]">
              <div className="flex items-center justify-between gap-4 py-4 first:pt-0">
                <div>
                  <p className="text-sm font-semibold">
                    Product
                  </p>

                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Agoré
                  </p>
                </div>

                <span className="text-xs font-medium text-[var(--muted)]">
                  V0
                </span>
              </div>

              <div className="flex items-center justify-between gap-4 py-4 last:pb-0">
                <div>
                  <p className="text-sm font-semibold">
                    Built around
                  </p>

                  <p className="mt-1 text-sm text-[var(--muted)]">
                    People, posts, and conversations.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-[2rem] border border-[#ead1d1] bg-[#fff8f8]">
            <div className="p-5 sm:p-7">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8d2f2f]">
                Session
              </p>

              <h2 className="mt-2 text-lg font-semibold tracking-[-0.025em]">
                Leave Agoré
              </h2>

              <p className="mt-2 max-w-xl text-sm leading-6 text-[#755f5f]">
                Sign out of this device. Your profile, posts, conversations,
                and settings remain stored securely.
              </p>

              <button
                type="button"
                onClick={() => void signOut()}
                disabled={
                  savingKey === "signout"
                }
                className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#dcaeae] bg-white px-5 py-2.5 text-sm font-semibold text-[#8d2f2f] transition hover:bg-[#fff1f1] disabled:opacity-50"
              >
                <LogOut size={16} />

                {savingKey === "signout"
                  ? "Signing out…"
                  : "Sign out"}
              </button>
            </div>
          </section>
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