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
type ConsentMode = "email" | "oauth";

const SIGNUP_LEGAL_ERROR =
  "To create an account, confirm that you are at least 18 and accept the Terms of Service. You must also acknowledge the Privacy Policy and Community Guidelines.";

type AgoreNativeWindow = Window & {
  __AGORE_NATIVE_OAUTH_CALLBACK?: string;
};

const NATIVE_OAUTH_CALLBACK_URL =
  "com.jayjaytgg.agore://auth-callback";

async function requestLegalConsentToken(
  mode: ConsentMode,
  email?: string,
) {
  const response = await fetch("/api/legal/consent-token", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mode,
      email,
      ageConfirmed: true,
      legalAccepted: true,
    }),
  });

  const body: unknown = await response
    .json()
    .catch(() => null);

  const token =
    typeof body === "object" &&
    body !== null &&
    "token" in body &&
    typeof body.token === "string"
      ? body.token
      : null;

  if (!response.ok || !token) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : "The signup acknowledgement could not be prepared. Please try again.";

    throw new Error(message);
  }

  return token;
}

async function recordEmailSignupConsent(
  token: string,
  accessToken: string,
) {
  const response = await fetch("/api/legal/record", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ token }),
  });

  if (!response.ok) {
    await createClient().auth.signOut();

    throw new Error(
      "Your signup agreements could not be recorded securely. Please try again.",
    );
  }
}

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
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [legalAccepted, setLegalAccepted] = useState(false);
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

    if (requestedMode === "signup" || currentError === "legal") {
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
    } else if (currentError === "legal") {
      setError(
        "The signup acknowledgement could not be verified. Review the signup agreements and try again. If the problem continues, contact Agoré Support.",
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
          "Google sign-in was cancelled or could not be completed. Please try again.",
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

        const consentToken =
          callbackUrl.searchParams.get("legal_consent");

        if (consentToken) {
          const recordResponse = await fetch(
            "/api/legal/record",
            {
              method: "POST",
              credentials: "same-origin",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${data.session.access_token}`,
              },
              body: JSON.stringify({
                token: consentToken,
              }),
            },
          );

          if (!recordResponse.ok) {
            await supabase.auth.signOut();

            throw new Error(
              "The signup agreements could not be verified and recorded. Please retry signup.",
            );
          }
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

  function getCallbackUrl(
    nextPath?: string,
    consentToken?: string,
  ) {
    const url = new URL(
      "/auth/callback",
      window.location.origin,
    );

    if (nextPath) {
      url.searchParams.set("next", nextPath);
    }

    if (consentToken) {
      url.searchParams.set("legal_consent", consentToken);
    }

    return url.toString();
  }

  function getOAuthRedirectUrl(consentToken?: string) {
    if (
      window.navigator.userAgent.includes("AgoreAndroid")
    ) {
      const url = new URL(NATIVE_OAUTH_CALLBACK_URL);

      if (consentToken) {
        url.searchParams.set("legal_consent", consentToken);
      }

      return url.toString();
    }

    return getCallbackUrl(undefined, consentToken);
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    clearFeedback();

    if (mode === "signup" && (!ageConfirmed || !legalAccepted)) {
      setError(SIGNUP_LEGAL_ERROR);
      return;
    }

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
        const consentToken =
          await requestLegalConsentToken(
            "email",
            normalizedEmail,
          );

        const {
          data,
          error: signupError,
        } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            emailRedirectTo: getCallbackUrl(
              undefined,
              consentToken,
            ),
          },
        });

        if (signupError) {
          throw signupError;
        }

        if (data.session) {
          await recordEmailSignupConsent(
            consentToken,
            data.session.access_token,
          );

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
    if (mode === "signup" && (!ageConfirmed || !legalAccepted)) {
      clearFeedback();
      setError(SIGNUP_LEGAL_ERROR);
      return;
    }

    clearFeedback();
    setOauthProvider(provider);

    try {
      const consentToken =
        mode === "signup"
          ? await requestLegalConsentToken("oauth")
          : undefined;

      const { error: oauthError } =
        await supabase.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo: getOAuthRedirectUrl(consentToken),
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
      let consentToken: string | undefined;

      if (
        mode === "signup" &&
        ageConfirmed &&
        legalAccepted
      ) {
        consentToken = await requestLegalConsentToken(
          "email",
          email.trim(),
        );
      }

      const { error: resendError } =
        await supabase.auth.resend({
          type: "signup",
          email: email.trim(),
          options: {
            emailRedirectTo: getCallbackUrl(
              undefined,
              consentToken,
            ),
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
    setAgeConfirmed(false);
    setLegalAccepted(false);
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

            {mode === "signup" && (
              <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
                <label className="flex items-start gap-3 text-sm leading-5">
                  <input
                    type="checkbox"
                    required
                    checked={ageConfirmed}
                    onChange={(event) => setAgeConfirmed(event.target.checked)}
                    className="mt-1 accent-[var(--accent)]"
                  />
                  <span>
                    I confirm that I am at least 18 years old.
                  </span>
                </label>

                <label className="flex items-start gap-3 text-sm leading-5">
                  <input
                    type="checkbox"
                    required
                    checked={legalAccepted}
                    onChange={(event) => setLegalAccepted(event.target.checked)}
                    className="mt-1 accent-[var(--accent)]"
                  />
                  <span>
                    I agree to Agoré’s{" "}
                    <Link
                      href="/terms"
                      className="font-semibold text-[var(--accent)] hover:underline"
                    >
                      Terms of Service
                    </Link>
                    , and acknowledge the{" "}
                    <Link
                      href="/privacy"
                      className="font-semibold text-[var(--accent)] hover:underline"
                    >
                      Privacy Policy
                    </Link>
                    {" "}and{" "}
                    <Link
                      href="/guidelines"
                      className="font-semibold text-[var(--accent)] hover:underline"
                    >
                      Community Guidelines
                    </Link>
                    .
                  </span>
                </label>
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
          <span className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1">
            <Link href="/guidelines" className="hover:underline">
              Guidelines
            </Link>
            <Link href="/terms" className="hover:underline">
              Terms
            </Link>
            <Link href="/privacy" className="hover:underline">
              Privacy
            </Link>
          </span>
        </p>
      </div>
    </main>
  );
}