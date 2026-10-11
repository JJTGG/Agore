
"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleHelp,
  FileText,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  UserRound,
  Users,
  XCircle,
} from "lucide-react";

type AdminRole =
  | "founder"
  | "super_admin"
  | "platform_admin"
  | "moderator"
  | "analyst";

type AdminTab = "overview" | "reports" | "users";

type Overview = {
  totalAccounts: number;
  activeAccounts: number;
  disabledAccounts: number;
  visiblePosts: number;
  pendingReports: number;
  openSupportCases: number;
};

type Identity = {
  id: string;
  display_name: string;
  username: string;
  account_status: string;
};

type AdminReport = {
  id: string;
  reporter_id: string;
  target_type: string;
  target_id: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  reporter: Identity | null;
  target: {
    id: string;
    type: string;
    label: string;
    excerpt: string;
    actorId: string | null;
    deleted: boolean;
    accountStatus: string | null;
    actor: Identity | null;
  } | null;
};

type AdminUser = {
  id: string;
  display_name: string;
  username: string;
  account_type: string;
  account_status: "active" | "disabled" | "deleted";
  created_at: string;
};

type ApiPayload = {
  error?: string;
  message?: string;
  role?: AdminRole;
  overview?: Overview;
  reports?: AdminReport[];
  users?: AdminUser[];
};

const roleLabels: Record<AdminRole, string> = {
  founder: "Founder",
  super_admin: "Super Admin",
  platform_admin: "Platform Admin",
  moderator: "Moderator",
  analyst: "Analyst",
};

const reportFilters = [
  { value: "pending", label: "Pending" },
  { value: "reviewed", label: "Reviewed" },
  { value: "actioned", label: "Actioned" },
  { value: "dismissed", label: "Dismissed" },
  { value: "all", label: "All reports" },
];

const userFilters = [
  { value: "all", label: "All accounts" },
  { value: "active", label: "Active" },
  { value: "disabled", label: "Disabled" },
  { value: "deleted", label: "Deleted" },
];

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function isFullAdmin(role: AdminRole | null) {
  return (
    role === "founder" ||
    role === "super_admin" ||
    role === "platform_admin"
  );
}

function canModerate(role: AdminRole | null) {
  return isFullAdmin(role) || role === "moderator";
}

function statusClasses(status: string) {
  if (status === "active" || status === "reviewed") {
    return "border-[var(--success)]/30 bg-[var(--success-soft)] text-[var(--success)]";
  }

  if (status === "disabled" || status === "dismissed") {
    return "border-[var(--danger)]/30 bg-[var(--danger-soft)] text-[var(--danger)]";
  }

  if (status === "actioned") {
    return "border-[var(--accent)]/30 bg-[var(--accent-soft)] text-[var(--accent)]";
  }

  return "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--muted)]";
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses(status)}`}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

function ErrorMessage({ children }: { children: string }) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]"
    >
      {children}
    </div>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--border)] px-5 py-12 text-center">
      <CheckCircle2
        size={25}
        className="mx-auto text-[var(--muted)]"
      />
      <h3 className="mt-3 font-semibold">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-[var(--muted)]">
        {description}
      </p>
    </div>
  );
}

export default function AdminPage() {
  const [tab, setTab] = useState<AdminTab>("overview");
  const [role, setRole] = useState<AdminRole | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [reportStatus, setReportStatus] = useState("pending");
  const [userStatus, setUserStatus] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyAction, setBusyAction] = useState("");

  const loadView = useCallback(
    async (view: AdminTab) => {
      setLoading(true);
      setError("");
      setDenied(false);

      try {
        const params = new URLSearchParams({ view });

        if (view === "reports") {
          params.set("status", reportStatus);
        }

        if (view === "users") {
          params.set("status", userStatus);
          if (userQuery) params.set("q", userQuery);
        }

        const response = await fetch(`/api/admin?${params}`, {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
        });

        const payload = (await response
          .json()
          .catch(() => ({}))) as ApiPayload;

        if (response.status === 401) {
          window.location.assign("/auth");
          return;
        }

        if (!response.ok) {
          if (response.status === 403) setDenied(true);
          throw new Error(
            payload.error ?? "Unable to load this administration view.",
          );
        }

        if (payload.role) setRole(payload.role);

        if (view === "overview" && payload.overview) {
          setOverview(payload.overview);
        }

        if (view === "reports") {
          setReports(payload.reports ?? []);
        }

        if (view === "users") {
          setUsers(payload.users ?? []);
        }
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "An unexpected error occurred.",
        );
      } finally {
        setLoading(false);
      }
    },
    [reportStatus, userStatus, userQuery],
  );

  useEffect(() => {
    void loadView(tab);
  }, [tab, loadView]);

  async function submitAction(
    body: Record<string, unknown>,
    busyKey: string,
    successMessage: string,
    refreshTab: AdminTab,
  ) {
    setBusyAction(busyKey);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/admin", {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const payload = (await response
        .json()
        .catch(() => ({}))) as ApiPayload;

      if (response.status === 401) {
        window.location.assign("/auth");
        return;
      }

      if (!response.ok) {
        throw new Error(
          payload.error ?? "The administrative action failed.",
        );
      }

      setNotice(payload.message ?? successMessage);
      await loadView(refreshTab);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "The administrative action failed.",
      );
    } finally {
      setBusyAction("");
    }
  }

  function handleUserSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUserQuery(searchInput.trim().slice(0, 60));
  }

  function actOnReport(report: AdminReport, action: string) {
    if (
      action === "dismiss" &&
      !window.confirm("Dismiss this report? No content or account will be changed.")
    ) {
      return;
    }

    if (
      action === "remove_content" &&
      !window.confirm("Remove the reported content? This is a moderation action.")
    ) {
      return;
    }

    if (
      action === "disable_account" &&
      !window.confirm("Disable the reported account? The user will lose active account access.")
    ) {
      return;
    }

    void submitAction(
      {
        type: "report",
        reportId: report.id,
        action,
      },
      `${report.id}:${action}`,
      "Report action completed.",
      "reports",
    );
  }

  function changeUserStatus(user: AdminUser) {
    const nextStatus = user.account_status === "active"
      ? "disabled"
      : "active";

    if (
      !window.confirm(
        `${nextStatus === "disabled" ? "Disable" : "Reactivate"} @${user.username}?`,
      )
    ) {
      return;
    }

    void submitAction(
      {
        type: "user_status",
        userId: user.id,
        status: nextStatus,
        note: "Changed from the Agoré Admin V0 user directory.",
      },
      `${user.id}:${nextStatus}`,
      "Account status updated.",
      "users",
    );
  }

  const tabs: { value: AdminTab; label: string }[] = [
    { value: "overview", label: "Overview" },
    { value: "reports", label: "Reports & moderation" },
    ...(isFullAdmin(role)
      ? [{ value: "users" as const, label: "Users" }]
      : []),
  ];

  if (denied && !role) {
    return (
      <main className="min-h-dvh bg-[var(--background)] px-4 py-12 text-[var(--foreground)]">
        <section className="mx-auto max-w-xl rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8">
          <Shield size={28} className="text-[var(--muted)]" />
          <h1 className="mt-4 text-2xl font-semibold">
            Administration access required
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            This area is available only to authorized Agoré staff. Access is
            verified on the server.
          </p>
          <Link
            href="/home"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white"
          >
            <ArrowLeft size={16} />
            Return to Agoré
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto w-full max-w-7xl px-4 pb-12 pt-5 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] pb-5">
          <div className="flex items-center gap-3">
            <Link
              href="/home"
              aria-label="Return to Agoré"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] transition hover:bg-[var(--surface-muted)]"
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck size={20} className="text-[var(--accent)]" />
                <h1 className="text-xl font-semibold tracking-tight">
                  Agoré Administration
                </h1>
              </div>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Platform operations · Admin V0
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {role ? (
              <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold">
                {roleLabels[role]}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => void loadView(tab)}
              disabled={loading}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] disabled:opacity-50"
              aria-label="Refresh current view"
              title="Refresh"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </header>

        <nav
          aria-label="Admin sections"
          className="flex gap-2 overflow-x-auto border-b border-[var(--border)] py-3"
        >
          {tabs.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setTab(item.value)}
              aria-current={tab === item.value ? "page" : undefined}
              className={[
                "shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold transition",
                tab === item.value
                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]",
              ].join(" ")}
            >
              {item.label}
            </button>
          ))}
          <Link
            href="/staff/support"
            className="ml-auto flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
          >
            <CircleHelp size={16} />
            Support panel
          </Link>
        </nav>

        {error ? (
          <div className="mt-5">
            <ErrorMessage>{error}</ErrorMessage>
          </div>
        ) : null}

        {notice ? (
          <div className="mt-5 rounded-2xl border border-[var(--success)]/25 bg-[var(--success-soft)] px-4 py-3 text-sm text-[var(--success)]">
            {notice}
          </div>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-3 py-16 text-sm text-[var(--muted)]">
            <RefreshCw size={18} className="animate-spin" />
            Loading administration data…
          </div>
        ) : null}

        {!loading && tab === "overview" && overview ? (
          <section className="mt-6">
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
                Platform overview
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                At a glance
              </h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                Current platform counts and the operational queues that need attention.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[
                {
                  label: "Total accounts",
                  value: overview.totalAccounts,
                  icon: Users,
                  description: "Profiles created on Agoré",
                },
                {
                  label: "Active accounts",
                  value: overview.activeAccounts,
                  icon: UserRound,
                  description: "Accounts currently active",
                },
                {
                  label: "Disabled accounts",
                  value: overview.disabledAccounts,
                  icon: XCircle,
                  description: "Accounts with access disabled",
                },
                {
                  label: "Visible posts",
                  value: overview.visiblePosts,
                  icon: FileText,
                  description: "Posts not soft-deleted",
                },
                {
                  label: "Pending reports",
                  value: overview.pendingReports,
                  icon: AlertTriangle,
                  description: "Reports awaiting review",
                },
                {
                  label: "Open support cases",
                  value: overview.openSupportCases,
                  icon: Activity,
                  description: "Cases still being handled",
                },
              ].map((card) => {
                const Icon = card.icon;

                return (
                  <div
                    key={card.label}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm text-[var(--muted)]">
                          {card.label}
                        </p>
                        <p className="mt-3 text-3xl font-semibold tabular-nums">
                          {card.value.toLocaleString("en-NG")}
                        </p>
                      </div>
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--surface-muted)] text-[var(--muted-strong)]">
                        <Icon size={19} />
                      </span>
                    </div>
                    <p className="mt-3 text-xs text-[var(--muted)]">
                      {card.description}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setTab("reports")}
                className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-left transition hover:border-[var(--accent)]"
              >
                <span>
                  <span className="block font-semibold">Review reports</span>
                  <span className="mt-1 block text-sm text-[var(--muted)]">
                    Open the moderation queue.
                  </span>
                </span>
                <AlertTriangle size={20} className="text-[var(--accent)]" />
              </button>
              {isFullAdmin(role) ? (
                <button
                  type="button"
                  onClick={() => setTab("users")}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-left transition hover:border-[var(--accent)]"
                >
                  <span>
                    <span className="block font-semibold">Manage accounts</span>
                    <span className="mt-1 block text-sm text-[var(--muted)]">
                      Search users and review account status.
                    </span>
                  </span>
                  <Users size={20} className="text-[var(--accent)]" />
                </button>
              ) : null}
            </div>
          </section>
        ) : null}

        {!loading && tab === "reports" ? (
          <section className="mt-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
                  Trust and safety
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                  Reports & moderation
                </h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  Review reported profiles, posts, comments, messages and groups.
                </p>
              </div>
              <label className="text-sm">
                <span className="mb-1.5 block text-xs font-medium text-[var(--muted)]">
                  Report status
                </span>
                <select
                  value={reportStatus}
                  onChange={(event) => setReportStatus(event.target.value)}
                  className="min-w-40 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5"
                >
                  {reportFilters.map((filter) => (
                    <option key={filter.value} value={filter.value}>
                      {filter.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-5 space-y-3">
              {reports.length === 0 ? (
                <EmptyState
                  title="No reports in this view"
                  description="There are no reports matching the selected status."
                />
              ) : (
                reports.map((report) => {
                  const busy = busyAction.startsWith(`${report.id}:`);
                  const resolved = ["actioned", "dismissed"].includes(report.status);
                  const target = report.target;

                  return (
                    <article
                      key={report.id}
                      className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold capitalize">
                              {report.target_type} report
                            </span>
                            <StatusPill status={report.status} />
                          </div>
                          <p className="mt-1 text-xs text-[var(--muted)]">
                            Submitted {formatDate(report.created_at)}
                          </p>
                        </div>
                        <span className="text-xs text-[var(--muted)]">
                          ID {report.id.slice(0, 8)}
                        </span>
                      </div>

                      <div className="mt-4 rounded-xl bg-[var(--surface-muted)] p-3.5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                          Reason
                        </p>
                        <p className="mt-1 text-sm font-semibold">
                          {report.reason}
                        </p>
                        {report.details ? (
                          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">
                            {report.details}
                          </p>
                        ) : null}
                      </div>

                      <div className="mt-3 rounded-xl border border-[var(--border)] p-3.5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                          Reported target
                        </p>
                        <p className="mt-1 break-words font-semibold">
                          {target?.label ?? "Target not available"}
                        </p>
                        {target?.actor ? (
                          <p className="mt-1 text-xs text-[var(--muted)]">
                            By {target.actor.display_name} (@{target.actor.username})
                          </p>
                        ) : null}
                        {target?.excerpt ? (
                          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">
                            {target.excerpt}
                          </p>
                        ) : null}
                        {target ? (
                          <p className="mt-2 text-xs text-[var(--muted)]">
                            Target ID {target.id.slice(0, 8)}
                            {target.deleted ? " · Already removed" : ""}
                            {target.accountStatus ? ` · Account ${target.accountStatus}` : ""}
                          </p>
                        ) : null}
                      </div>

                      <p className="mt-3 text-xs text-[var(--muted)]">
                        Reported by{" "}
                        {report.reporter
                          ? `${report.reporter.display_name} (@${report.reporter.username})`
                          : "unavailable account"}
                      </p>

                      {!resolved && canModerate(role) ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => actOnReport(report, "review")}
                            className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-semibold transition hover:bg-[var(--surface-muted)] disabled:opacity-50"
                          >
                            Mark reviewed
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => actOnReport(report, "dismiss")}
                            className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-semibold transition hover:bg-[var(--surface-muted)] disabled:opacity-50"
                          >
                            Dismiss
                          </button>

                          {target?.type === "profile" &&
                          target.accountStatus === "active" &&
                          isFullAdmin(role) ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => actOnReport(report, "disable_account")}
                              className="rounded-xl border border-[var(--danger)]/30 px-3 py-2 text-sm font-semibold text-[var(--danger)] transition hover:bg-[var(--danger-soft)] disabled:opacity-50"
                            >
                              Disable account
                            </button>
                          ) : null}

                          {["post", "comment", "message"].includes(target?.type ?? "") &&
                          !target?.deleted ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => actOnReport(report, "remove_content")}
                              className="rounded-xl bg-[var(--danger)] px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                            >
                              Remove content
                            </button>
                          ) : null}
                        </div>
                      ) : null}

                      {busy ? (
                        <p className="mt-3 text-xs text-[var(--muted)]">
                          Processing action…
                        </p>
                      ) : null}
                    </article>
                  );
                })
              )}
            </div>
          </section>
        ) : null}

        {!loading && tab === "users" && isFullAdmin(role) ? (
          <section className="mt-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
                Account operations
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                User management
              </h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                Search accounts and manage active or disabled status. Administrative
                accounts are protected from changes in this directory.
              </p>
            </div>

            <form
              onSubmit={handleUserSearch}
              className="mt-5 flex flex-col gap-3 sm:flex-row"
            >
              <label className="min-w-0 flex-1">
                <span className="mb-1.5 block text-xs font-medium text-[var(--muted)]">
                  Search username or display name
                </span>
                <span className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3">
                  <Search size={17} className="shrink-0 text-[var(--muted)]" />
                  <input
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    maxLength={60}
                    placeholder="Search accounts…"
                    className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none"
                  />
                </span>
              </label>

              <label>
                <span className="mb-1.5 block text-xs font-medium text-[var(--muted)]">
                  Account status
                </span>
                <select
                  value={userStatus}
                  onChange={(event) => setUserStatus(event.target.value)}
                  className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm sm:w-auto"
                >
                  {userFilters.map((filter) => (
                    <option key={filter.value} value={filter.value}>
                      {filter.label}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="submit"
                className="h-11 self-end rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white"
              >
                Search
              </button>
            </form>

            <div className="mt-4 space-y-2">
              {users.length === 0 ? (
                <EmptyState
                  title="No matching accounts"
                  description="Try a different search term or account-status filter."
                />
              ) : (
                users.map((account) => {
                  const busy = busyAction.startsWith(`${account.id}:`);
                  const changeable = account.account_status !== "deleted";

                  return (
                    <article
                      key={account.id}
                      className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold">
                          {account.display_name}
                        </p>
                        <p className="mt-1 truncate text-sm text-[var(--muted)]">
                          @{account.username} · {account.account_type}
                        </p>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          Joined {formatDate(account.created_at)}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <StatusPill status={account.account_status} />
                        {changeable ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => changeUserStatus(account)}
                            className={[
                              "rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-50",
                              account.account_status === "active"
                                ? "border-[var(--danger)]/30 text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                                : "border-[var(--success)]/30 text-[var(--success)] hover:bg-[var(--success-soft)]",
                            ].join(" ")}
                          >
                            {account.account_status === "active"
                              ? "Disable"
                              : "Reactivate"}
                          </button>
                        ) : null}
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
