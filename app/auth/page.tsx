"use client";

import {
  FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/browser";

type Mode = "signin" | "signup" | "recovery";
type OAuthProvider = "google";

type AgoreNativeWindow = Window & {
  __AGORE_NATIVE_OAUTH_CALLBACK?: string;
};

const NATIVE_OAUTH_CALLBACK_URL =
  "com.jayjaytgg.agore://auth-callback";

function AgoreBrandLogo() {
  return (
    <Link
      href="/"
      className="inline-flex items-center"
      aria-label="Agoré home"
    >
      <img
        src="/agore-logo.svg"
        alt="Agoré"
        className="agore-brand-logo-primary h-9 w-auto"
      />
      <img
        src="/agore-logo-inverse.svg"
        alt="Agoré"
        className="agore-brand-logo-inverse h-9 w-auto"
      />
    </Link>
  );
}

export default function AuthPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [callbackError, setCallbackError] =
    useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [oauthProvider, setOauthProvider] =
    useState<OAuthProvider | null>(null);
  const [resending, setResending] = useState(false);
  const [verificationPending, setVerificationPending] =
    useState(false);

  const handledNativeCallback = useRef<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const currentError = params.get("error");
    const requestedMode = params.get("mode");

    if (requestedMode === "signup") {
      setMode("signup");
    } else if (requestedMode === "signin") {
      setMode("signin");
    }

    setCallbackError(currentError);

    if (currentError === "verification") {
      setVerificationPending(true);
      setError(
        "Email verification could not be completed. You can request a new verification email below.",
      );
    } else if (currentError === "oauth") {
      setError(
        "Sign-in could not be completed. Please try again or choose another sign-in method.",
      );
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function completeNativeOAuth(rawUrl: string) {
      if (!rawUrl || handledNativeCallback.current === rawUrl) {
        return;
      }

      handledNativeCallback.current = rawUrl;

      const nativeWindow =
        window as AgoreNativeWindow;

      if (
        nativeWindow.__AGORE_NATIVE_OAUTH_CALLBACK ===
        rawUrl
      ) {
        nativeWindow.__AGORE_NATIVE_OAUTH_CALLBACK =
          undefined;
      }

      let callbackUrl: URL;

      try {
        callbackUrl = new URL(rawUrl);
      } catch {
        setError(
          "The Google sign-in callback was invalid. Please try again.",
        );
        return;
      }

      if (
        callbackUrl.protocol !== "com.jayjaytgg.agore:" ||
        callbackUrl.hostname !== "auth-callback"
      ) {
        setError(
          "The Google sign-in callback did not match this app.",
        );
        return;
      }

      const fragment = new URLSearchParams(
        callbackUrl.hash.replace(/^#/, ""),
      );

      const callbackError =
        callbackUrl.searchParams.get("error_description") ??
        callbackUrl.searchParams.get("error") ??
        fragment.get("error_description") ??
        fragment.get("error");

      if (callbackError) {
        setError(
          callbackError ||
            "Google sign-in was cancelled or could not be completed.",
        );
        setOauthProvider(null);
        setLoading(false);
        return;
      }

      const code = callbackUrl.searchParams.get("code");

      if (!code) {
        setError(
          "Google sign-in returned without an authorization code. Please try again.",
        );
        setOauthProvider(null);
        setLoading(false);
        return;
      }

      setError("");
      setMessage("");
      setOauthProvider("google");
      setLoading(true);

      try {
        const {
          data,
          error: exchangeError,
        } = await supabase.auth.exchangeCodeForSession(code);

        if (exchangeError) {
          throw exchangeError;
        }

        if (!data.session) {
          throw new Error(
            "Google sign-in finished without an active session.",
          );
        }

        if (!active) {
          return;
        }

        router.replace("/home");
        router.refresh();
      } catch (caughtError) {
        if (!active) {
          return;
        }

        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to complete Google sign-in. Please try again.",
        );
      } finally {
        if (active) {
          setOauthProvider(null);
          setLoading(false);
        }
      }
    }

    function handleNativeOAuthEvent(event: Event) {
      const nativeWindow =
        window as AgoreNativeWindow;

      const eventUrl = (
        event as CustomEvent<string>
      ).detail;

      const callbackUrl =
        typeof eventUrl === "string" && eventUrl
          ? eventUrl
          : nativeWindow.__AGORE_NATIVE_OAUTH_CALLBACK;

      if (callbackUrl) {
        nativeWindow.__AGORE_NATIVE_OAUTH_CALLBACK =
          undefined;

        void completeNativeOAuth(callbackUrl);
      }
    }

    window.addEventListener(
      "agore-native-oauth-callback",
      handleNativeOAuthEvent,
    );

    // The native activity might deliver the callback before
    // this page's React effect has mounted. Check the saved value.
    const nativeWindow =
      window as AgoreNativeWindow;

    const pendingCallback =
      nativeWindow.__AGORE_NATIVE_OAUTH_CALLBACK;

    if (pendingCallback) {
      nativeWindow.__AGORE_NATIVE_OAUTH_CALLBACK =
        undefined;

      void completeNativeOAuth(pendingCallback);
    }

    return () => {
      active = false;

      window.removeEventListener(
        "agore-native-oauth-callback",
        handleNativeOAuthEvent,
      );
    };
  }, [router, supabase]);

  function clearFeedback() {
    setError("");
    setMessage("");
  }

  function getCallbackUrl(nextPath?: string) {
    const url = new URL(
      "/auth/callback",
      window.location.origin,
    );

    if (nextPath) {
      url.searchParams.set("next", nextPath);
    }

    return url.toString();
  }

  function getOAuthRedirectUrl() {
    if (
      window.navigator.userAgent.includes("AgoreAndroid")
    ) {
      return NATIVE_OAUTH_CALLBACK_URL;
    }

    return getCallbackUrl();
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    clearFeedback();
    setLoading(true);

    const normalizedEmail = email.trim();

    try {
      if (mode === "recovery") {
        const { error: recoveryError } =
          await supabase.auth.resetPasswordForEmail(
            normalizedEmail,
            {
              redirectTo: getCallbackUrl(
                "/auth/update-password",
              ),
            },
          );

        if (recoveryError) {
          throw recoveryError;
        }

        setMessage(
          "If an account exists for that email address, a password recovery link has been requested. Check your inbox.",
        );

        return;
      }

      if (mode === "signup") {
        const {
          data,
          error: signupError,
        } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            emailRedirectTo: getCallbackUrl(),
          },
        });

        if (signupError) {
          throw signupError;
        }

        if (data.session) {
          router.replace("/home");
          router.refresh();
          return;
        }

        setEmail(normalizedEmail);
        setVerificationPending(true);
        setMessage(
          "Your registration has been submitted. Check your email for a verification link. If it does not arrive, you can request another below.",
        );

        return;
      }

      const { error: signinError } =
        await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

      if (signinError) {
        throw signinError;
      }

      router.replace("/home");
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

  async function handleOAuth(provider: OAuthProvider) {
    clearFeedback();
    setOauthProvider(provider);

    try {
      const { error: oauthError } =
        await supabase.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo: getOAuthRedirectUrl(),
          },
        });

      if (oauthError) {
        throw oauthError;
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to start sign-in. Please try again.",
      );

      setOauthProvider(null);
    }
  }

  async function handleResendVerification() {
    if (!email.trim()) {
      setError("Enter your email address first.");
      return;
    }

    clearFeedback();
    setResending(true);

    try {
      const { error: resendError } =
        await supabase.auth.resend({
          type: "signup",
          email: email.trim(),
          options: {
            emailRedirectTo: getCallbackUrl(),
          },
        });

      if (resendError) {
        throw resendError;
      }

      setVerificationPending(true);
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

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    clearFeedback();
  }

  const busy = loading || oauthProvider !== null;

  const showResendVerification =
    callbackError === "verification" ||
    verificationPending;

  return (
    <main className="flex min-h-screen items-center bg-[var(--background)] px-4 py-8 text-[var(--foreground)] sm:px-6">
      <div className="mx-auto w-full max-w-md">
        <AgoreBrandLogo />

        <section className="mt-8 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
            Your social space
          </p>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            {mode === "signin"
              ? "Welcome back."
              : mode === "signup"
                ? "Join Agoré."
                : "Recover your account."}
          </h1>

          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            {mode === "signin"
              ? "Sign in to reconnect with people and conversations."
              : mode === "signup"
                ? "Create an account and find your place in the conversation."
                : "Enter your account email and we'll help you reset your password."}
          </p>

          {mode !== "recovery" && (
            <>
              <div className="mt-7">
                <button
                  type="button"
                  onClick={() => handleOAuth("google")}
                  disabled={busy}
                  className="flex w-full items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm font-semibold transition hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {oauthProvider === "google"
                    ? "Connecting to Google..."
                    : mode === "signin"
                      ? "Continue with Google"
                      : "Sign up with Google"}
                </button>
              </div>

              <div className="my-6 flex items-center gap-4">
                <div className="h-px flex-1 bg-[var(--border)]" />

                <span className="text-xs text-[var(--muted)]">
                  OR CONTINUE WITH EMAIL
                </span>

                <div className="h-px flex-1 bg-[var(--border)]" />
              </div>
            </>
          )}

          <form
            onSubmit={handleSubmit}
            className="space-y-5"
          >
            <label className="block">
              <span className="mb-2 block text-sm font-medium">
                Email
              </span>

              <input
                required
                type="email"
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
                autoComplete="email"
                placeholder="you@example.com"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
              />
            </label>

            {mode !== "recovery" && (
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
                  autoComplete={
                    mode === "signin"
                      ? "current-password"
                      : "new-password"
                  }
                  placeholder={
                    mode === "signup"
                      ? "At least 8 characters"
                      : "Enter your password"
                  }
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 outline-none transition focus:border-[var(--accent)]"
                />
              </label>
            )}

            {mode === "signin" && (
              <div className="-mt-2 text-right">
                <button
                  type="button"
                  onClick={() => switchMode("recovery")}
                  className="text-sm font-medium text-[var(--accent)] hover:underline"
                >
                  Forgot password?
                </button>
              </div>
            )}

            {error && (
              <p
                role="alert"
                className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-4 py-3 text-sm leading-5"
              >
                {error}
              </p>
            )}

            {message && (
              <p
                role="status"
                className="rounded-xl border border-[var(--success)]/30 bg-[var(--success-soft)] px-4 py-3 text-sm leading-5"
              >
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={busy || resending}
              className="w-full rounded-xl bg-[var(--accent)] px-5 py-3 font-semibold text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading
                ? "Please wait..."
                : mode === "signin"
                  ? "Sign in"
                  : mode === "signup"
                    ? "Create account"
                    : "Send recovery link"}
            </button>
          </form>

          {showResendVerification && (
            <button
              type="button"
              onClick={handleResendVerification}
              disabled={resending || busy}
              className="mt-4 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm font-medium transition hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {resending
                ? "Requesting email..."
                : "Resend verification email"}
            </button>
          )}

          <div className="mt-6 border-t border-[var(--border)] pt-5 text-center text-sm text-[var(--muted)]">
            {mode === "signin" ? (
              <p>
                New to Agoré?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("signup")}
                  className="font-semibold text-[var(--accent)] hover:underline"
                >
                  Create an account
                </button>
              </p>
            ) : mode === "signup" ? (
              <p>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("signin")}
                  className="font-semibold text-[var(--accent)] hover:underline"
                >
                  Sign in
                </button>
              </p>
            ) : (
              <p>
                Remembered your password?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("signin")}
                  className="font-semibold text-[var(--accent)] hover:underline"
                >
                  Back to sign in
                </button>
              </p>
            )}
          </div>
        </section>

        <p className="mt-5 text-center text-xs leading-5 text-[var(--muted)]">
          Agoré · A place to gather.
        </p>
      </div>
    </main>
  );
}