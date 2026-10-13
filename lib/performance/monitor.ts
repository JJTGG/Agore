
"use client";

export type AgoreMetricCategory =
  | "navigation"
  | "interaction"
  | "image"
  | "conversation"
  | "rendering"
  | "resource";

export type AgoreMetricUnit =
  | "ms"
  | "fps"
  | "count"
  | "score"
  | "percent"
  | "bytes";

export type AgorePerformanceMetric = {
  id: string;
  category: AgoreMetricCategory;
  label: string;
  value: number;
  unit: AgoreMetricUnit;
  recordedAt: number;
  pathname: string;
  details: Record<string, number | boolean>;
};

export type AgoreFrameSample = {
  elapsedMs: number;
  observedFps: number;
  averageFrameTimeMs: number;
  p95FrameTimeMs: number;
  slowFrames: number;
  frameCount: number;
  targetFrameTimeMs: number;
};

const STORAGE_KEY = "agore_performance_metrics_v1";
const MAX_METRICS = 250;
const MAX_FRAME_INTERVALS = 12_000;

const CATEGORIES: AgoreMetricCategory[] = [
  "navigation",
  "interaction",
  "image",
  "conversation",
  "rendering",
  "resource",
];

const UNITS: AgoreMetricUnit[] = [
  "ms",
  "fps",
  "count",
  "score",
  "percent",
  "bytes",
];

const DYNAMIC_ROUTE_PARENTS = new Set([
  "profile",
  "messages",
  "conversation",
  "post",
  "u",
  "user",
  "group",
]);

let cachedMetrics: AgorePerformanceMetric[] | null = null;

const subscribers = new Set<() => void>();
const observers: PerformanceObserver[] = [];
const seenEntrySignatures = new Set<string>();
const seenEntryOrder: string[] = [];
const recordedDocumentTimings = new Set<string>();
const recordedPaintNames = new Set<string>();

let collectionUsers = 0;
let documentLoadHandler: (() => void) | null = null;

function isBrowser(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof performance !== "undefined"
  );
}

function createId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function roundValue(
  value: number,
  unit: AgoreMetricUnit,
): number {
  const decimals =
    unit === "score" ? 3 :
    unit === "count" || unit === "bytes" ? 0 :
    1;

  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function sanitizeLabel(label: string): string {
  return label
    .replace(/https?:\/\/\S+/gi, "[URL]")
    .replace(
      /\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi,
      "[email]",
    )
    .replace(/[\u0000-\u001f]/g, " ")
    .trim()
    .slice(0, 80) || "Measurement";
}

function sanitizePath(pathname?: string): string {
  if (!pathname && !isBrowser()) {
    return "/";
  }

  const source = pathname ?? window.location.pathname;
  const pathOnly = source.split(/[?#]/, 1)[0] || "/";
  const segments = pathOnly.split("/").filter(Boolean);

  const safeSegments = segments.map((segment, index) => {
    let decoded = segment;

    try {
      decoded = decodeURIComponent(segment);
    } catch {
      // Keep the original segment when decoding fails.
    }

    const previous = segments[index - 1]?.toLowerCase();

    if (
      DYNAMIC_ROUTE_PARENTS.has(previous ?? "") ||
      /^[0-9]+$/.test(decoded) ||
      /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(decoded) ||
      decoded.includes("@")
    ) {
      return ":id";
    }

    return decoded
      .replace(/[^\w.-]/g, "")
      .slice(0, 40);
  });

  return `/${safeSegments.join("/")}`.slice(0, 160) || "/";
}

function sanitizeDetails(
  details?: Record<string, unknown>,
): Record<string, number | boolean> {
  const safe: Record<string, number | boolean> = {};

  if (!details) {
    return safe;
  }

  for (const [key, value] of Object.entries(details).slice(0, 20)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,35}$/.test(key)) {
      continue;
    }

    if (typeof value === "boolean") {
      safe[key] = value;
    } else if (
      typeof value === "number" &&
      Number.isFinite(value)
    ) {
      safe[key] = roundValue(value, "ms");
    }
  }

  return safe;
}

function isStoredMetric(
  value: unknown,
): value is AgorePerformanceMetric {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Record<string, unknown>;

  return (
    typeof item.id === "string" &&
    typeof item.label === "string" &&
    CATEGORIES.includes(item.category as AgoreMetricCategory) &&
    UNITS.includes(item.unit as AgoreMetricUnit) &&
    typeof item.value === "number" &&
    Number.isFinite(item.value) &&
    typeof item.recordedAt === "number" &&
    typeof item.pathname === "string"
  );
}

function getCache(): AgorePerformanceMetric[] {
  if (cachedMetrics !== null) {
    return cachedMetrics;
  }

  cachedMetrics = [];

  if (!isBrowser()) {
    return cachedMetrics;
  }

  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);

    if (!stored) {
      return cachedMetrics;
    }

    const parsed: unknown = JSON.parse(stored);

    if (Array.isArray(parsed)) {
      cachedMetrics = parsed
        .filter(isStoredMetric)
        .slice(-MAX_METRICS)
        .map((metric) => ({
          ...metric,
          label: sanitizeLabel(metric.label),
          pathname: sanitizePath(metric.pathname),
          details: sanitizeDetails(metric.details),
        }));
    }
  } catch {
    // Storage may be unavailable or contain invalid data.
  }

  return cachedMetrics;
}

function persist(): void {
  if (!isBrowser()) {
    return;
  }

  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(getCache()),
    );
  } catch {
    // Measurement must never break the main app.
  }
}

function notifySubscribers(): void {
  for (const subscriber of subscribers) {
    try {
      subscriber();
    } catch {
      // A subscriber must not interrupt other measurements.
    }
  }
}

export function recordAgorePerformanceMetric(
  category: AgoreMetricCategory,
  label: string,
  value: number,
  unit: AgoreMetricUnit = "ms",
  details?: Record<string, unknown>,
  pathname?: string,
): AgorePerformanceMetric | null {
  // Measurement is explicitly opt-in. Components may report
  // events, but nothing is stored outside an active session.
  if (
    !isBrowser() ||
    collectionUsers <= 0 ||
    !Number.isFinite(value) ||
    value < 0 ||
    !CATEGORIES.includes(category) ||
    !UNITS.includes(unit)
  ) {
    return null;
  }

  const metric: AgorePerformanceMetric = {
    id: createId(),
    category,
    label: sanitizeLabel(label),
    value: roundValue(value, unit),
    unit,
    recordedAt: Date.now(),
    pathname: sanitizePath(pathname),
    details: sanitizeDetails(details),
  };

  const metrics = getCache();
  metrics.push(metric);

  if (metrics.length > MAX_METRICS) {
    metrics.splice(0, metrics.length - MAX_METRICS);
  }

  persist();
  notifySubscribers();

  return metric;
}

export function getAgorePerformanceMetrics(): AgorePerformanceMetric[] {
  return [...getCache()].reverse();
}

export function subscribeToAgorePerformanceMetrics(
  callback: () => void,
): () => void {
  subscribers.add(callback);

  return () => {
    subscribers.delete(callback);
  };
}

export function clearAgorePerformanceMetrics(): void {
  cachedMetrics = [];

  if (isBrowser()) {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Clearing in-memory measurements still succeeds.
    }
  }

  notifySubscribers();
}

function hashString(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function isNewPerformanceEntry(
  entry: PerformanceEntry,
): boolean {
  const signature = [
    entry.entryType,
    entry.startTime.toFixed(2),
    entry.duration.toFixed(2),
    entry.name.length,
    hashString(entry.name),
  ].join(":");

  if (seenEntrySignatures.has(signature)) {
    return false;
  }

  seenEntrySignatures.add(signature);
  seenEntryOrder.push(signature);

  if (seenEntryOrder.length > 1_500) {
    const oldest = seenEntryOrder.shift();

    if (oldest) {
      seenEntrySignatures.delete(oldest);
    }
  }

  return true;
}

function recordDocumentTimings(): void {
  if (!isBrowser()) {
    return;
  }

  const entry = performance.getEntriesByType(
    "navigation",
  )[0] as PerformanceNavigationTiming | undefined;

  if (!entry) {
    return;
  }

  function recordOnce(
    key: string,
    label: string,
    value: number,
  ): void {
    if (
      recordedDocumentTimings.has(key) ||
      !Number.isFinite(value) ||
      value <= 0
    ) {
      return;
    }

    recordedDocumentTimings.add(key);

    recordAgorePerformanceMetric(
      "navigation",
      label,
      value,
      "ms",
    );
  }

  if (entry.responseStart > 0) {
    const requestStart =
      entry.requestStart > 0
        ? entry.requestStart
        : entry.fetchStart;

    recordOnce(
      "document-ttfb",
      "Document time to first byte",
      entry.responseStart - requestStart,
    );
  }

  recordOnce(
    "document-dom-content-loaded",
    "Document DOM ready",
    entry.domContentLoadedEventEnd - entry.startTime,
  );

  recordOnce(
    "document-load-complete",
    "Document load complete",
    entry.loadEventEnd - entry.startTime,
  );
}

function classifyResource(
  entry: PerformanceEntry,
): {
  category: AgoreMetricCategory;
  label: string;
} | null {
  const resource = entry as PerformanceResourceTiming;

  let pathname = "";

  try {
    pathname = new URL(
      resource.name,
      window.location.href,
    ).pathname;
  } catch {
    // Ignore malformed resource names.
  }

  if (pathname.includes("/storage/v1/object/sign/post-media/")) {
    return {
      category: "image",
      label: "Post-media URL signing",
    };
  }

  if (pathname.includes("/storage/v1/object/sign/avatars/")) {
    return {
      category: "image",
      label: "Avatar URL signing",
    };
  }

  if (pathname.includes("/storage/v1/object/sign/message-media/")) {
    return {
      category: "resource",
      label: "Message-media URL signing",
    };
  }

  if (
    resource.initiatorType === "img" ||
    /\.(avif|gif|jpe?g|png|webp|svg)$/i.test(pathname)
  ) {
    return {
      category: "image",
      label: "Image resource response",
    };
  }

  if (pathname.startsWith("/rest/v1/")) {
    const endpoint = pathname
      .slice("/rest/v1/".length)
      .split("/")
      .slice(0, 2)
      .join("/");

    return {
      category: "resource",
      label: `REST API: ${endpoint || "request"}`,
    };
  }

  if (pathname.startsWith("/auth/v1/")) {
    return {
      category: "resource",
      label: "Authentication API request",
    };
  }

  if (pathname.startsWith("/storage/v1/")) {
    return {
      category: "resource",
      label: "Storage API request",
    };
  }

  if (
    resource.initiatorType === "video" ||
    resource.initiatorType === "audio"
  ) {
    return {
      category: "resource",
      label: "Media resource response",
    };
  }

  return null;
}

function addObserver(
  type: string,
  options: PerformanceObserverInit,
  handler: (entry: PerformanceEntry) => void,
): void {
  if (typeof PerformanceObserver === "undefined") {
    return;
  }

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (!isNewPerformanceEntry(entry)) {
        continue;
      }

      try {
        handler(entry);
      } catch {
        // A metric failure must never affect the application.
      }
    }
  });

  try {
    observer.observe(options);
    observers.push(observer);
  } catch {
    observer.disconnect();
  }
}

function startObservers(): void {
  addObserver(
    "resource",
    { type: "resource", buffered: true },
    (entry) => {
      const resource = entry as PerformanceResourceTiming;
      const classified = classifyResource(entry);

      if (!classified || resource.duration < 40) {
        return;
      }

      recordAgorePerformanceMetric(
        classified.category,
        classified.label,
        resource.duration,
        "ms",
        {
          transferSizeBytes: resource.transferSize,
        },
      );
    },
  );

  addObserver(
    "event",
    {
      type: "event",
      buffered: true,
      durationThreshold: 16,
    } as PerformanceObserverInit,
    (entry) => {
      if (entry.duration < 16) {
        return;
      }

      const eventName = /^[a-z-]{1,24}$/i.test(entry.name)
        ? entry.name
        : "event";

      recordAgorePerformanceMetric(
        "interaction",
        `Browser interaction: ${eventName}`,
        entry.duration,
        "ms",
      );
    },
  );

  addObserver(
    "longtask",
    { type: "longtask", buffered: true },
    (entry) => {
      recordAgorePerformanceMetric(
        "rendering",
        "Main-thread long task",
        entry.duration,
        "ms",
      );
    },
  );

  addObserver(
    "paint",
    { type: "paint", buffered: true },
    (entry) => {
      if (
        entry.name !== "first-contentful-paint" ||
        recordedPaintNames.has(entry.name)
      ) {
        return;
      }

      recordedPaintNames.add(entry.name);

      recordAgorePerformanceMetric(
        "navigation",
        "First contentful paint",
        entry.startTime,
        "ms",
      );
    },
  );

  addObserver(
    "largest-contentful-paint",
    { type: "largest-contentful-paint", buffered: true },
    (entry) => {
      recordAgorePerformanceMetric(
        "navigation",
        "Largest contentful paint candidate",
        entry.startTime,
        "ms",
      );
    },
  );

  addObserver(
    "layout-shift",
    { type: "layout-shift", buffered: true },
    (entry) => {
      const shift = entry as PerformanceEntry & {
        value?: number;
        hadRecentInput?: boolean;
      };

      if (
        shift.hadRecentInput ||
        typeof shift.value !== "number" ||
        shift.value <= 0
      ) {
        return;
      }

      recordAgorePerformanceMetric(
        "rendering",
        "Layout shift contribution",
        shift.value,
        "score",
      );
    },
  );

  recordDocumentTimings();

  if (document.readyState !== "complete") {
    documentLoadHandler = recordDocumentTimings;

    window.addEventListener("load", documentLoadHandler, {
      once: true,
    });
  }
}

export function startAgorePerformanceCollection(): () => void {
  if (!isBrowser()) {
    return () => undefined;
  }

  collectionUsers += 1;

  if (collectionUsers === 1) {
    startObservers();
  }

  let released = false;

  return () => {
    if (released) {
      return;
    }

    released = true;
    collectionUsers = Math.max(0, collectionUsers - 1);

    if (collectionUsers === 0) {
      for (const observer of observers) {
        observer.disconnect();
      }

      observers.length = 0;

      if (documentLoadHandler) {
        window.removeEventListener("load", documentLoadHandler);
        documentLoadHandler = null;
      }
    }
  };
}

function percentile95(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0;
}

function buildFrameSample(
  intervals: number[],
  elapsedMs: number,
  slowFrames: number,
  targetFrameTimeMs: number,
): AgoreFrameSample {
  const frameCount = intervals.length;
  const total = intervals.reduce((sum, value) => sum + value, 0);

  return {
    elapsedMs: roundValue(elapsedMs, "ms"),
    observedFps:
      elapsedMs > 0
        ? roundValue((frameCount * 1_000) / elapsedMs, "fps")
        : 0,
    averageFrameTimeMs:
      frameCount > 0
        ? roundValue(total / frameCount, "ms")
        : 0,
    p95FrameTimeMs: roundValue(
      percentile95(intervals),
      "ms",
    ),
    slowFrames,
    frameCount,
    targetFrameTimeMs,
  };
}

/**
 * Starts frame sampling only when the user explicitly opens
 * the Live HUD. Stop the returned sampler when they close it.
 *
 * The default slow-frame threshold is the 60 Hz budget (16.7 ms).
 * This is a reference threshold, not a claim about the device's
 * actual display refresh rate.
 */
export function startAgoreFrameSampling(
  onSample: (sample: AgoreFrameSample) => void,
  targetFrameTimeMs = 16.7,
): () => AgoreFrameSample | null {
  if (
    !isBrowser() ||
    typeof window.requestAnimationFrame !== "function"
  ) {
    return () => null;
  }

  let active = true;
  let frameRequest = 0;
  let lastFrameAt: number | null = null;
  let sampleWindowStart: number | null = null;

  let windowIntervals: number[] = [];
  let windowSlowFrames = 0;

  let recentIntervals: number[] = [];
  let totalActiveDuration = 0;
  let totalFrames = 0;
  let totalSlowFrames = 0;

  function resetWindow(): void {
    lastFrameAt = null;
    sampleWindowStart = null;
    windowIntervals = [];
    windowSlowFrames = 0;
  }

  function handleVisibility(): void {
    if (document.visibilityState === "hidden") {
      resetWindow();
    }
  }

  function tick(timestamp: number): void {
    if (!active) {
      return;
    }

    if (document.visibilityState === "hidden") {
      resetWindow();
      frameRequest = window.requestAnimationFrame(tick);
      return;
    }

    if (lastFrameAt === null) {
      lastFrameAt = timestamp;
      sampleWindowStart = timestamp;
      frameRequest = window.requestAnimationFrame(tick);
      return;
    }

    const interval = timestamp - lastFrameAt;
    lastFrameAt = timestamp;

    // Ignore large gaps which may represent browser suspension.
    if (interval > 0 && interval <= 1_000) {
      windowIntervals.push(interval);
      totalActiveDuration += interval;
      totalFrames += 1;

      if (interval > targetFrameTimeMs) {
        windowSlowFrames += 1;
        totalSlowFrames += 1;
      }

      recentIntervals.push(interval);

      if (recentIntervals.length > MAX_FRAME_INTERVALS) {
        recentIntervals.shift();
      }
    }

    if (
      sampleWindowStart !== null &&
      timestamp - sampleWindowStart >= 1_000
    ) {
      const sample = buildFrameSample(
        windowIntervals,
        timestamp - sampleWindowStart,
        windowSlowFrames,
        targetFrameTimeMs,
      );

      onSample(sample);

      windowIntervals = [];
      windowSlowFrames = 0;
      sampleWindowStart = timestamp;
    }

    frameRequest = window.requestAnimationFrame(tick);
  }

  document.addEventListener("visibilitychange", handleVisibility);

  frameRequest = window.requestAnimationFrame(tick);

  return () => {
    if (!active) {
      return null;
    }

    active = false;
    window.cancelAnimationFrame(frameRequest);
    document.removeEventListener(
      "visibilitychange",
      handleVisibility,
    );

    if (totalFrames === 0 || totalActiveDuration <= 0) {
      return null;
    }

    // Calculate overall FPS from every valid sampled frame.
    // The bounded buffer is used only for recent p95 frame time.
    const finalSample: AgoreFrameSample = {
      ...buildFrameSample(
        recentIntervals,
        totalActiveDuration,
        totalSlowFrames,
        targetFrameTimeMs,
      ),
      observedFps: roundValue(
        (totalFrames * 1_000) / totalActiveDuration,
        "fps",
      ),
      averageFrameTimeMs: roundValue(
        totalActiveDuration / totalFrames,
        "ms",
      ),
      elapsedMs: roundValue(totalActiveDuration, "ms"),
      frameCount: totalFrames,
      slowFrames: totalSlowFrames,
    };

    recordAgorePerformanceMetric(
      "rendering",
      "Live HUD average FPS",
      finalSample.observedFps,
      "fps",
      {
        sampleDurationMs: finalSample.elapsedMs,
        totalFrames,
        slowFrames: totalSlowFrames,
        targetFrameTimeMs,
      },
    );

    recordAgorePerformanceMetric(
      "rendering",
      "Live HUD p95 frame time",
      finalSample.p95FrameTimeMs,
      "ms",
      {
        totalFrames,
        slowFrames: totalSlowFrames,
        targetFrameTimeMs,
      },
    );

    onSample(finalSample);

    return finalSample;
  };
}

export function createAgoreDiagnosticReport(): string {
  const metrics = getAgorePerformanceMetrics().slice(0, 100);

  const device =
    isBrowser()
      ? navigator.userAgent
      : "Unavailable";

  const lines = [
    "AGORÉ PERFORMANCE REPORT",
    `Generated: ${new Date().toISOString()}`,
    `Device/browser: ${device}`,
    "",
    "Measurements are local samples, not a load-test result.",
    "Full request URLs and message contents are not included.",
    "",
    `Included measurements: ${metrics.length}`,
    "",
  ];

  for (const metric of metrics) {
    lines.push(
      `[${new Date(metric.recordedAt).toISOString()}]`,
      `Category: ${metric.category}`,
      `Measurement: ${metric.label}`,
      `Value: ${metric.value} ${metric.unit}`,
      `Route: ${metric.pathname}`,
    );

    if (Object.keys(metric.details).length > 0) {
      lines.push(
        `Details: ${JSON.stringify(metric.details)}`,
      );
    }

    lines.push("");
  }

  return lines.join("\n");
}
