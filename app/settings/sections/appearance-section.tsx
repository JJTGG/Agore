
"use client";

import { useState } from "react";
import {
  Check,
  Loader2,
  Monitor,
  Moon,
  Palette,
  Sun,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { Theme } from "./types";

type AppearanceSectionProps = {
  theme: Theme;
  onUpdateTheme: (value: Theme) => Promise<boolean>;
};

const themeOptions: {
  value: Theme;
  label: string;
  description: string;
  Icon: LucideIcon;
}[] = [
  {
    value: "system",
    label: "System",
    description:
      "Follow your device's appearance preference.",
    Icon: Monitor,
  },
  {
    value: "light",
    label: "Light",
    description:
      "Use Agoré's light appearance.",
    Icon: Sun,
  },
  {
    value: "dark",
    label: "Dark",
    description:
      "Use Agoré's dark appearance.",
    Icon: Moon,
  },
];

export default function AppearanceSection({
  theme,
  onUpdateTheme,
}: AppearanceSectionProps) {
  const [savingTheme, setSavingTheme] =
    useState<Theme | null>(null);
  const [error, setError] = useState("");

  async function selectTheme(nextTheme: Theme) {
    if (nextTheme === theme || savingTheme !== null) {
      return;
    }

    setError("");
    setSavingTheme(nextTheme);

    // Apply the appearance before waiting for persistence.
    document.documentElement.dataset.theme = nextTheme;

    try {
      const saved = await onUpdateTheme(nextTheme);

      if (!saved) {
        throw new Error(
          "Agoré couldn't save your appearance preference. Your previous theme has been restored.",
        );
      }
    } catch (caughtError) {
      // Restore the last confirmed theme if saving fails.
      document.documentElement.dataset.theme = theme;

      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to save your appearance preference. Please try again.",
      );
    } finally {
      setSavingTheme(null);
    }
  }

  return (
    <section
      aria-labelledby="settings-appearance-title"
      className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <Palette size={19} />
        </span>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
            Appearance
          </p>

          <h2
            id="settings-appearance-title"
            className="mt-1.5 text-lg font-semibold tracking-tight"
          >
            Make Agoré feel like yours
          </h2>

          <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
            Choose the appearance that works best for
            you. Your selection is saved to your account.
          </p>
        </div>
      </div>

      <div
        className="mt-6 grid gap-3 sm:grid-cols-3"
        aria-label="Appearance options"
      >
        {themeOptions.map(
          ({ value, label, description, Icon }) => {
            const selected = theme === value;
            const isSaving = savingTheme === value;

            return (
              <button
                key={value}
                type="button"
                aria-pressed={selected}
                disabled={savingTheme !== null}
                onClick={() => void selectTheme(value)}
                className={`group flex min-h-40 flex-col rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-70 ${
                  selected
                    ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                    : "border-[var(--border)] bg-[var(--background)] hover:border-[var(--muted)]"
                }`}
              >
                <span className="flex items-center justify-between gap-3">
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] ${
                      selected
                        ? "bg-[var(--surface)] text-[var(--accent)]"
                        : "bg-[var(--surface)] text-[var(--muted)]"
                    }`}
                  >
                    <Icon size={19} />
                  </span>

                  {isSaving ? (
                    <Loader2
                      size={17}
                      className="animate-spin text-[var(--accent)]"
                      aria-label="Saving theme"
                    />
                  ) : selected ? (
                    <Check
                      size={18}
                      className="text-[var(--accent)]"
                      aria-label="Selected theme"
                    />
                  ) : null}
                </span>

                <span className="mt-5 block text-sm font-semibold">
                  {label}
                  {selected ? (
                    <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-[var(--accent)]">
                      Current
                    </span>
                  ) : null}
                </span>

                <span className="mt-1 block text-xs leading-5 text-[var(--muted)]">
                  {description}
                </span>
              </button>
            );
          },
        )}
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-4 py-3 text-sm leading-6"
        >
          {error}
        </p>
      ) : null}

      <p className="mt-5 text-xs leading-5 text-[var(--muted)]">
        System appearance follows your device preference
        where supported. Your saved choice should remain
        consistent when you return to Agoré.
      </p>
    </section>
  );
}
