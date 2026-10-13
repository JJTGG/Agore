"use client";

import {
  recordAgorePerformanceMetric,
  startAgoreFrameSampling,
  startAgorePerformanceCollection,
} from "@/lib/performance/monitor";

import type { AgoreFrameSample } from "@/lib/performance/monitor";

export type AgorePerformanceSessionState = {
  active: boolean;
  startedAt: number | null;
  endedAt: number | null;
  frameSample: AgoreFrameSample | null;
};

const initialState: AgorePerformanceSessionState = {
  active: false,
  startedAt: null,
  endedAt: null,
  frameSample: null,
};

let state: AgorePerformanceSessionState = {
  ...initialState,
};

const subscribers = new Set<() => void>();

let releaseCollection: (() => void) | null = null;

let stopFrameSampling:
  | (() => AgoreFrameSample | null)
  | null = null;

function notifySubscribers() {
  for (const subscriber of subscribers) {
    try {
      subscriber();
    } catch {
      // A subscriber must not interrupt session management.
    }
  }
}

export function getAgorePerformanceSessionState():
  AgorePerformanceSessionState {
  return { ...state };
}

export function subscribeToAgorePerformanceSession(
  callback: () => void,
): () => void {
  subscribers.add(callback);

  return () => {
    subscribers.delete(callback);
  };
}

export function startAgorePerformanceSession(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  if (state.active) {
    return true;
  }

  if (typeof window.requestAnimationFrame !== "function") {
    return false;
  }

  const startedAt = Date.now();

  // Start collection before any session metric is recorded.
  releaseCollection = startAgorePerformanceCollection();

  state = {
    active: true,
    startedAt,
    endedAt: null,
    frameSample: null,
  };

  stopFrameSampling = startAgoreFrameSampling((sample) => {
    if (!state.active) {
      return;
    }

    state = {
      ...state,
      frameSample: sample,
    };

    notifySubscribers();
  });

  recordAgorePerformanceMetric(
    "rendering",
    "Performance measurement session started",
    1,
    "count",
  );

  notifySubscribers();

  return true;
}

export function stopAgorePerformanceSession(): void {
  if (!state.active) {
    return;
  }

  // Stop frame sampling first. Its final metrics must be recorded
  // while the performance collection session is still active.
  const finalSample = stopFrameSampling?.() ?? null;
  stopFrameSampling = null;

  if (finalSample) {
    state = {
      ...state,
      frameSample: finalSample,
    };
  }

  recordAgorePerformanceMetric(
    "rendering",
    "Performance measurement session stopped",
    1,
    "count",
  );

  releaseCollection?.();
  releaseCollection = null;

  state = {
    ...state,
    active: false,
    endedAt: Date.now(),
  };

  notifySubscribers();
}