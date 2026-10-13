
"use client";

import {
  Activity,
  Gauge,
  Image as ImageIcon,
  MessageCircle,
  Minimize2,
  Pause,
  Play,
  Timer,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  getAgorePerformanceMetrics,
  startAgoreFrameSampling,
  startAgorePerformanceCollection,
  subscribeToAgorePerformanceMetrics,
} from "@/lib/performance/monitor";

import type {
  AgoreFrameSample,
  AgorePerformanceMetric,
} from "@/lib/performance/monitor";

function formatNumber(value: number): string {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 1,
  });
}

function formatMetric(
  metric: AgorePerformanceMetric | null,
): string {
  return metric
    ? `${formatNumber(metric.value)} ${metric.unit}`
    : "Not measured";
}

function findLatest(
  metrics: AgorePerformanceMetric[],
  predicate: (metric: AgorePerformanceMetric) => boolean,
): AgorePerformanceMetric | null {
  return (
    metrics.find(predicate) ?? null
  );
}

function HudMetric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
      <div className="flex items-center gap-1.5 text-[var(--muted)]">
        {icon}
        <span className="text-xs">{label}</span>
      </div>

      <p className="mt-2 break-words text-lg font-semibold tabular-nums">
        {value}
      </p>
    </div>
  );
}

export default function AgorePerformanceHud() {
  const [active, setActive] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [frameSample, setFrameSample] =
    useState<AgoreFrameSample | null>(null);

  const [metrics, setMetrics] =
    useState<AgorePerformanceMetric[]>([]);

  const [notice, setNotice] = useState("");

  const activeRef = useRef(false);
  const mountedRef = useRef(false);

  const stopFrameSamplingRef =
    useRef<(() => AgoreFrameSample | null) | null>(
      null,
    );

  const stopCollectionRef =
    useRef<(() => void) | null>(null);

  useEffect(() => {
    mountedRef.current = true;

    const refresh = () => {
      setMetrics(getAgorePerformanceMetrics());
    };

    refresh();

    const unsubscribe =
      subscribeToAgorePerformanceMetrics(refresh);

    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, []);

  const stopSampling = useCallback(
    (showFinalResult: boolean) => {
      if (!activeRef.current) {
        return;
      }

      activeRef.current = false;

      const finalSample =
        stopFrameSamplingRef.current?.() ?? null;

      stopFrameSamplingRef.current = null;

      stopCollectionRef.current?.();
      stopCollectionRef.current = null;

      if (showFinalResult && finalSample) {
        setFrameSample(finalSample);
      }

      setActive(false);
    },
    [],
  );

  useEffect(() => {
    return () => {
      // Do not update component state during unmount.
      activeRef.current = false;
      stopFrameSamplingRef.current?.();
      stopFrameSamplingRef.current = null;
      stopCollectionRef.current?.();
      stopCollectionRef.current = null;
    };
  }, []);

  const startSampling = useCallback(() => {
    if (activeRef.current) {
      setExpanded(true);
      return;
    }

    if (
      typeof window === "undefined" ||
      typeof window.requestAnimationFrame !== "function"
    ) {
      setNotice(
        "Live frame sampling is unavailable in this browser.",
      );
      setExpanded(true);
      return;
    }

    activeRef.current = true;

    setNotice("");
    setFrameSample(null);

    stopCollectionRef.current =
      startAgorePerformanceCollection();

    stopFrameSamplingRef.current =
      startAgoreFrameSampling((sample) => {
        if (mountedRef.current) {
          setFrameSample(sample);
        }
      });

    setActive(true);
    setExpanded(true);
  }, []);

  const closeHud = useCallback(() => {
    stopSampling(true);
    setExpanded(false);
    setNotice("");
  }, [stopSampling]);

  const minimizeHud = useCallback(() => {
    // Minimizing intentionally keeps measurements running.
    setExpanded(false);
  }, []);

  const latestImage = findLatest(
    metrics,
    (metric) => metric.category === "image",
  );

  const latestConversation = findLatest(
    metrics,
    (metric) => metric.category === "conversation",
  );

  const latestNavigation = findLatest(
    metrics,
    (metric) => metric.category === "navigation",
  );

  const latestInteraction = findLatest(
    metrics,
    (metric) => metric.category === "interaction",
  );

  const fps = frameSample
    ? `${formatNumber(frameSample.observedFps)} FPS`
    : "— FPS";

  const frameTime = frameSample
    ? `${formatNumber(frameSample.averageFrameTimeMs)} ms`
    : "— ms";

  const frameP95 = frameSample
    ? `${formatNumber(frameSample.p95FrameTimeMs)} ms`
    : "— ms";

  const slowFramePercent =
    frameSample && frameSample.frameCount > 0
      ? `${formatNumber(
          (frameSample.slowFrames /
            frameSample.frameCount) *
            100,
        )}%`
      : "—";

  if (!expanded) {
    return (
      <div className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] right-3 z-[80] lg:bottom-5 lg:right-5">
        <button
          type="button"
          onClick={() => {
            if (active) {
              setExpanded(true);
            } else {
              startSampling();
            }
          }}
          aria-label={
            active
              ? "Open Live Performance HUD"
              : "Start Live Performance HUD"
          }
          title="Live Performance HUD"
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3.5 shadow-lg transition hover:border-[var(--accent)] hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
            <Gauge size={17} />

            {active ? (
              <span className="absolute right-0 top-0 h-2 w-2 rounded-full bg-[var(--success)] ring-2 ring-[var(--surface)]" />
            ) : null}
          </span>

          <span className="text-sm font-semibold tabular-nums">
            {active
              ? frameSample
                ? `${formatNumber(frameSample.observedFps)} FPS`
                : "Sampling…"
              : "Live HUD"}
          </span>
        </button>
      </div>
    );
  }

  return (
    <aside
      aria-label="Agoré Live Performance HUD"
      className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] right-3 z-[80] w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] shadow-2xl lg:bottom-5 lg:right-5"
    >
      <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] p-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <Activity size={19} />
          </span>

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              Live Performance HUD
            </p>

            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--muted)]">
              <span
                className={`h-2 w-2 rounded-full ${
                  active
                    ? "animate-pulse bg-[var(--success)]"
                    : "bg-[var(--muted)]"
                }`}
              />
              {active ? "Sampling active" : "Sampling stopped"}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={minimizeHud}
            aria-label="Minimize HUD and continue sampling"
            title="Minimize"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
          >
            <Minimize2 size={17} />
          </button>

          <button
            type="button"
            onClick={closeHud}
            aria-label="Stop sampling and close HUD"
            title="Stop and close"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      <div className="max-h-[min(62dvh,34rem)] space-y-4 overflow-y-auto p-3.5">
        {notice ? (
          <p
            role="status"
            className="rounded-xl bg-[var(--surface-muted)] p-3 text-xs leading-5"
          >
            {notice}
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <HudMetric
            icon={<Activity size={14} />}
            label="Observed FPS"
            value={fps}
          />

          <HudMetric
            icon={<Timer size={14} />}
            label="Average frame"
            value={frameTime}
          />

          <HudMetric
            icon={<Timer size={14} />}
            label="P95 frame time"
            value={frameP95}
          />

          <HudMetric
            icon={<Activity size={14} />}
            label="Slow-frame share"
            value={slowFramePercent}
          />
        </div>

        {frameSample ? (
          <p className="text-xs leading-5 text-[var(--muted)]">
            Last sample: {frameSample.frameCount} frames.
            Slow frames are currently counted against a
            16.7 ms reference threshold, not a measured
            device refresh rate.
          </p>
        ) : (
          <p className="text-xs leading-5 text-[var(--muted)]">
            Frame readings appear after the first sampling
            window. FPS is estimated from observed animation
            frame cadence.
          </p>
        )}

        <section>
          <h2 className="text-sm font-semibold">
            Latest operations
          </h2>

          <div className="mt-2 divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] px-3">
            <div className="flex items-start gap-2.5 py-3">
              <ImageIcon
                size={16}
                className="mt-0.5 shrink-0 text-[var(--accent)]"
              />

              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium">
                  Image operation
                </p>
                <p className="mt-1 break-words text-xs text-[var(--muted)]">
                  {formatMetric(latestImage)}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 py-3">
              <MessageCircle
                size={16}
                className="mt-0.5 shrink-0 text-[var(--accent)]"
              />

              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium">
                  Conversation readiness
                </p>
                <p className="mt-1 break-words text-xs text-[var(--muted)]">
                  {formatMetric(latestConversation)}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 py-3">
              <Gauge
                size={16}
                className="mt-0.5 shrink-0 text-[var(--accent)]"
              />

              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium">
                  Navigation
                </p>
                <p className="mt-1 break-words text-xs text-[var(--muted)]">
                  {formatMetric(latestNavigation)}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 py-3">
              <Activity
                size={16}
                className="mt-0.5 shrink-0 text-[var(--accent)]"
              />

              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium">
                  Last interaction
                </p>
                <p className="mt-1 break-words text-xs text-[var(--muted)]">
                  {formatMetric(latestInteraction)}
                </p>
              </div>
            </div>
          </div>
        </section>

        {active ? (
          <button
            type="button"
            onClick={() => stopSampling(true)}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-[var(--border)] px-4 text-sm font-semibold transition hover:bg-[var(--surface-muted)]"
          >
            <Pause size={16} />
            Stop sampling
          </button>
        ) : (
          <button
            type="button"
            onClick={startSampling}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 text-sm font-semibold text-white transition hover:opacity-90"
          >
            <Play size={16} />
            Start sampling
          </button>
        )}
      </div>
    </aside>
  );
}
