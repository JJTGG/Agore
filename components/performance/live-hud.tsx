"use client";

import {
  Activity,
  ChevronDown,
  ChevronUp,
  Gauge,
  GripVertical,
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
import type { PointerEvent as ReactPointerEvent } from "react";

import {
  getAgorePerformanceMetrics,
  subscribeToAgorePerformanceMetrics,
} from "@/lib/performance/monitor";

import type {
  AgorePerformanceMetric,
} from "@/lib/performance/monitor";

import {
  getAgorePerformanceSessionState,
  startAgorePerformanceSession,
  stopAgorePerformanceSession,
  subscribeToAgorePerformanceSession,
} from "@/lib/performance/session";

import type {
  AgorePerformanceSessionState,
} from "@/lib/performance/session";

type HudPosition = {
  x: number;
  y: number;
};

type DragState = {
  pointerId: number;
  pointerX: number;
  pointerY: number;
  startX: number;
  startY: number;
};

const POSITION_STORAGE_KEY =
  "agore_performance_hud_position_v1";

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
  return metrics.find(predicate) ?? null;
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
  const [session, setSession] =
    useState<AgorePerformanceSessionState>(
      () => getAgorePerformanceSessionState(),
    );

  const [expanded, setExpanded] = useState(false);
  const [detailsExpanded, setDetailsExpanded] =
    useState(true);

  const [position, setPosition] =
    useState<HudPosition | null>(null);

  const [isDragging, setIsDragging] = useState(false);

  const [metrics, setMetrics] =
    useState<AgorePerformanceMetric[]>([]);

  const [notice, setNotice] = useState("");

  const hudRef = useRef<HTMLDivElement | null>(null);
  const positionRef = useRef<HudPosition | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const activeRef = useRef(false);

  const active = session.active;
  const frameSample = session.frameSample;

  useEffect(() => {
    const refreshMetrics = () => {
      setMetrics(getAgorePerformanceMetrics());
    };

    const refreshSession = () => {
      const nextSession = getAgorePerformanceSessionState();

      activeRef.current = nextSession.active;
      setSession(nextSession);
    };

    refreshMetrics();
    refreshSession();

    const unsubscribeMetrics =
      subscribeToAgorePerformanceMetrics(refreshMetrics);

    const unsubscribeSession =
      subscribeToAgorePerformanceSession(refreshSession);

    return () => {
      unsubscribeMetrics();
      unsubscribeSession();

      // Do not stop sampling on component cleanup.
      // The shared controller owns the session lifecycle.
    };
  }, []);

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(
        POSITION_STORAGE_KEY,
      );

      if (!saved) {
        return;
      }

      const parsed: unknown = JSON.parse(saved);

      if (
        !parsed ||
        typeof parsed !== "object" ||
        !("x" in parsed) ||
        !("y" in parsed) ||
        typeof parsed.x !== "number" ||
        typeof parsed.y !== "number" ||
        !Number.isFinite(parsed.x) ||
        !Number.isFinite(parsed.y)
      ) {
        return;
      }

      positionRef.current = {
        x: parsed.x,
        y: parsed.y,
      };

      setPosition(positionRef.current);
    } catch {
      // Position persistence is optional.
    }
  }, []);

  const clampPosition = useCallback(
    (x: number, y: number): HudPosition => {
      const rect = hudRef.current?.getBoundingClientRect();

      const width = rect?.width ?? 280;
      const height = rect?.height ?? 120;

      const maxX = Math.max(
        8,
        window.innerWidth - width - 8,
      );

      const maxY = Math.max(
        8,
        window.innerHeight - height - 8,
      );

      return {
        x: Math.round(Math.max(8, Math.min(x, maxX))),
        y: Math.round(Math.max(8, Math.min(y, maxY))),
      };
    },
    [],
  );

  useEffect(() => {
    if (!position) {
      return;
    }

    const next = clampPosition(position.x, position.y);

    if (
      Math.abs(next.x - position.x) > 1 ||
      Math.abs(next.y - position.y) > 1
    ) {
      positionRef.current = next;
      setPosition(next);
    }
  }, [position, expanded, detailsExpanded, clampPosition]);

  useEffect(() => {
    function handleResize() {
      const current = positionRef.current;

      if (!current) {
        return;
      }

      const next = clampPosition(current.x, current.y);

      positionRef.current = next;
      setPosition(next);
    }

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [clampPosition]);

  const startDragging = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      // Header controls must remain clickable.
      if (
        event.target instanceof Element &&
        event.target.closest("button")
      ) {
        return;
      }

      if (event.button !== 0 || !hudRef.current) {
        return;
      }

      const rect = hudRef.current.getBoundingClientRect();

      const startingPosition = positionRef.current ?? {
        x: rect.left,
        y: rect.top,
      };

      const safeStart = clampPosition(
        startingPosition.x,
        startingPosition.y,
      );

      positionRef.current = safeStart;
      setPosition(safeStart);

      dragRef.current = {
        pointerId: event.pointerId,
        pointerX: event.clientX,
        pointerY: event.clientY,
        startX: safeStart.x,
        startY: safeStart.y,
      };

      setIsDragging(true);
      event.preventDefault();

      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // The HUD remains usable if pointer capture is unavailable.
      }
    },
    [clampPosition],
  );

  const moveWhileDragging = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;

      if (
        !drag ||
        drag.pointerId !== event.pointerId
      ) {
        return;
      }

      const next = clampPosition(
        drag.startX + event.clientX - drag.pointerX,
        drag.startY + event.clientY - drag.pointerY,
      );

      positionRef.current = next;
      setPosition(next);
    },
    [clampPosition],
  );

  const finishDragging = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;

      if (
        !drag ||
        drag.pointerId !== event.pointerId
      ) {
        return;
      }

      dragRef.current = null;
      setIsDragging(false);

      const finalPosition = positionRef.current;

      if (finalPosition) {
        try {
          window.sessionStorage.setItem(
            POSITION_STORAGE_KEY,
            JSON.stringify(finalPosition),
          );
        } catch {
          // Remembering the position is best-effort.
        }
      }

      try {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      } catch {
        // Pointer capture may already have been released.
      }
    },
    [],
  );

  const startSampling = useCallback(() => {
    if (getAgorePerformanceSessionState().active) {
      setSession(getAgorePerformanceSessionState());
      setExpanded(true);
      setNotice("");
      return;
    }

    const started = startAgorePerformanceSession();

    if (!started) {
      setNotice(
        "Live frame sampling is unavailable in this browser.",
      );
      setExpanded(true);
      return;
    }

    setNotice("");
    setDetailsExpanded(true);
    setExpanded(true);
    setSession(getAgorePerformanceSessionState());
  }, []);

  const stopSampling = useCallback(() => {
    stopAgorePerformanceSession();
    setSession(getAgorePerformanceSessionState());
    setNotice("Performance sampling stopped.");
  }, []);

  const closeHud = useCallback(() => {
    if (getAgorePerformanceSessionState().active) {
      stopAgorePerformanceSession();
    }

    setSession(getAgorePerformanceSessionState());
    setExpanded(false);
    setNotice("");
  }, []);

  const minimizeHud = useCallback(() => {
    // Minimize the entire HUD, but preserve the active session.
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

  const floatingStyle = position
    ? {
        left: position.x,
        top: position.y,
        right: "auto" as const,
        bottom: "auto" as const,
      }
    : undefined;

  if (!expanded) {
    return (
      <div
        ref={hudRef}
        style={floatingStyle}
        className={`fixed z-[80] ${
          position
            ? ""
            : "bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] right-3 lg:bottom-5 lg:right-5"
        }`}
      >
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
          title="Open the HUD, then drag its header to move it"
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
      ref={hudRef}
      style={floatingStyle}
      aria-label="Agoré Live Performance HUD"
      className={`fixed z-[80] w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] shadow-2xl ${
        position
          ? ""
          : "bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] right-3 lg:bottom-5 lg:right-5"
      }`}
    >
      <header
        onPointerDown={startDragging}
        onPointerMove={moveWhileDragging}
        onPointerUp={finishDragging}
        onPointerCancel={finishDragging}
        className={`flex items-center justify-between gap-2 border-b border-[var(--border)] p-3.5 ${
          isDragging
            ? "cursor-grabbing"
            : "cursor-grab"
        }`}
        style={{ touchAction: "none" }}
        title="Drag to move the Live Performance HUD"
      >
        <div className="flex min-w-0 items-center gap-2">
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

          <GripVertical
            size={17}
            aria-hidden="true"
            className="ml-0.5 shrink-0 text-[var(--muted)]"
          />
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() =>
              setDetailsExpanded((current) => !current)
            }
            aria-expanded={detailsExpanded}
            aria-label={
              detailsExpanded
                ? "Collapse HUD details"
                : "Expand HUD details"
            }
            title={
              detailsExpanded
                ? "Collapse details"
                : "Expand details"
            }
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
          >
            {detailsExpanded ? (
              <ChevronUp size={18} />
            ) : (
              <ChevronDown size={18} />
            )}
          </button>

          <button
            type="button"
            onClick={minimizeHud}
            aria-label="Minimize HUD and continue sampling"
            title="Minimize entire HUD"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
          >
            <Minimize2 size={17} />
          </button>

          <button
            type="button"
            onClick={closeHud}
            aria-label="Stop sampling and minimize HUD"
            title="Stop and minimize"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      {detailsExpanded ? (
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
              Slow frames use a 16.7 ms reference threshold,
              not a measured device refresh rate.
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
              onClick={stopSampling}
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
      ) : (
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <p className="min-w-0 truncate text-xs text-[var(--muted)]">
            {active
              ? frameSample
                ? `${formatNumber(frameSample.observedFps)} FPS · Sampling continues`
                : "Sampling continues"
              : "Details collapsed"}
          </p>

          <button
            type="button"
            onClick={() => setDetailsExpanded(true)}
            className="shrink-0 text-xs font-semibold text-[var(--accent)]"
          >
            Show details
          </button>
        </div>
      )}

      <div className="flex items-center justify-center gap-1.5 border-t border-[var(--border)] px-3 py-2 text-[10px] text-[var(--muted)]">
        <GripVertical size={12} />
        Drag header to move
      </div>
    </aside>
  );
}