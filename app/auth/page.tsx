"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

type Mode = "signin" | "signup";

export default function AuthPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<Mode>("signin");
  const [inviteCode, setInviteCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [callbackError, setCallbackError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const currentCallbackError = params.get("error");

    setCallbackError(currentCallbackError);

    if (currentCallbackError === "verification") {
      setError(
        "Email verification could not be completed. You can request a new verification email below.",
      );
      return;
    }

    if (currentCallbackError === "invite") {
      setError(
        "Your invite could not be confirmed. Please use a valid active invite and try again.",
      );
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      if (mode === "signup") {
        const inviteResponse = await fetch("/api/auth/invite", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            code: inviteCode,
            email,
          }),
        });

        const inviteResult = await inviteResponse.json();

        if (!inviteResponse.ok) {
          throw new Error(
            inviteResult.error ?? "Invalid invite code.",
          );
        }

        if (
          typeof inviteResult.assertion !== "string" ||
          !inviteResult.assertion
        ) {
          throw new Error("Invite validation did not return a valid claim.");
        }

        const redirectUrl = new URL(
          "/auth/callback",
          window.location.origin,
        );

        redirectUrl.searchParams.set(
          "invite",
          inviteResult.assertion,
        );

        const { error: signupError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectUrl.toString(),
          },
        });

        if (signupError) {
          throw signupError;
        }

        setMessage(
          "Account created. Check your email to verify your account, then continue through the verification link.",
        );
        return;
      }

      const { error: signinError } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });

      if (signinError) {
        throw signinError;
      }

      router.push("/home");
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleResendVerification() {
    if (!email.trim()) {
      setError("Enter your email address first.");
      return;
    }

    setError("");
    setMessage("");
    setResending(true);

    try {
      const redirectUrl = new URL(
        "/auth/callback",
        window.location.origin,
      );

      const { error: resendError } =
        await supabase.auth.resend({
          type: "signup",
          email: email.trim(),
          options: {
            emailRedirectTo: redirectUrl.toString(),
          },
        });

      if (resendError) {
        throw resendError;
      }

      setMessage(
        "A new verification email has been requested. Check your inbox.",
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to request a new verification email.",
      );
    } finally {
      setResending(false);
    }
  }

  return (
    <main className="min-h-screen px-6 py-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center">
        <section className="w-full">
          <div className="mb-8">
            <p className="text-xl font-semibold tracking-[-0.03em]">
              Agoré
            </p>

            <h1 className="mt-8 text-4xl font-semibold tracking-[-0.045em]">
              {mode === "signin" ? "Welcome back." : "Join Agoré."}
            </h1>

            <p className="mt-3 leading-6 text-[var(--muted)]">
              {mode === "signin"
                ? "Sign in to continue to your conversations and community."
                : "Agoré is invite-only while the early community takes shape."}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {mode === "signup" && (
              <label className="block">
                <span className="mb-2 block text-sm font-medium">
                  Invite code
                </span>
                <input
                  required
                  value={inviteCode}
                  onChange={(event) =>
                    setInviteCode(event.target.value)
                  }
                  className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
                  autoComplete="off"
                />
              </label>
            )}

            <label className="block">
              <span className="mb-2 block text-sm font-medium">
                Email
              </span>
              <input
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
                autoComplete="email"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium">
                Password
              </span>
              <input
                required
                type="password"
                minLength={8}
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
                autoComplete={
                  mode === "signin"
                    ? "current-password"
                    : "new-password"
                }
              />
            </label>

            {error && (
              <p
                role="alert"
                className="rounded-2xl bg-red-50 px-4 py-3 text-sm leading-5 text-red-700"
              >
                {error}
              </p>
            )}

            {message && (
              <p
                role="status"
                className="rounded-2xl bg-[var(--accent-soft)] px-4 py-3 text-sm leading-5 text-[var(--accent-strong)]"
              >
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-[var(--accent)] px-5 py-3 font-medium text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading
                ? "Please wait..."
                : mode === "signin"
                  ? "Sign in"
                  : "Create account"}
            </button>
          </form>

          {callbackError === "verification" && (
            <button
              type="button"
              onClick={handleResendVerification}
              disabled={resending}
              className="mt-4 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-3 text-sm font-medium transition hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {resending
                ? "Requesting email..."
                : "Resend verification email"}
            </button>
          )}

          <div className="mt-6 text-center text-sm text-[var(--muted)]">
            {mode === "signin" ? (
              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setError("");
                  setMessage("");
                }}
                className="font-medium text-[var(--accent)] hover:underline"
              >
                Have an invite? Create an account
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setError("");
                  setMessage("");
                }}
                className="font-medium text-[var(--accent)] hover:underline"
              >
                Already have an account? Sign in
              </button>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}