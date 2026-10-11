
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  CalendarDays,
  Eye,
  Globe,
  Loader2,
  MessageCircle,
  RefreshCw,
  Repeat2,
  ShieldCheck,
  Users,
  UserPlus,
} from "lucide-react";

type Summary = {
  days: number;
  from: string;
  to: string;
  generatedAt: string;
  totalAccounts: number;
  activeAccounts: number;
  disabledAccounts: number;
  visiblePosts: number;
  visibleComments: number;
  currentReactions: number;
  currentReposts: number;
  currentFollows: number;
  currentMessages: number;
  currentGroups: number;
  pageViews: number;
  visitors: number;
  sessions: number;
  returningVisitors: number;
  newAccounts: number;
  newPosts: number;
  newComments: number;
  newReactions: number;
  newReposts: number;
  newFollows: number;
  messagesSent: number;
  dau: number;
  wau: number;
  mau: number;
};

type DailyPoint = {
  date: string;
  pageViews: number;
  visitors: number;
  signups: number;
  posts: number;
  comments: number;
  reactions: number;
  reposts: number;
  follows: number;
  messages: number;
  groupsCreated: number;
};

type RankedItem = {
  label: string;
  value: number;
  detail?: string;
};

type Insights = {
  summary: Summary;
  daily: DailyPoint[];
  popularPages: Array<{
    path: string;
    pageViews: number;
    visitors: number;
  }>;
  trafficSources: Array<{
    source: string;
    visits: number;
  }>;
  devices: Array<{
    device: string;
    pageViews: number;
  }>;
  countries: Array<{
    country: string;
    pageViews: number;
    visitors: number;
  }>;
  role?: string;
  error?: string;
};

const numberFormat = new Intl.NumberFormat("en-NG");

function number(value: number) {
  return numberFormat.format(value ?? 0);
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function MetricCard({
  label,
  value,
  description,
  icon: Icon,
}: {
  label: string;
  value: number;
  description: string;
  icon: typeof Eye;
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">{label}</p>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <Icon size={17} />
        </span>
      </div>
      <p className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
        {number(value)}
      </p>
      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
        {description}
      </p>
    </section>
  );
}

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
      <div className="mb-5">
        <h2 className="font-semibold tracking-tight">{title}</h2>
        {description ? (
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function RankedList({
  rows,
  emptyMessage,
}: {
  rows: RankedItem[];
  emptyMessage: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--border)] px-3 py-6 text-center text-sm text-[var(--muted)]">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {rows.map((row) => (
        <div key={row.label} className="min-w-0">
          <div className="flex items-start justify-between gap-3 text-sm">
            <span className="min-w-0 break-all font-medium">
              {row.label}
            </span>
            <span className="shrink-0 tabular-nums text-[var(--muted)]">
              {number(row.value)}
            </span>
          </div>
          {row.detail ? (
            <p className="mt-1 text-xs text-[var(--muted)]">
              {row.detail}
            </p>
          ) : null}
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
            <div
              className="h-full rounded-full bg-[var(--accent)]"
              style={{
                width: `${Math.max(2, (row.value / max) * 100)}%`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AgoreInsightsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);

  const loadInsights = useCallback(
    async (manual = false) => {
      if (manual) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");
      setDenied(false);

      try {
        const response = await fetch(
          `/api/admin/insights?days=${days}`,
          {
            method: "GET",
            cache: "no-store",
            credentials: "same-origin",
          },
        );

        const payload = (await response
          .json()
          .catch(() => ({}))) as Insights;

        if (response.status === 401) {
          window.location.assign("/auth");
          return;
        }

        if (!response.ok) {
          if (response.status === 403) {
            setDenied(true);
          }

          throw new Error(
            payload.error ?? "Unable to load Agoré Insights.",
          );
        }

        if (!payload.summary || !Array.isArray(payload.daily)) {
          throw new Error("The analytics response was invalid.");
        }

        setData(payload);
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to load Agoré Insights.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [days],
  );

  useEffect(() => {
    void loadInsights();
  }, [loadInsights]);

  const summary = data?.summary;
  const maxViews = Math.max(
    1,
    ...(data?.daily ?? []).map((point) => point.pageViews),
  );

  const dailyActivity: RankedItem[] = summary
    ? [
        { label: "Posts created", value: summary.newPosts },
        { label: "Comments created", value: summary.newComments },
        { label: "Reactions added or changed", value: summary.newReactions },
        { label: "Reposts created", value: summary.newReposts },
        { label: "New follows", value: summary.newFollows },
        { label: "Messages sent", value: summary.messagesSent },
      ]
    : [];

  const currentTotals: RankedItem[] = summary
    ? [
        { label: "Registered accounts", value: summary.totalAccounts },
        { label: "Active accounts", value: summary.activeAccounts },
        { label: "Disabled accounts", value: summary.disabledAccounts },
        { label: "Visible posts", value: summary.visiblePosts },
        { label: "Visible comments", value: summary.visibleComments },
        { label: "Current reactions", value: summary.currentReactions },
        { label: "Current reposts", value: summary.currentReposts },
        { label: "Current follows", value: summary.currentFollows },
        { label: "Messages stored", value: summary.currentMessages },
        { label: "Group conversations", value: summary.currentGroups },
      ]
    : [];

  return (
    <main className="min-w-0 space-y-6 pb-12 text-[var(--foreground)]">
      <header className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 text-xs font-medium text-[var(--muted)] transition hover:text-[var(--accent)]"
            >
              <ArrowLeft size={14} />
              Administration
            </Link>

            <div className="mt-5 flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                <Activity size={21} />
              </span>

              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
                  Platform intelligence
                </p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                  Agoré Insights
                </h1>
                <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">
                  Traffic, growth, engagement and platform activity in one
                  private dashboard.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex h-10 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--background)] px-3">
              <CalendarDays size={15} className="text-[var(--muted)]" />
              <select
                value={days}
                onChange={(event) => setDays(Number(event.target.value))}
                className="min-w-0 bg-transparent text-sm outline-none"
                aria-label="Reporting period"
              >
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
              </select>
            </label>

            <button
              type="button"
              onClick={() => void loadInsights(true)}
              disabled={loading || refreshing}
              className="flex h-10 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-sm font-semibold transition hover:border-[var(--accent)] disabled:opacity-60"
            >
              <RefreshCw
                size={15}
                className={refreshing ? "animate-spin" : ""}
              />
              Refresh
            </button>
          </div>
        </div>

        {summary ? (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-4 text-xs text-[var(--muted)]">
            <span>
              {formatDate(summary.from)} – {formatDate(summary.to)}
            </span>
            <span>Updated {formatDateTime(summary.generatedAt)}</span>
          </div>
        ) : null}
      </header>

      {error ? (
        <section
          role="alert"
          className="rounded-2xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)]"
        >
          <p className="font-semibold">
            {denied ? "Access denied" : "Analytics unavailable"}
          </p>
          <p className="mt-1">{error}</p>
        </section>
      ) : null}

      {loading && !data ? (
        <section className="flex min-h-48 items-center justify-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--muted)]">
          <Loader2 size={18} className="animate-spin" />
          Loading platform metrics…
        </section>
      ) : null}

      {summary ? (
        <>
          <section>
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h2 className="font-semibold">Traffic &amp; growth</h2>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  For the selected reporting period
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <MetricCard
                label="Page views"
                value={summary.pageViews}
                description="Pages opened"
                icon={Eye}
              />
              <MetricCard
                label="Unique visitors"
                value={summary.visitors}
                description={`${number(summary.returningVisitors)} returning visitors`}
                icon={Users}
              />
              <MetricCard
                label="Visits / sessions"
                value={summary.sessions}
                description="Distinct browser sessions"
                icon={Activity}
              />
              <MetricCard
                label="New accounts"
                value={summary.newAccounts}
                description="Registrations in this period"
                icon={UserPlus}
              />
            </div>
          </section>

          <section>
            <h2 className="mb-3 font-semibold">Active users</h2>
            <div className="grid grid-cols-3 gap-3">
              <MetricCard
                label="DAU"
                value={summary.dau}
                description="Last 24 hours"
                icon={Activity}
              />
              <MetricCard
                label="WAU"
                value={summary.wau}
                description="Last 7 days"
                icon={Users}
              />
              <MetricCard
                label="MAU"
                value={summary.mau}
                description="Last 30 days"
                icon={Users}
              />
            </div>
          </section>

          <Panel
            title="Traffic over time"
            description="Daily page views. Page-view tracking starts with this release; earlier visits cannot be reconstructed."
          >
            {summary.pageViews === 0 ? (
              <div className="flex min-h-44 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] px-5 text-center">
                <Eye size={23} className="text-[var(--muted)]" />
                <p className="mt-3 text-sm font-semibold">
                  Waiting for page-view data
                </p>
                <p className="mt-1 max-w-md text-xs leading-5 text-[var(--muted)]">
                  The tracker will begin recording visits after its code is
                  deployed. Existing sign-ups and database activity are
                  already available below.
                </p>
              </div>
            ) : (
              <div>
                <div
                  className="grid h-40 items-end gap-1 border-b border-[var(--border)] pb-1"
                  style={{
                    gridTemplateColumns: `repeat(${data.daily.length}, minmax(0, 1fr))`,
                  }}
                >
                  {data.daily.map((point) => {
                    const height =
                      point.pageViews === 0
                        ? 0
                        : Math.max(
                            3,
                            Math.round((point.pageViews / maxViews) * 132),
                          );

                    return (
                      <div
                        key={point.date}
                        className="flex h-full min-w-0 items-end"
                        title={`${formatDate(point.date)}: ${number(point.pageViews)} page views, ${number(point.visitors)} visitors`}
                      >
                        <div
                          className="w-full rounded-t-sm bg-[var(--accent)]"
                          style={{ height: `${height}px` }}
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="mt-2 flex justify-between gap-2 text-[10px] text-[var(--muted)]">
                  <span>{formatDate(data.daily[0]?.date ?? summary.from)}</span>
                  <span>{formatDate(data.daily[data.daily.length - 1]?.date ?? summary.to)}</span>
                </div>
              </div>
            )}
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel
              title="Popular pages"
              description="Ranked by page views, with unique visitors per path"
            >
              <RankedList
                rows={data?.popularPages.map((row) => ({
                  label: row.path,
                  value: row.pageViews,
                  detail: `${number(row.visitors)} unique visitors`,
                })) ?? []}
                emptyMessage="Page popularity will appear after tracking starts."
              />
            </Panel>

            <Panel
              title="Traffic sources"
              description="Sessions grouped by referring hostname"
            >
              <RankedList
                rows={data?.trafficSources.map((row) => ({
                  label:
                    row.source === "direct"
                      ? "Direct / none"
                      : row.source,
                  value: row.visits,
                  detail: "Sessions",
                })) ?? []}
                emptyMessage="Referral data will appear after tracking starts."
              />
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel
              title="Engagement"
              description="Recorded product activity for the selected period"
            >
              <RankedList
                rows={dailyActivity}
                emptyMessage="No activity metrics are available."
              />
            </Panel>

            <Panel
              title="Current platform"
              description="Current database totals, not just the selected period"
            >
              <RankedList
                rows={currentTotals}
                emptyMessage="No platform totals are available."
              />
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Devices" description="Page views by device category">
              <RankedList
                rows={data?.devices.map((row) => ({
                  label: row.device,
                  value: row.pageViews,
                })) ?? []}
                emptyMessage="Device breakdown will appear after tracking starts."
              />
            </Panel>

            <Panel title="Countries" description="Country-level traffic when available">
              <RankedList
                rows={data?.countries.map((row) => ({
                  label: row.country,
                  value: row.pageViews,
                  detail: `${number(row.visitors)} visitors`,
                })) ?? []}
                emptyMessage="Country data will appear when available."
              />
            </Panel>
          </div>

          <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <ShieldCheck
                size={19}
                className="mt-0.5 shrink-0 text-[var(--accent)]"
              />
              <div>
                <h2 className="text-sm font-semibold">
                  Privacy and metric definitions
                </h2>
                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                  Analytics records normalized page paths, random first-party
                  visitor and session IDs, referrer hostnames, broad device
                  categories, and country codes when available. Raw IP
                  addresses, full query strings and message contents are not
                  stored by this tracker. Page-view records are cleaned up
                  after 180 days. Active users count distinct signed-in
                  accounts with a page view or meaningful product event.
                </p>
                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                  Product-event history is available from the existing
                  database event log; anonymous visit history starts when this
                  page tracker is deployed.
                </p>
              </div>
            </div>
          </section>
        </>
      ) : null}

      <p className="text-center text-xs text-[var(--muted)]">
        <Globe size={13} className="mr-1 inline-block" />
        Agoré Insights · Private platform analytics
      </p>
    </main>
  );
}
