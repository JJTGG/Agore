"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

type DeviceType = "mobile" | "tablet" | "desktop" | "unknown";

type PendingView = {
  pathname: string;
  pageviewId: string;
};

const CONSENT_KEY = "agore_analytics_consent";

const TRACKABLE_PUBLIC_PATHS = new Set([
  "/",
  "/guidelines",
  "/terms",
  "/privacy",
]);

function hasAnalyticsConsent() {
  try {
    return window.localStorage.getItem(CONSENT_KEY) === "accepted";
  } catch {
    return false;
  }
}

function getStoredId(key: string, persistent: boolean) {
  try {
    const storage = persistent
      ? window.localStorage
      : window.sessionStorage;

    const current = storage.getItem(key);

    if (current) {
      return current;
    }

    const next = crypto.randomUUID();
    storage.setItem(key, next);
    return next;
  } catch {
    // Private browsing or storage restrictions should not break the app.
    try {
      const fallback = window.sessionStorage;
      const current = fallback.getItem(key);

      if (current) {
        return current;
      }

      const next = crypto.randomUUID();
      fallback.setItem(key, next);
      return next;
    } catch {
      return crypto.randomUUID();
    }
  }
}

function shouldTrack(pathname: string) {
  return TRACKABLE_PUBLIC_PATHS.has(pathname);
}

function normalizePath(pathname: string) {
  return pathname.slice(0, 200) || "/";
}

function getReferrerHost() {
  try {
    const storage = window.sessionStorage;
    const saved = storage.getItem("agore_analytics_referrer_host");

    if (saved) {
      return saved;
    }

    let host = "direct";

    if (document.referrer) {
      const referrer = new URL(document.referrer);

      if (
        (referrer.protocol === "https:" ||
          referrer.protocol === "http:") &&
        referrer.hostname !== window.location.hostname
      ) {
        host = referrer.hostname.toLowerCase();
      }
    }

    storage.setItem("agore_analytics_referrer_host", host);
    return host;
  } catch {
    return "direct";
  }
}

function getDeviceType(): DeviceType {
  const ua = navigator.userAgent;

  if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) {
    return "tablet";
  }

  if (/Android/i.test(ua) && !/Mobile/i.test(ua)) {
    return "tablet";
  }

  if (/Mobile|iPhone|iPod|Android/i.test(ua)) {
    return "mobile";
  }

  return ua ? "desktop" : "unknown";
}

export default function AnalyticsTracker() {
  const pathname = usePathname() ?? "/";
  const pendingView = useRef<PendingView | null>(null);

  useEffect(() => {
    function recordPageView() {
      if (
        !pathname ||
        !shouldTrack(pathname) ||
        !hasAnalyticsConsent()
      ) {
        return;
      }

      // Reusing the ID through React effect replay prevents a duplicate
      // page-view event for the same navigation.
      if (pendingView.current?.pathname !== pathname) {
        pendingView.current = {
          pathname,
          pageviewId: crypto.randomUUID(),
        };
      }

      const payload = {
        pageviewId: pendingView.current.pageviewId,
        visitorId: getStoredId(
          "agore_analytics_visitor_id",
          true,
        ),
        sessionId: getStoredId(
          "agore_analytics_session_id",
          false,
        ),
        path: normalizePath(pathname),
        referrerHost: getReferrerHost(),
        deviceType: getDeviceType(),
      };

      void fetch("/api/analytics/pageview", {
        method: "POST",
        credentials: "same-origin",
        keepalive: true,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }).catch(() => {
        // Analytics is best-effort and must not block navigation.
      });
    }

    function handleConsentChange() {
      // Re-consenting should create a fresh page-view event ID.
      pendingView.current = null;
      recordPageView();
    }

    recordPageView();

    window.addEventListener(
      "agore-analytics-consent-change",
      handleConsentChange,
    );

    return () => {
      window.removeEventListener(
        "agore-analytics-consent-change",
        handleConsentChange,
      );
    };
  }, [pathname]);

  return null;
}