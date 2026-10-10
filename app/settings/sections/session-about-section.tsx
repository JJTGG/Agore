
"use client";

import { useState } from "react";
import {
  Info,
  LogOut,
  ShieldCheck,
} from "lucide-react";

type SessionAboutSectionProps = {
  accountEmail: string | null;
  onSignOut: () => void | Promise<void>;
};

export default function SessionAboutSection({
  accountEmail,
  onSignOut,
}: SessionAboutSectionProps) {
  const [signOutError, setSignOutError] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (signingOut) {
      return;
    }

    setSignOutError("");
    setSigningOut(true);

    try {
      await onSignOut();
    } catch (error) {
      console.error("Agoré sign-out failed:", error);

      setSignOutError(
        error instanceof Error
          ? error.message
          : "Unable to sign out. Please try again.",
      );
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <section
      aria-labelledby="settings-session-about-title"
      className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <ShieldCheck size={19} />
        </span>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
            Session & About
          </p>

          <h2
            id="settings-session-about-title"
            className="mt-1.5 text-lg font-semibold tracking-tight"
          >
            Your account and Agoré
          </h2>

          <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
            Review the account currently signed in on this
            device and find basic information about the
            platform.
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]">
            <ShieldCheck size={18} />
          </span>

          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold">
              Current session
            </h3>

            <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
              You are managing the Agoré account currently
              authenticated in this browser.
            </p>

            <div className="mt-4">
              <p className="text-xs text-[var(--muted)]">
                Signed-in account
              </p>

              <p className="mt-1 break-all text-sm font-medium">
                {accountEmail || "Email unavailable"}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 border-t border-[var(--border)] pt-4">
          <button
            type="button"
            onClick={() => void handleSignOut()}
            disabled={signingOut}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--danger)]/30 px-4 py-3 text-sm font-semibold text-[var(--danger)] transition hover:bg-[var(--danger-soft)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <LogOut size={17} />
            {signingOut
              ? "Signing out…"
              : "Sign out of Agoré"}
          </button>

          <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
            Sign out when you're using a shared or
            untrusted device. You may need to authenticate
            again to access your account.
          </p>

          {signOutError ? (
            <p
              role="alert"
              className="mt-4 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-4 py-3 text-sm leading-6"
            >
              {signOutError}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]">
            <Info size={18} />
          </span>

          <div className="min-w-0">
            <h3 className="text-sm font-semibold">
              About Agoré
            </h3>

            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Agoré is a social platform built around
              profiles, posts, conversations, and the
              connections people make through them.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)]">
                Agoré
              </span>

              <span className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)]">
                V0 · Foundational release
              </span>
            </div>
          </div>
        </div>
      </div>

      <p className="mt-5 text-xs leading-5 text-[var(--muted)]">
        This section displays the current authenticated
        account. It does not provide a list of active
        sessions or remote session-revocation controls.
      </p>
    </section>
  );
}
