"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Clock3,
  PhoneIncoming,
  PhoneMissed,
  PhoneOff,
  PhoneOutgoing,
  RefreshCw,
} from "lucide-react";

import AgoreAvatar from "@/components/agore-avatar";

type CallStatus =
  | "ringing"
  | "accepted"
  | "completed"
  | "declined"
  | "missed"
  | "cancelled"
  | "failed";

type CallDirection = "incoming" | "outgoing";

type CallHistoryEntry = {
  id: string;
  conversation_id: string;
  caller_id: string;
  callee_id: string;
  status: CallStatus;
  direction: CallDirection;
  created_at: string;
  answered_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  ended_by: string | null;
  failure_reason: string | null;
  peer: {
    id: string;
    display_name: string;
    username: string;
    avatar_path: string | null;
  } | null;
};

type Filter = "all" | "missed" | "incoming" | "outgoing";

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDuration(seconds: number | null) {
  if (seconds === null || seconds < 0) {
    return "";
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(
    remainingSeconds,
  ).padStart(2, "0")}`;
}

function getEffectiveStatus(call: CallHistoryEntry): CallStatus {
  if (call.status === "ringing") {
    const age = Date.now() - new Date(call.created_at).getTime();

    if (Number.isFinite(age) && age >= 60_000) {
      return "missed";
    }
  }

  return call.status;
}

function getCallLabel(call: CallHistoryEntry) {
  const status = getEffectiveStatus(call);

  switch (status) {
    case "ringing":
      return call.direction === "outgoing"
        ? "Calling"
        : "Incoming call";

    case "accepted":
      return "Call in progress";

    case "completed":
      return "Call ended";

    case "declined":
      return call.direction === "outgoing"
        ? "Call declined"
        : "You declined";

    case "missed":
      return call.direction === "outgoing"
        ? "No answer"
        : "Missed call";

    case "cancelled":
      return call.direction === "outgoing"
        ? "Call cancelled"
        : "Call cancelled";

    case "failed":
      return "Call failed";
  }
}

function getCallIcon(call: CallHistoryEntry) {
  const status = getEffectiveStatus(call);

  if (
    status === "missed" ||
    (status === "declined" && call.direction === "incoming")
  ) {
    return PhoneMissed;
  }

  if (status === "cancelled" || status === "failed") {
    return PhoneOff;
  }

  return call.direction === "outgoing"
    ? PhoneOutgoing
    : PhoneIncoming;
}

function isMissedCall(call: CallHistoryEntry) {
  const status = getEffectiveStatus(call);

  return (
    call.direction === "incoming" &&
    (status === "missed" || status === "declined")
  );
}

export default function CallHistoryPage() {
  const router = useRouter();

  const [calls, setCalls] = useState<CallHistoryEntry[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadHistory = useCallback(
    async (manual = false) => {
      if (manual) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      try {
        const response = await fetch("/api/calls?limit=100", {
          method: "GET",
          cache: "no-store",
          headers: {
            Accept: "application/json",
          },
        });

        if (response.status === 401) {
          router.push("/auth");
          return;
        }

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ?? "Unable to load your call history.",
          );
        }

        setCalls(
          Array.isArray(data.calls)
            ? (data.calls as CallHistoryEntry[])
            : [],
        );
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load your call history.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [router],
  );

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const filteredCalls = calls.filter((call) => {
    switch (filter) {
      case "missed":
        return isMissedCall(call);

      case "incoming":
        return call.direction === "incoming";

      case "outgoing":
        return call.direction === "outgoing";

      default:
        return true;
    }
  });

  const missedCount = calls.filter(isMissedCall).length;

  const filters: {
    id: Filter;
    label: string;
  }[] = [
    { id: "all", label: "All" },
    { id: "missed", label: "Missed" },
    { id: "incoming", label: "Incoming" },
    { id: "outgoing", label: "Outgoing" },
  ];

  return (
    <main className="mx-auto w-full max-w-3xl px-0 pb-10">
      <section className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)]">
        <header className="border-b border-[var(--border)] px-4 py-5 sm:px-6">
          <Link
            href="/messages"
            className="inline-flex min-h-9 items-center gap-2 rounded-full px-2 text-sm font-medium text-[var(--muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
          >
            <ArrowLeft size={16} />
            Messages
          </Link>

          <div className="mt-4 flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-[-0.04em]">
                Call history
              </h1>

              <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                Your incoming and outgoing audio calls.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadHistory(true)}
              disabled={loading || refreshing}
              aria-label="Refresh call history"
              title="Refresh call history"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)] disabled:cursor-wait disabled:opacity-50"
            >
              <RefreshCw
                size={17}
                className={refreshing ? "animate-spin" : ""}
              />
            </button>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {filters.map((item) => {
              const active = filter === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilter(item.id)}
                  aria-pressed={active}
                  className={[
                    "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition",
                    active
                      ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                      : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted-strong)] hover:bg-[var(--surface-muted)]",
                  ].join(" ")}
                >
                  {item.label}

                  {item.id === "missed" && missedCount > 0 ? (
                    <span
                      className={
                        active
                          ? "rounded-full bg-white/20 px-1.5 text-xs"
                          : "rounded-full bg-[var(--danger-soft)] px-1.5 text-xs text-[var(--danger)]"
                      }
                    >
                      {missedCount}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </header>

        {error ? (
          <div className="px-5 py-10 text-center sm:px-8">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--danger-soft)] text-[var(--danger)]">
              <PhoneOff size={21} />
            </div>

            <p className="mt-4 text-sm font-medium">{error}</p>

            <button
              type="button"
              onClick={() => void loadHistory(true)}
              className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-5 text-sm font-semibold text-white transition hover:opacity-90"
            >
              <RefreshCw size={15} />
              Try again
            </button>
          </div>
        ) : loading ? (
          <div className="space-y-1 p-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className="flex animate-pulse items-center gap-3 rounded-2xl p-3"
              >
                <div className="h-12 w-12 shrink-0 rounded-full bg-[var(--surface-muted)]" />

                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-4 w-36 rounded bg-[var(--surface-muted)]" />
                  <div className="h-3 w-48 max-w-full rounded bg-[var(--surface-muted)]" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredCalls.length === 0 ? (
          <div className="px-5 py-14 text-center sm:px-8">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <Clock3 size={24} />
            </div>

            <h2 className="mt-4 text-base font-semibold">
              {filter === "all"
                ? "No calls yet"
                : filter === "missed"
                  ? "No missed calls"
                  : filter === "incoming"
                    ? "No incoming calls"
                    : "No outgoing calls"}
            </h2>

            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--muted)]">
              {filter === "all"
                ? "Your audio call records will appear here when calls take place."
                : "There are no calls in this category yet."}
            </p>

            {filter !== "all" ? (
              <button
                type="button"
                onClick={() => setFilter("all")}
                className="mt-4 text-sm font-semibold text-[var(--accent)] hover:underline"
              >
                View all calls
              </button>
            ) : null}
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {filteredCalls.map((call) => {
              const Icon = getCallIcon(call);
              const missed = isMissedCall(call);
              const name =
                call.peer?.display_name ||
                (call.peer?.username
                  ? `@${call.peer.username}`
                  : "Agoré user");

              const duration = formatDuration(
                call.duration_seconds,
              );

              return (
                <Link
                  key={call.id}
                  href={`/messages/${encodeURIComponent(call.conversation_id)}`}
                  className="flex items-center gap-3 px-4 py-4 transition hover:bg-[var(--surface-muted)] sm:px-6"
                >
                  <AgoreAvatar
                    avatarPath={call.peer?.avatar_path ?? null}
                    name={name}
                    className="h-12 w-12 shrink-0"
                    textClassName="text-sm"
                  />

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {name}
                    </p>

                    {call.peer?.username ? (
                      <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                        @{call.peer.username}
                      </p>
                    ) : null}

                    <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
                      <Icon
                        size={14}
                        className={
                          missed
                            ? "shrink-0 text-[var(--danger)]"
                            : "shrink-0 text-[var(--muted)]"
                        }
                      />

                      <p
                        className={[
                          "truncate text-xs font-medium",
                          missed
                            ? "text-[var(--danger)]"
                            : "text-[var(--muted)]",
                        ].join(" ")}
                      >
                        {getCallLabel(call)}
                        {duration ? ` · ${duration}` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1.5 text-right">
                    <span className="text-xs text-[var(--muted)]">
                      {formatDate(call.created_at)}
                    </span>

                    <span className="text-xs text-[var(--muted)]">
                      {formatTime(call.created_at)}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {!loading && !error && calls.length > 0 ? (
          <footer className="border-t border-[var(--border)] px-4 py-3 sm:px-6">
            <p className="text-xs leading-5 text-[var(--muted)]">
              Showing up to {calls.length} recent calls. Call records
              are private to the people involved.
            </p>
          </footer>
        ) : null}
      </section>

      <p className="mt-4 px-2 text-xs leading-5 text-[var(--muted)]">
        Select a call to open its conversation and view the related chat.
      </p>
    </main>
  );
}