"use client";

import { Analytics } from "@vercel/analytics/next";
import Link from "next/link";
import { useEffect, useState } from "react";

type ConsentChoice = "accepted" | "rejected" | null;

const CONSENT_KEY = "agore_analytics_consent";
const OPEN_SETTINGS_EVENT = "agore-open-analytics-settings";

const TRACKABLE_PUBLIC_PATHS = new Set([
  "/",
  "/guidelines",
  "/terms",
  "/privacy",
]);

function readAnalyticsConsent(): ConsentChoice {
  try {
    const value = window.localStorage.getItem(CONSENT_KEY);

    if (value === "accepted" || value === "rejected") {
      return value;
    }
  } catch {
    // Inaccessible storage means no stored consent.
  }

  return null;
}

function clearOptionalAnalyticsStorage() {
  try {
    window.localStorage.removeItem("agore_analytics_visitor_id");
    window.sessionStorage.removeItem("agore_analytics_session_id");
    window.sessionStorage.removeItem("agore_analytics_referrer_host");
  } catch {
    // Storage restrictions must not break the application.
  }
}

function isTrackableEventUrl(rawUrl: string | undefined) {
  if (!rawUrl) {
    return false;
  }

  try {
    const eventUrl = new URL(rawUrl, window.location.origin);

    return (
      eventUrl.origin === window.location.origin &&
      TRACKABLE_PUBLIC_PATHS.has(eventUrl.pathname)
    );
  } catch {
    return false;
  }
}

export default function AnalyticsPrivacyControls() {
  const [ready, setReady] = useState(false);
  const [consent, setConsent] = useState<ConsentChoice>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    setConsent(readAnalyticsConsent());
    setReady(true);
  }, []);

  useEffect(() => {
    function handleOpenSettings() {
      const savedChoice = readAnalyticsConsent();

      if (savedChoice !== null) {
        setConsent(savedChoice);
        setSettingsOpen(true);
      }
    }

    window.addEventListener(
      OPEN_SETTINGS_EVENT,
      handleOpenSettings,
    );

    return () => {
      window.removeEventListener(
        OPEN_SETTINGS_EVENT,
        handleOpenSettings,
      );
    };
  }, []);

  function chooseConsent(nextChoice: Exclude<ConsentChoice, null>) {
    try {
      window.localStorage.setItem(CONSENT_KEY, nextChoice);
    } catch {
      // The explicit choice applies to this session only if storage fails.
    }

    if (nextChoice === "rejected") {
      clearOptionalAnalyticsStorage();
    }

    setConsent(nextChoice);
    setSettingsOpen(false);
    window.dispatchEvent(new Event("agore-analytics-consent-change"));
  }

  const panelVisible =
    consent === null || settingsOpen;

  return (
    <>
      {ready && consent === "accepted" ? (
        <Analytics
          beforeSend={(event) => {
            if (readAnalyticsConsent() !== "accepted") {
              return null;
            }

            if (!isTrackableEventUrl(event.url)) {
              return null;
            }

            return event;
          }}
        />
      ) : null}

      {!ready || !panelVisible ? null : (
        <aside
          id="analytics-privacy-controls"
          aria-label="Privacy and analytics choices"
          className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-2xl rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-[var(--foreground)] shadow-xl sm:inset-x-6 sm:bottom-6 sm:p-5"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold">
                Privacy and analytics
              </h2>

              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                Agoré can use optional analytics to understand visits to the
                public site and improve it. Optional analytics stays off unless
                you allow it. You can change your choice later.
              </p>

              {consent !== null ? (
                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                  Your current choice:{" "}
                  <strong>
                    {consent === "accepted"
                      ? "Optional analytics allowed"
                      : "Optional analytics rejected"}
                  </strong>
                  .
                </p>
              ) : null}

              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                Necessary sign-in and application storage is separate from
                optional analytics. Read the{" "}
                <Link
                  href="/privacy"
                  className="font-medium text-[var(--accent)] hover:underline"
                >
                  Privacy Policy
                </Link>
                .
              </p>
            </div>

            {consent !== null ? (
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                aria-label="Close privacy settings"
                className="rounded-lg px-2 py-1 text-sm text-[var(--muted)] hover:bg-[var(--surface-muted)]"
              >
                Close
              </button>
            ) : null}
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => chooseConsent("rejected")}
              className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-medium transition hover:border-[var(--accent)]"
            >
              Reject optional analytics
            </button>

            <button
              type="button"
              onClick={() => chooseConsent("accepted")}
              className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)]"
            >
              Allow optional analytics
            </button>
          </div>
        </aside>
      )}
    </>
  );
}