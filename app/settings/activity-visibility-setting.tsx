"use client";

import {
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  RefreshCw,
  Shield,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useState,
} from "react";

import { createClient } from "@/lib/supabase/browser";

type ActivityVisibility =
  | "public"
  | "private"
  | "confidential";

type ActivityVisibilityRow = {
  activity_visibility: ActivityVisibility;
};

const VISIBILITY_OPTIONS: {
  value: ActivityVisibility;
  title: string;
  description: string;
  icon: typeof Eye;
}[] = [
  {
    value: "public",
    title: "Public",
    description:
      "Eligible activity can appear on your profile. Posts and other content keep their own visibility rules.",
    icon: Eye,
  },
  {
    value: "private",
    title: "Private",
    description:
      "Only you can view your Activity timeline. This does not make your posts private.",
    icon: LockKeyhole,
  },
  {
    value: "confidential",
    title: "Confidential",
    description:
      "Hide the Activity timeline from ordinary views, including your own profile timeline.",
    icon: EyeOff,
  },
];

const supabase = createClient();

export default function ActivityVisibilitySetting() {
  const [userId, setUserId] = useState<string | null>(null);
  const [visibility, setVisibility] =
    useState<ActivityVisibility>("public");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadSetting = useCallback(async () => {
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        throw new Error(
          "Sign in to manage your Activity privacy.",
        );
      }

      const { data, error: settingsError } =
        await supabase
          .from("user_settings")
          .select("activity_visibility")
          .eq("user_id", user.id)
          .maybeSingle();

      if (settingsError) {
        throw settingsError;
      }

      const storedValue =
        (
          data as ActivityVisibilityRow | null
        )?.activity_visibility ?? "public";

      if (
        storedValue !== "public" &&
        storedValue !== "private" &&
        storedValue !== "confidential"
      ) {
        throw new Error(
          "Your Activity privacy setting is invalid.",
        );
      }

      setUserId(user.id);
      setVisibility(storedValue);
    } catch (loadError) {
      console.error(
        "Failed to load Activity privacy setting:",
        loadError,
      );

      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load Activity privacy settings.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSetting();
  }, [loadSetting]);

  const saveSetting = useCallback(
    async (nextValue: ActivityVisibility) => {
      if (!userId || saving || nextValue === visibility) {
        return;
      }

      const previousValue = visibility;

      setVisibility(nextValue);
      setSaving(true);
      setError("");
      setSuccess("");

      try {
        const { error: saveError } = await supabase
          .from("user_settings")
          .upsert(
            {
              user_id: userId,
              activity_visibility: nextValue,
            },
            {
              onConflict: "user_id",
            },
          );

        if (saveError) {
          throw saveError;
        }

        setSuccess("Activity privacy setting saved.");
      } catch (saveError) {
        console.error(
          "Failed to save Activity privacy setting:",
          saveError,
        );

        setVisibility(previousValue);

        setError(
          saveError instanceof Error
            ? saveError.message
            : "Unable to save your Activity privacy setting.",
        );
      } finally {
        setSaving(false);
      }
    },
    [userId, saving, visibility],
  );

  return (
    <section className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <Shield size={18} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
            Privacy & safety
          </p>

          <h2 className="mt-1.5 text-lg font-semibold tracking-[-0.025em]">
            Activity visibility
          </h2>

          <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
            Choose who can view your Activity history.
            This is separate from post visibility, messaging
            privacy, and activity status.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4">
          <Loader2
            size={18}
            className="animate-spin text-[var(--accent)]"
          />
          <p className="text-sm text-[var(--muted)]">
            Loading Activity privacy…
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {VISIBILITY_OPTIONS.map((option) => {
            const OptionIcon = option.icon;
            const selected = visibility === option.value;

            return (
              <button
                key={option.value}
                type="button"
                disabled={saving}
                onClick={() =>
                  void saveSetting(option.value)
                }
                aria-pressed={selected}
                className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition ${
                  selected
                    ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                    : "border-[var(--border)] bg-[var(--background)] hover:border-[var(--accent)]/40"
                } disabled:cursor-not-allowed disabled:opacity-70`}
              >
                <span
                  className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                    selected
                      ? "bg-[var(--surface)] text-[var(--accent)]"
                      : "bg-[var(--surface)] text-[var(--muted)]"
                  }`}
                >
                  <OptionIcon size={17} />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    {option.title}
                    {selected ? (
                      <CheckCircle2
                        size={15}
                        className="text-[var(--accent)]"
                      />
                    ) : null}
                  </span>

                  <span className="mt-1 block text-sm leading-6 text-[var(--muted)]">
                    {option.description}
                  </span>
                </span>

                <span
                  className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    selected
                      ? "border-[var(--accent)]"
                      : "border-[var(--muted)]"
                  }`}
                  aria-hidden="true"
                >
                  {selected ? (
                    <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {error ? (
        <div className="mt-4 rounded-xl border border-[#ead1d1] bg-[#fff8f8] p-3">
          <p className="text-sm text-[#8d2f2f]">
            {error}
          </p>

          <button
            type="button"
            onClick={() => void loadSetting()}
            disabled={loading || saving}
            className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[#8d2f2f] disabled:opacity-50"
          >
            <RefreshCw size={14} />
            Retry
          </button>
        </div>
      ) : null}

      {success ? (
        <p
          role="status"
          className="mt-4 text-sm text-[var(--muted)]"
        >
          {success}
        </p>
      ) : null}

      {saving ? (
        <p
          role="status"
          className="mt-3 flex items-center gap-2 text-xs text-[var(--muted)]"
        >
          <Loader2 size={14} className="animate-spin" />
          Saving your preference…
        </p>
      ) : null}
    </section>
  );
}