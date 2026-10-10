"use client";

import Link from "next/link";
import {
  FormEvent,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Loader2,
  ShieldCheck,
} from "lucide-react";

import { createClient } from "@/lib/supabase/browser";

const supabase = createClient();

export default function UpdatePasswordPage() {
  const router = useRouter();

  const [checkingSession, setCheckingSession] =
    useState(true);
  const [recoveryReady, setRecoveryReady] =
    useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] =
    useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!active) {
          return;
        }

        if (
          event === "PASSWORD_RECOVERY" &&
          session
        ) {
          setRecoveryReady(true);
          setCheckingSession(false);
        }
      },
    );

    async function checkSession() {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (!active) {
        return;
      }

      if (session && !sessionError) {
        setRecoveryReady(true);
      }

      setCheckingSession(false);
    }

    void checkSession();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!recoveryReady) {
      setError(
        "Open this page through your latest password recovery email.",
      );
      return;
    }

    if (password.length < 8) {
      setError(
        "Your password must contain at least 8 characters.",
      );
      return;
    }

    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setSaving(true);

    try {
      const { error: updateError } =
        await supabase.auth.updateUser({
          password,
        });

      if (updateError) {
        throw updateError;
      }

      setPassword("");
      setConfirmPassword("");
      setSuccess(
        "Your password has been updated successfully.",
      );
    } catch (caughtError) {
      console.error(
        "Failed to update Agore password:",
        caughtError,
      );

      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to update your password. Request a new recovery link and try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center bg-[var(--background)] px-4 py-8 text-[var(--foreground)] sm:px-6">
      <div className="mx-auto w-full max-w-md">
        <Link
          href="/auth"
          className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)] transition hover:text-[var(--foreground)]"
        >
          <ArrowLeft size={16} />
          Back to sign in
        </Link>

        <section className="mt-8 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <KeyRound size={22} />
          </div>

          <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
            Account security
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Reset your password
          </h1>

          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            Choose a new password for your Agoré account.
            Use at least 8 characters and keep it private.
          </p>

          {checkingSession ? (
            <div
              role="status"
              className="mt-7 flex items-center gap-3 text-sm text-[var(--muted)]"
            >
              <Loader2
                size={18}
                className="animate-spin"
              />
              Checking your recovery session…
            </div>
          ) : recoveryReady && !success ? (
            <form
              onSubmit={handleSubmit}
              className="mt-7 space-y-5"
            >
              <label className="block">
                <span className="mb-2 block text-sm font-medium">
                  New password
                </span>
                <input
                  required
                  type="password"
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium">
                  Confirm new password
                </span>
                <input
                  required
                  type="password"
                  minLength={8}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) =>
                    setConfirmPassword(
                      event.target.value,
                    )
                  }
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
                />
              </label>

              {error ? (
                <p
                  role="alert"
                  className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-4 py-3 text-sm"
                >
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-3 font-semibold text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? (
                  <>
                    <Loader2
                      size={18}
                      className="animate-spin"
                    />
                    Updating password…
                  </>
                ) : (
                  "Update password"
                )}
              </button>
            </form>
          ) : success ? (
            <div className="mt-7 space-y-5">
              <div
                role="status"
                className="flex items-start gap-3 rounded-xl border border-[var(--success)]/30 bg-[var(--success-soft)] p-4 text-sm"
              >
                <CheckCircle2
                  size={20}
                  className="shrink-0 text-[var(--success)]"
                />
                <p>{success}</p>
              </div>

              <button
                type="button"
                onClick={() => router.replace("/home")}
                className="w-full rounded-xl bg-[var(--accent)] px-4 py-3 font-semibold text-white transition hover:bg-[var(--accent-strong)]"
              >
                Continue to Agoré
              </button>
            </div>
          ) : (
            <div className="mt-7 space-y-4">
              <div
                role="alert"
                className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4 text-sm leading-6 text-[var(--muted)]"
              >
                <ShieldCheck
                  size={20}
                  className="mb-2 text-[var(--accent)]"
                />
                This page needs a valid recovery session.
                Request a fresh password recovery email and
                open its link to continue.
              </div>

              <Link
                href="/auth"
                className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent)] hover:underline"
              >
                Return to sign in
              </Link>
            </div>
          )}

          {error && success ? (
            <p
              role="alert"
              className="mt-4 text-sm text-[var(--danger)]"
            >
              {error}
            </p>
          ) : null}
        </section>

        <p className="mt-5 text-center text-xs leading-5 text-[var(--muted)]">
          Agoré · Keep your account secure.
        </p>
      </div>
    </main>
  );
}