"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { recordAgorePerformanceMetric } from "@/lib/performance/monitor";

const CONVERSATION_ROUTE = /^\/messages\/[^/]+\/?$/;

function getConversationApiType(
  resourceName: string,
): "details" | "messages" | null {
  try {
    const url = new URL(resourceName, window.location.href);

    if (url.origin !== window.location.origin) {
      return null;
    }

    if (
      /^\/api\/conversations\/[^/]+\/?$/.test(url.pathname)
    ) {
      return "details";
    }

    if (
      /^\/api\/conversations\/[^/]+\/messages\/?$/.test(
        url.pathname,
      ) &&
      !url.searchParams.has("cursor")
    ) {
      return "messages";
    }

    return null;
  } catch {
    return null;
  }
}

export default function ConversationReadinessTracker() {
  const pathname = usePathname();

  const routeTimingRef = useRef({
    pathname: null as string | null,
    startedAt: 0,
  });

  // Capture the new route boundary during render, before the
  // conversation page's passive effects start their fetches.
  if (routeTimingRef.current.pathname !== pathname) {
    routeTimingRef.current = {
      pathname,
      startedAt:
        typeof performance !== "undefined"
          ? performance.now()
          : 0,
    };
  }

  useEffect(() => {
    if (
      !pathname ||
      !CONVERSATION_ROUTE.test(pathname)
    ) {
      return;
    }

    const routeStartedAt = routeTimingRef.current.startedAt;

    let active = true;
    let readinessRecorded = false;
    let readinessCompletedAt: number | null = null;

    let detailsTimingRecorded = false;
    let messagesTimingRecorded = false;

    let domObserver: MutationObserver | null = null;
    let resourceObserver: PerformanceObserver | null = null;

    function inspectConversation() {
      if (!active || readinessRecorded) {
        return;
      }

      const main = document.querySelector<HTMLElement>(
        'main[class*="h-dvh"][class*="max-h-dvh"]',
      );

      if (!main) {
        return;
      }

      const viewport = main.querySelector<HTMLElement>(
        '[class*="overscroll-contain"][class*="overflow-y-auto"]',
      );

      if (!viewport) {
        return;
      }

      const firstChild = viewport.firstElementChild;

      if (!firstChild) {
        return;
      }

      // Do not call the conversation ready while its initial
      // full-viewport loading spinner is still visible.
      const initialLoading =
        firstChild.classList.contains("min-h-[50vh]") &&
        Boolean(firstChild.querySelector("svg.animate-spin"));

      if (initialLoading) {
        return;
      }

      const messageCount = viewport.querySelectorAll(
        '[id^="agore-message-"]',
      ).length;

      const emptyConversation = Array.from(
        viewport.querySelectorAll("h2"),
      ).some(
        (heading) =>
          heading.textContent?.trim().toLowerCase() ===
          "start the conversation",
      );

      const hasBackToMessagesLink = Array.from(
        viewport.querySelectorAll("a"),
      ).some(
        (link) =>
          link.textContent?.trim().toLowerCase() ===
          "back to messages",
      );

      const hasDangerText = Boolean(
        viewport.querySelector(
          '[class*="text-[var(--danger)]"]',
        ),
      );

      const errorState =
        hasBackToMessagesLink || hasDangerText;

      readinessCompletedAt = performance.now();

      recordAgorePerformanceMetric(
        "conversation",
        "Conversation content readiness",
        readinessCompletedAt - routeStartedAt,
        "ms",
        {
          messageCount,
          hasMessages: messageCount > 0,
          emptyConversation,
          errorState,
        },
      );

      readinessRecorded = true;
      domObserver?.disconnect();
    }

    function inspectResource(entry: PerformanceEntry) {
      if (!active || entry.entryType !== "resource") {
        return;
      }

      const resource = entry as PerformanceResourceTiming;

      // Ignore requests that began before this route was rendered.
      if (resource.startTime < routeStartedAt) {
        return;
      }

      // Do not classify later user actions or refreshes as initial
      // conversation loading requests.
      if (
        readinessCompletedAt !== null &&
        resource.startTime > readinessCompletedAt
      ) {
        return;
      }

      const apiType = getConversationApiType(resource.name);

      if (!apiType) {
        return;
      }

      const alreadyRecorded =
        apiType === "details"
          ? detailsTimingRecorded
          : messagesTimingRecorded;

      if (alreadyRecorded) {
        return;
      }

      const label =
        apiType === "details"
          ? "Conversation details API fetch duration"
          : "Conversation messages API fetch duration";

      const metric = recordAgorePerformanceMetric(
        "conversation",
        label,
        resource.duration,
        "ms",
        {
          responseStartWaitMs:
            resource.responseStart > 0
              ? Math.max(
                  0,
                  resource.responseStart - resource.startTime,
                )
              : 0,
          bodyTransferMs:
            resource.responseEnd > 0 &&
            resource.responseStart > 0
              ? Math.max(
                  0,
                  resource.responseEnd - resource.responseStart,
                )
              : 0,
          transferSizeBytes: resource.transferSize,
          resourceTimingAvailable: true,
        },
      );

      // Only mark the API timing as recorded when an opt-in
      // session accepted the metric.
      if (metric) {
        if (apiType === "details") {
          detailsTimingRecorded = true;
        } else {
          messagesTimingRecorded = true;
        }
      }
    }

    if (typeof PerformanceObserver !== "undefined") {
      resourceObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          try {
            inspectResource(entry);
          } catch {
            // Performance diagnostics must not affect messaging.
          }
        }
      });

      try {
        resourceObserver.observe({
          type: "resource",
          buffered: true,
        });
      } catch {
        resourceObserver.disconnect();
        resourceObserver = null;
      }
    }

    domObserver = new MutationObserver(() => {
      try {
        inspectConversation();
      } catch {
        // Ignore diagnostic errors; never disrupt the page.
      }
    });

    domObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    inspectConversation();

    return () => {
      active = false;
      domObserver?.disconnect();
      resourceObserver?.disconnect();
    };
  }, [pathname]);

  return null;
}