"use client";

import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Copy,
  Gauge,
  Image as ImageIcon,
  Info,
  MessageCircle,
  MousePointerClick,
  Play,
  RotateCcw,
  Square,
  Timer,
  Trash2,
  Zap,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  clearAgorePerformanceMetrics,
  createAgoreDiagnosticReport,
  getAgorePerformanceMetrics,
  subscribeToAgorePerformanceMetrics,
} from "@/lib/performance/monitor";

import {
  getAgorePerformanceSessionState,
  startAgorePerformanceSession,
  stopAgorePerformanceSession,
  subscribeToAgorePerformanceSession,
} from "@/lib/performance/session";

import type {
  AgoreMetricCategory,
  AgorePerformanceMetric,
} from "@/lib/performance/monitor";

type MetricFilter = "all" | AgoreMetricCategory;

const FILTERS: {
  value: MetricFilter;
  label: string;
}[] = [
  { value: "all", label: "All" },
  { value: "navigation", label: "Navigation" },
  { value: "interaction", label: "Interactions" },
  { value: "image", label: "Images" },
  { value: "conversation", label: "Conversations" },
  { value: "rendering", label: "Rendering" },
  { value: "resource", label: "Resources" },
];

const CATEGORY_LABELS: Record<
  AgoreMetricCategory,
  string
> = {
  navigation: "Navigation",
  interaction: "Interaction",
  image: "Image",
  conversation: "Conversation",
  rendering: "Rendering",
  resource: "Resource",
};

// Keep the diagnostic UI from re-rendering for every metric batch.
// Collection remains active; only visible updates are throttled.
const METRIC_UI_REFRESH_INTERVAL_MS = 800;

function formatNumber(value: number): string {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 1,
  });
}

function formatMetricValue(
  metric: AgorePerformanceMetric | null,
): string {
  if (!metric) {
    return "—";
  }

  return `${formatNumber(metric.value)} ${metric.unit}`;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function latestMetric(
  metrics: AgorePerformanceMetric[],
  predicate: (metric: AgorePerformanceMetric) => boolean,
): AgorePerformanceMetric | null {
  for (const metric of metrics) {
    if (predicate(metric)) {
      return metric;
    }
  }

  return null;
}

function metricTone(
  metric: AgorePerformanceMetric,
): string {
  if (
    metric.unit === "ms" &&
    metric.value >= 1_000
  ) {
    return "text-[var(--danger)]";
  }

  if (
    metric.unit === "ms" &&
    metric.value >= 200
  ) {
    return "text-[var(--muted-strong)]";
  }

  return "text-[var(--foreground)]";
}

function MetricCard({
  icon,
  label,
  value,
  description,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-center gap-2 text-[var(--muted)]">
        <span className="text-[var(--accent)]">
          {icon}
        </span>
        <p className="text-sm font-medium">{label}</p>
      </div>

      <p className="mt-3 break-words text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">
        {value}
      </p>

      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
        {description}
      </p>
    </div>
  );
}

function MetricRow({
  metric,
}: {
  metric: AgorePerformanceMetric;
}) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-medium">
          {metric.label}
        </p>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--muted)]">
          <span>{CATEGORY_LABELS[metric.category]}</span>
          <span aria-hidden="true">·</span>
          <span>{formatTime(metric.recordedAt)}</span>
          <span aria-hidden="true">·</span>
          <span className="max-w-full break-all">
            {metric.pathname}
          </span>
        </div>
      </div>

      <p
        className={`shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums ${metricTone(metric)}`}
      >
        {formatMetricValue(metric)}
      </p>
    </div>
  );
}

// Existing rows retain their metric object references between refreshes,
// so memoization avoids re-rendering every row when a new metric arrives.
const MemoizedMetricRow = memo(MetricRow);

export default function PerformancePage() {
  const [metrics, setMetrics] = useState<
    AgorePerformanceMetric[]
  >([]);

  const [sessionState, setSessionState] = useState(
    () => getAgorePerformanceSessionState(),
  );

  const isCollecting = sessionState.active;
  const frameSample = sessionState.frameSample;

  const [filter, setFilter] =
    useState<MetricFilter>("all");

  const sessionStartedAt = sessionState.startedAt;
  const sessionEndedAt = sessionState.endedAt;

  const [notice, setNotice] = useState("");
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    let refreshTimer: number | null = null;

    const refreshMetricsImmediately = () => {
      setMetrics(getAgorePerformanceMetrics());
    };

    const refreshMetrics = () => {
      // Several samples can arrive in one burst. Schedule at most
      // one visual refresh per interval while collection continues.
      if (refreshTimer !== null) {
        return;
      }

      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        refreshMetricsImmediately();
      }, METRIC_UI_REFRESH_INTERVAL_MS);
    };

    const refreshSession = () => {
      setSessionState(getAgorePerformanceSessionState());
    };

    refreshMetricsImmediately();
    refreshSession();

    const unsubscribeMetrics =
      subscribeToAgorePerformanceMetrics(refreshMetrics);

    const unsubscribeSession =
      subscribeToAgorePerformanceSession(refreshSession);

    return () => {
      unsubscribeMetrics();
      unsubscribeSession();

      if (refreshTimer !== null) {
        window.clearTimeout(refreshTimer);
      }

      // Intentionally do not stop collection when this page unmounts.
    };
  }, []);

  const sessionMetrics = useMemo(() => {
    if (sessionStartedAt === null) {
      return metrics;
    }

    return metrics.filter(
      (metric) => metric.recordedAt >= sessionStartedAt,
    );
  }, [metrics, sessionStartedAt]);

  const visibleMetrics = useMemo(() => {
    const filtered =
      filter === "all"
        ? sessionMetrics
        : sessionMetrics.filter(
            (metric) => metric.category === filter,
          );

    return filtered.slice(0, 100);
  }, [filter, sessionMetrics]);

  const latestFps = latestMetric(
    sessionMetrics,
    (metric) => metric.label === "Live HUD average FPS",
  );

  const latestFrameTime = latestMetric(
    sessionMetrics,
    (metric) => metric.label === "Live HUD p95 frame time",
  );

  const latestPaint = latestMetric(
    sessionMetrics,
    (metric) =>
      metric.label === "Largest contentful paint candidate",
  );

  const latestFcp = latestMetric(
    sessionMetrics,
    (metric) =>
      metric.label === "First contentful paint",
  );

  const latestImage = latestMetric(
    sessionMetrics,
    (metric) => metric.category === "image",
  );

  const latestInteraction = latestMetric(
    sessionMetrics,
    (metric) => metric.category === "interaction",
  );

  const conversationMeasurements = sessionMetrics.filter(
    (metric) => metric.category === "conversation",
  );

  const startSession = useCallback(() => {
    if (isCollecting) {
      setNotice("A measurement session is already active.");
      return;
    }

    const started = startAgorePerformanceSession();

    if (!started) {
      setNotice(
        "Live frame sampling is unavailable in this browser.",
      );
      return;
    }

    setNotice(
      "Measurement session started. You can navigate away; sampling will continue until you stop it.",
    );
  }, [isCollecting]);

  const stopSession = useCallback(() => {
    if (!isCollecting) {
      return;
    }

    stopAgorePerformanceSession();
    setSessionState(getAgorePerformanceSessionState());

    setNotice(
      "Measurement session ended. Results are available below.",
    );
  }, [isCollecting]);

  const copyReport = useCallback(async () => {
    setCopying(true);
    setNotice("");

    try {
      await navigator.clipboard.writeText(
        createAgoreDiagnosticReport(),
      );

      setNotice("Diagnostic report copied.");
    } catch {
      setNotice(
        "Clipboard access is unavailable. Try copying from a secure browser context.",
      );
    } finally {
      setCopying(false);
    }
  }, []);

  const clearMeasurements = useCallback(() => {
    if (isCollecting) {
      setNotice(
        "Stop the measurement session before clearing results.",
      );
      return;
    }

    clearAgorePerformanceMetrics();

    setMetrics([]);
    setNotice("Local measurement history cleared.");
  }, [isCollecting]);

  const sessionStatus = isCollecting
    ? "Measuring"
    : sessionEndedAt !== null
      ? "Completed"
      : "Ready";

  return (
    <main className="min-w-0 pb-32 text-[var(--foreground)] sm:pb-10">
      <div className="mx-auto w-full max-w-5xl">
        <Link
          href="/settings"
          className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-medium transition hover:bg-[var(--surface-muted)]"
        >
          <ArrowLeft size={16} />
          Settings
        </Link>

        <header className="py-7 sm:py-10">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <Gauge size={25} />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
                Device diagnostics
              </p>

              <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                Performance Center
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)] sm:text-base">
                Understand rendering smoothness, loading time,
                and responsiveness while using Agoré.
              </p>
            </div>
          </div>
        </header>

        {notice ? (
          <div
            role="status"
            className="mb-5 flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
          >
            <Info
              size={18}
              className="mt-0.5 shrink-0 text-[var(--accent)]"
            />

            <p className="min-w-0 flex-1 text-sm leading-6">
              {notice}
            </p>

            <button
              type="button"
              onClick={() => setNotice("")}
              aria-label="Dismiss message"
              className="rounded-lg p-1 text-[var(--muted)] hover:bg-[var(--surface-muted)]"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        ) : null}

        <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    isCollecting
                      ? "animate-pulse bg-[var(--success)]"
                      : "bg-[var(--muted)]"
                  }`}
                />

                <h2 className="text-lg font-semibold">
                  Current session
                </h2>
              </div>

              <p className="mt-1 text-sm text-[var(--muted)]">
                Status: {sessionStatus}
              </p>
            </div>

            {isCollecting ? (
              <button
                type="button"
                onClick={stopSession}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-5 text-sm font-semibold transition hover:bg-[var(--surface-muted)]"
              >
                <Square size={15} />
                Stop session
              </button>
            ) : (
              <button
                type="button"
                onClick={startSession}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-5 text-sm font-semibold text-white transition hover:opacity-90"
              >
                <Play size={16} />
                Start measuring
              </button>
            )}
          </div>

          <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
            Start a session here, then navigate around Agoré to
            measure real usage. Collection continues across routes
            until you explicitly stop it from this page or the
            Live Performance HUD. Results stay in this browser
            session and are not automatically uploaded.
          </p>

          {sessionStartedAt !== null ? (
            <p className="mt-2 text-xs text-[var(--muted)]">
              Started: {formatTime(sessionStartedAt)}
              {sessionEndedAt !== null
                ? ` · Ended: ${formatTime(sessionEndedAt)}`
                : ""}
            </p>
          ) : null}
        </section>

        <section className="mt-5 grid grid-cols-2 gap-3 sm:gap-4">
          <MetricCard
            icon={<Activity size={18} />}
            label="Observed FPS"
            value={
              frameSample
                ? formatNumber(frameSample.observedFps)
                : formatMetricValue(latestFps)
            }
            description={
              frameSample
                ? "Last frame-sampling window"
                : "Start a session to measure"
            }
          />

          <MetricCard
            icon={<Timer size={18} />}
            label="P95 frame time"
            value={
              frameSample
                ? `${formatNumber(frameSample.p95FrameTimeMs)} ms`
                : formatMetricValue(latestFrameTime)
            }
            description="95th-percentile frame duration"
          />

          <MetricCard
            icon={<Zap size={18} />}
            label="Largest paint"
            value={formatMetricValue(latestPaint)}
            description={
              latestPaint
                ? "Latest observed LCP candidate"
                : "Not recorded yet"
            }
          />

          <MetricCard
            icon={<MousePointerClick size={18} />}
            label="Last interaction"
            value={formatMetricValue(latestInteraction)}
            description={
              latestInteraction
                ? latestInteraction.label
                : "Waiting for supported interaction data"
            }
          />
        </section>

        {frameSample ? (
          <section className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <Activity
                size={18}
                className="text-[var(--accent)]"
              />

              <h2 className="font-semibold">
                Frame sampling details
              </h2>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <p className="text-xs text-[var(--muted)]">
                  Average frame
                </p>
                <p className="mt-1 font-semibold tabular-nums">
                  {frameSample.averageFrameTimeMs} ms
                </p>
              </div>

              <div>
                <p className="text-xs text-[var(--muted)]">
                  P95 frame
                </p>
                <p className="mt-1 font-semibold tabular-nums">
                  {frameSample.p95FrameTimeMs} ms
                </p>
              </div>

              <div>
                <p className="text-xs text-[var(--muted)]">
                  Slow frames
                </p>
                <p className="mt-1 font-semibold tabular-nums">
                  {frameSample.slowFrames}
                </p>
              </div>

              <div>
                <p className="text-xs text-[var(--muted)]">
                  Frames sampled
                </p>
                <p className="mt-1 font-semibold tabular-nums">
                  {frameSample.frameCount}
                </p>
              </div>
            </div>

            <p className="mt-4 text-xs leading-5 text-[var(--muted)]">
              Slow-frame counting currently uses a 16.7 ms reference
              threshold. This is suitable as a 60 Hz reference, but
              it does not identify the display's actual refresh rate.
            </p>
          </section>
        ) : null}

        <section className="mt-8">
          <div>
            <h2 className="text-xl font-semibold">
              Performance breakdown
            </h2>

            <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
              Inspect measured operations and identify what still
              needs direct instrumentation.
            </p>
          </div>

          <div className="mt-4 space-y-3">
            <Link
              href="/performance"
              className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 transition hover:bg-[var(--surface-muted)]"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                <ImageIcon size={20} />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">
                  Image loading
                </span>

                <span className="mt-1 block text-xs leading-5 text-[var(--muted)]">
                  Signing and browser resource durations
                </span>

                <span className="mt-2 block text-sm tabular-nums">
                  Latest: {formatMetricValue(latestImage)}
                </span>
              </span>

              <ChevronRight
                size={18}
                className="shrink-0 text-[var(--muted)]"
              />
            </Link>

            <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-muted)] text-[var(--muted)]">
                <MessageCircle size={20} />
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  Conversation loading
                </p>

                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                  Readiness and browser-side API timing measurements.
                </p>

                <p className="mt-2 text-sm">
                  {conversationMeasurements.length > 0
                    ? `${conversationMeasurements.length} measurements recorded`
                    : "No conversation measurements in this session yet."}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-muted)] text-[var(--muted)]">
                <RotateCcw size={20} />
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  Navigation readiness
                </p>

                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                  Route-specific navigation readiness timing is not
                  fully instrumented yet.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                <MousePointerClick size={20} />
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  Contentful paint
                </p>

                <p className="mt-1 text-xs text-[var(--muted)]">
                  First contentful paint
                </p>

                <p className="mt-2 text-sm tabular-nums">
                  {formatMetricValue(latestFcp)}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">
                Measurements
              </h2>

              <p className="mt-1 text-sm text-[var(--muted)]">
                {sessionMetrics.length} stored measurements
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void copyReport()}
                disabled={copying || sessionMetrics.length === 0}
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--border)] px-3.5 text-sm font-medium transition hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {copying ? (
                  <CheckCircle2 size={16} />
                ) : (
                  <Copy size={16} />
                )}
                Copy report
              </button>

              <button
                type="button"
                onClick={clearMeasurements}
                disabled={isCollecting || metrics.length === 0}
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--border)] px-3.5 text-sm font-medium transition hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 size={15} />
                Clear
              </button>
            </div>
          </div>

          <div
            className="mt-4 flex gap-2 overflow-x-auto pb-2"
            aria-label="Filter measurements"
          >
            {FILTERS.map((item) => (
              <button
                type="button"
                key={item.value}
                onClick={() => setFilter(item.value)}
                aria-pressed={filter === item.value}
                className={`shrink-0 rounded-full border px-3.5 py-2 text-xs font-medium transition ${
                  filter === item.value
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-muted)]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {visibleMetrics.length > 0 ? (
            <div className="mt-2 h-[60vh] min-h-56 max-h-[32rem] overflow-y-auto overscroll-contain divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] px-3">
              {visibleMetrics.map((metric) => (
                <MemoizedMetricRow
                  key={metric.id}
                  metric={metric}
                />
              ))}
            </div>
          ) : (
            <div className="mt-2 flex h-[60vh] min-h-56 max-h-[32rem] flex-col items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-8 text-center">
              <Activity
                size={25}
                className="mx-auto text-[var(--muted)]"
              />

              <p className="mt-3 text-sm font-semibold">
                No measurements in this view
              </p>

              <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-[var(--muted)]">
                Start a measurement session and use Agoré.
                Supported browser measurements will appear here.
                Some metrics require additional route-specific
                instrumentation.
              </p>
            </div>
          )}

          <p className="mt-5 border-t border-[var(--border)] pt-4 text-xs leading-5 text-[var(--muted)]">
            Measurements are estimates from this browser session.
            Cross-origin resource details may be restricted by browser
            timing policies. FPS, interaction timings and server
            response times describe different parts of the experience.
            No diagnostic report is uploaded automatically.
          </p>
        </section>
      </div>
    </main>
  );
}