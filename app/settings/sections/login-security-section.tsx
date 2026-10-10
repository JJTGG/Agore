"use client";

import { useState } from "react";
import {
  CheckCircle2,
  KeyRound,
  Loader2,
  Mail,
  ShieldCheck,
} from "lucide-react";

import { createClient } from "@/lib/supabase/browser";

type LoginSecuritySectionProps = {
  accountEmail: string | null;
};

const supabase = createClient();

export default function LoginSecuritySection({
  accountEmail,
}: LoginSecuritySectionProps) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function sendPasswordRecoveryEmail() {
    if (!accountEmail || sending) {
      return;
    }

    setError("");
    setSuccess("");
    setSending(true);

    try {
      const redirectTo = new URL(
        "/auth/update-password",
        window.location.origin,
      ).toString();

      const { error: recoveryError } =
        await supabase.auth.resetPasswordForEmail(
          accountEmail,
          { redirectTo },
        );

      if (recoveryError) {
        throw recoveryError;
      }

      setSuccess(
        "Password recovery email requested. Check your inbox and spam folder, then open the recovery link to choose a new password.",
      );
    } catch (caughtError) {
      console.error(
        "Failed to request Agore password recovery:",
        caughtError,
      );

      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to request password recovery. Please try again.",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <section
      aria-labelledby="settings-login-security-title"
      className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <ShieldCheck size={19} />
        </span>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
            Login & Security
          </p>

          <h2
            id="settings-login-security-title"
            className="mt-1.5 text-lg font-semibold tracking-tight"
          >
            Protect your account
          </h2>

          <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
            Manage password recovery and keep control
            of access to your Agoré account.
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface)] text-[var(--muted)]">
            <KeyRound size={19} />
          </span>

          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold">
              Password & recovery
            </h3>

            <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
              Request a secure email link to reset your
              password. You can use this flow if you've
              forgotten your password or need to choose
              a new one.
            </p>
          </div>
        </div>

        <div className="mt-5 border-t border-[var(--border)] pt-4">
          <div className="flex items-start gap-3">
            <Mail
              size={17}
              className="mt-0.5 shrink-0 text-[var(--muted)]"
            />

            <div className="min-w-0 flex-1">
              <p className="text-xs text-[var(--muted)]">
                Recovery email
              </p>

              <p className="mt-1 break-all text-sm font-medium">
                {accountEmail || "Email unavailable"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              void sendPasswordRecoveryEmail()
            }
            disabled={!accountEmail || sending}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? (
              <>
                <Loader2
                  size={17}
                  className="animate-spin"
                />
                Requesting recovery email…
              </>
            ) : (
              <>
                <Mail size={17} />
                Send password recovery email
              </>
            )}
          </button>
        </div>
      </div>

      {success ? (
        <div
          role="status"
          className="mt-4 flex items-start gap-3 rounded-xl border border-[var(--success)]/30 bg-[var(--success-soft)] p-4 text-sm leading-6"
        >
          <CheckCircle2
            size={19}
            className="mt-0.5 shrink-0 text-[var(--success)]"
          />
          <p>{success}</p>
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-4 py-3 text-sm leading-6"
        >
          {error}
        </p>
      ) : null}

      <p className="mt-5 text-xs leading-5 text-[var(--muted)]">
        Never share a password recovery link with another
        person. Recovery depends on access to your email
        account and a valid, unexpired link.
      </p>
    </section>
  );
}