"use client";

import Link from "next/link";
import {
  FormEvent,
  useState,
} from "react";
import {
  CheckCircle2,
  ChevronRight,
  Loader2,
  Mail,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { createClient } from "@/lib/supabase/browser";
import type { ProfileSummary } from "./types";

type AccountProfileSectionProps = {
  profile: ProfileSummary | null;
  accountEmail: string | null;
  emailVerified: boolean;
};

const supabase = createClient();

export default function AccountProfileSection({
  profile,
  accountEmail,
  emailVerified,
}: AccountProfileSectionProps) {
  const [changeEmailOpen, setChangeEmailOpen] =
    useState(false);
  const [nextEmail, setNextEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleChangeEmail(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const normalizedEmail = nextEmail
      .trim()
      .toLowerCase();

    if (!normalizedEmail) {
      setError("Enter the new email address.");
      return;
    }

    if (
      normalizedEmail ===
      accountEmail?.trim().toLowerCase()
    ) {
      setError(
        "Your new email must be different from your current email.",
      );
      return;
    }

    setSaving(true);

    try {
      const emailRedirectTo = new URL(
        "/auth/email-change/callback",
        window.location.origin,
      ).toString();

      const { error: updateError } =
        await supabase.auth.updateUser(
          {
            email: normalizedEmail,
          },
          {
            emailRedirectTo,
          },
        );

      if (updateError) {
        throw updateError;
      }

      setNextEmail("");
      setSuccess(
        "Email change requested. Check your inbox for the confirmation email and follow its instructions to complete the change.",
      );
      setChangeEmailOpen(false);
    } catch (caughtError) {
      console.error(
        "Failed to request Agore email change:",
        caughtError,
      );

      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to request an email change. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      aria-labelledby="settings-account-profile-title"
      className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <UserRound size={19} />
        </span>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
            Account & Profile
          </p>

          <h2
            id="settings-account-profile-title"
            className="mt-1.5 text-lg font-semibold tracking-tight"
          >
            Your identity
          </h2>

          <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
            Manage your public profile information and
            the email address connected to your account.
          </p>
        </div>
      </div>

      <div className="mt-6 divide-y divide-[var(--border)]">
        <Link
          href="/profile/edit"
          className="group flex items-center gap-3 py-4 first:pt-0"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--background)] text-[var(--muted)]">
            <UserRound size={18} />
          </span>

          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">
              Edit profile
            </span>

            <span className="mt-1 block text-sm leading-5 text-[var(--muted)]">
              Display name, username, bio and profile photo.
            </span>
          </span>

          <ChevronRight
            size={18}
            className="shrink-0 text-[var(--muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--accent)]"
          />
        </Link>

        <div className="flex items-start gap-3 py-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--background)] text-[var(--muted)]">
            <Mail size={18} />
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              Email address
            </p>

            <p className="mt-1 break-all text-sm text-[var(--muted)]">
              {accountEmail || "Email unavailable"}
            </p>

            <div className="mt-2 flex items-center gap-1.5">
              {emailVerified ? (
                <>
                  <CheckCircle2
                    size={15}
                    className="text-[var(--success)]"
                  />
                  <span className="text-xs font-medium text-[var(--success)]">
                    Verified
                  </span>
                </>
              ) : (
                <>
                  <ShieldCheck
                    size={15}
                    className="text-[var(--muted)]"
                  />
                  <span className="text-xs text-[var(--muted)]">
                    Not verified
                  </span>
                </>
              )}
            </div>

            <button
              type="button"
              disabled={!accountEmail || saving}
              onClick={() => {
                setChangeEmailOpen((open) => !open);
                setError("");
                setSuccess("");
              }}
              className="mt-3 rounded-lg text-sm font-semibold text-[var(--accent)] transition hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              {changeEmailOpen
                ? "Cancel email change"
                : "Change email address"}
            </button>
          </div>
        </div>
      </div>

      {changeEmailOpen ? (
        <form
          onSubmit={handleChangeEmail}
          className="mt-2 space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4 sm:p-5"
        >
          <div>
            <h3 className="text-sm font-semibold">
              New email address
            </h3>

            <p className="mt-1 text-sm leading-5 text-[var(--muted)]">
              Enter the address you want to use.
              Confirmation may be required before
              the change takes effect.
            </p>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-medium">
              New email
            </span>

            <input
              required
              type="email"
              name="newEmail"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={nextEmail}
              onChange={(event) =>
                setNextEmail(event.target.value)
              }
              placeholder="you@example.com"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
            />
          </label>

          {error ? (
            <p
              role="alert"
              className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-3 py-2.5 text-sm"
            >
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={saving || !nextEmail.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2
                  size={17}
                  className="animate-spin"
                />
                Requesting change…
              </>
            ) : (
              "Request email change"
            )}
          </button>
        </form>
      ) : null}

      {success ? (
        <p
          role="status"
          className="mt-4 rounded-xl border border-[var(--success)]/30 bg-[var(--success-soft)] px-4 py-3 text-sm leading-6"
        >
          {success}
        </p>
      ) : null}

      {error && !changeEmailOpen ? (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-4 py-3 text-sm leading-6"
        >
          {error}
        </p>
      ) : null}

      <p className="mt-5 text-xs leading-5 text-[var(--muted)]">
        Your email address is used for account access
        and security-related communication. It is
        separate from your public username.
      </p>
    </section>
  );
}