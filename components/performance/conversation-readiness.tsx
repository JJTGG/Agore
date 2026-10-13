"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { recordAgorePerformanceMetric } from "@/lib/performance/monitor";

export default function ConversationReadinessTracker() {
  const pathname = usePathname();
  const lastRecordedPathRef = useRef<string | null>(null);

  useEffect(() => {
    // Only observe an individual conversation screen.
    if (!pathname || !/^\/messages\/[^/]+\/?$/.test(pathname)) {
      return;
    }

    // Avoid duplicate measurements for the same route.
    if (lastRecordedPathRef.current === pathname) {
      return;
    }

    let active = true;
    let recorded = false;
    let observer: MutationObserver | null = null;

    // This interval begins when the tracker observes the route,
    // not at the beginning of the entire navigation.
    const startedAt = performance.now();

    function inspectConversation() {
      if (!active || recorded) {
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

      // The initial loading screen uses a centered spinner with
      // a minimum-height container. Do not report readiness yet.
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
        viewport.querySelector('[class*="text-[var(--danger)]"]'),
      );

      const errorState = hasBackToMessagesLink || hasDangerText;

      const metric = recordAgorePerformanceMetric(
        "conversation",
        "Conversation content readiness",
        performance.now() - startedAt,
        "ms",
        {
          messageCount,
          hasMessages: messageCount > 0,
          emptyConversation,
          errorState,
        },
      );

      // A null result means collection is not currently active.
      // Do not save anything outside an opt-in session.
      recorded = true;
      observer?.disconnect();

      if (metric) {
        lastRecordedPathRef.current = pathname;
      }
    }

    observer = new MutationObserver(inspectConversation);

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    inspectConversation();

    return () => {
      active = false;
      observer?.disconnect();
    };
  }, [pathname]);

  return null;
}