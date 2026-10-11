
"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

type DeviceType = "mobile" | "tablet" | "desktop" | "unknown";

type PendingView = {
  pathname: string;
  pageviewId: string;
};

const VISITOR_KEY = "agore_analytics_visitor_id";
const SESSION_KEY = "agore_analytics_session_id";
const REFERRER_KEY = "agore_analytics_referrer_host";

const UUID_SEGMENT =
  /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

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

function normalizePath(pathname: string) {
  return pathname.replace(UUID_SEGMENT, "/:id").slice(0, 200) || "/";
}

function shouldTrack(pathname: string) {
  const excludedPrefixes = [
    "/api",
    "/admin",
    "/staff",
    "/support",
    "/auth/callback",
    "/auth/update-password",
  ];

  return !excludedPrefixes.some(
    (prefix) =>
      pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function getReferrerHost() {
  try {
    const storage = window.sessionStorage;
    const saved = storage.getItem(REFERRER_KEY);

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

    storage.setItem(REFERRER_KEY, host);
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
    if (!pathname || !shouldTrack(pathname)) {
      return;
    }

    // Reusing the same ID through React's development effect replay
    // prevents a single navigation from being counted twice.
    if (pendingView.current?.pathname !== pathname) {
      pendingView.current = {
        pathname,
        pageviewId: crypto.randomUUID(),
      };
    }

    const payload = {
      pageviewId: pendingView.current.pageviewId,
      visitorId: getStoredId(VISITOR_KEY, true),
      sessionId: getStoredId(SESSION_KEY, false),
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
      // Analytics is best-effort; tracking failures must not block navigation.
    });
  }, [pathname]);

  return null;
}
