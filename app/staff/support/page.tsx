"use client";

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Inbox,
  LifeBuoy,
  LoaderCircle,
  MessageSquareText,
  RefreshCw,
  Send,
  ShieldCheck,
  StickyNote,
  UserRound,
  UserCheck,
} from "lucide-react";
import Link from "next/link";

type SupportStatus =
  | "open"
  | "in_progress"
  | "waiting_on_user"
  | "resolved"
  | "closed";

type SupportCategory =
  | "account_access"
  | "technical_issue"
  | "bug_report"
  | "safety"
  | "privacy"
  | "feedback"
  | "other";

type SupportPriority =
  | "low"
  | "normal"
  | "high"
  | "urgent";

type StaffRole =
  | "founder"
  | "super_admin"
  | "platform_admin"
  | "support_staff";

type AssignmentFilter =
  | "all"
  | "mine"
  | "unassigned";

type StatusFilter =
  | "active"
  | "all"
  | SupportStatus;

type ProfileSummary = {
  id: string;
  username: string;
  display_name: string;
  avatar_path: string | null;
};

type SupportCase = {
  id: string;
  category: SupportCategory;
  subject: string;
  status: SupportStatus;
  priority: SupportPriority;
  assigned_to: string | null;
  related_report_id: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string;
  resolved_at: string | null;
  closed_at: string | null;
  requester: ProfileSummary | null;
  assignee: ProfileSummary | null;
};

type SupportCaseDetail = SupportCase & {
  description: string;
};

type SupportMessage = {
  id: string;
  body: string;
  visibility: "customer" | "internal";
  created_at: string;
  sender: ProfileSummary | null;
};

type QueueCursor = {
  beforeLastMessageAt: string;
  beforeId: string;
};

type MessageCursor = {
  beforeCreatedAt: string;
  beforeId: string;
};

type StaffMember = {
  userId: string;
  username: string;
  displayName: string;
  avatarPath: string | null;
  role: StaffRole;
};

type ApiError = {
  error?: string;
};

const STATUSES: {
  value: SupportStatus;
  label: string;
}[] = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  {
    value: "waiting_on_user",
    label: "Waiting on user",
  },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

const PRIORITIES: {
  value: SupportPriority;
  label: string;
}[] = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const CATEGORIES: {
  value: SupportCategory;
  label: string;
}[] = [
  {
    value: "account_access",
    label: "Account access",
  },
  {
    value: "technical_issue",
    label: "Technical issue",
  },
  { value: "bug_report", label: "Bug report" },
  { value: "safety", label: "Safety" },
  { value: "privacy", label: "Privacy" },
  { value: "feedback", label: "Feedback" },
  { value: "other", label: "Other" },
];

const STATUS_FILTERS: {
  value: StatusFilter;
  label: string;
}[] = [
  { value: "active", label: "Active cases" },
  { value: "all", label: "All statuses" },
  ...STATUSES,
];

const CATEGORY_LABELS = Object.fromEntries(
  CATEGORIES.map((item) => [
    item.value,
    item.label,
  ]),
) as Record<SupportCategory, string>;

const STATUS_LABELS = Object.fromEntries(
  STATUSES.map((item) => [
    item.value,
    item.label,
  ]),
) as Record<SupportStatus, string>;

const PRIORITY_LABELS = Object.fromEntries(
  PRIORITIES.map((item) => [
    item.value,
    item.label,
  ]),
) as Record<SupportPriority, string>;

const ROLE_LABELS: Record<StaffRole, string> = {
  founder: "Founder",
  super_admin: "Super Admin",
  platform_admin: "Platform Admin",
  support_staff: "Support Staff",
};

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

function statusStyle(status: SupportStatus) {
  if (status === "resolved") {
    return "border-[var(--success)]/30 bg-[var(--success-soft)] text-[var(--success)]";
  }

  if (status === "closed") {
    return "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--muted)]";
  }

  if (status === "waiting_on_user") {
    return "border-[var(--accent)]/30 bg-[var(--accent-soft)] text-[var(--accent)]";
  }

  return "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]";
}

function priorityStyle(priority: SupportPriority) {
  if (priority === "urgent" || priority === "high") {
    return "border-[var(--danger)]/30 bg-[var(--danger-soft)] text-[var(--danger)]";
  }

  return "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--muted-strong)]";
}

function StatusPill({
  status,
}: {
  status: SupportStatus;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusStyle(status)}`}
    >
      {status === "resolved" ? (
        <CheckCircle2 size={12} />
      ) : (
        <Clock3 size={12} />
      )}

      {STATUS_LABELS[status]}
    </span>
  );
}

function PriorityPill({
  priority,
}: {
  priority: SupportPriority;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${priorityStyle(priority)}`}
    >
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

function ProfileIdentity({
  profile,
  fallback,
}: {
  profile: ProfileSummary | null;
  fallback: string;
}) {
  const name =
    profile?.display_name ||
    profile?.username ||
    fallback;

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface-muted)] text-xs font-semibold text-[var(--muted-strong)]">
        {profile?.avatar_path ? (
          // Avatar path is displayed as text-free profile metadata;
          // use the shared avatar resolver through the API in a later UI pass.
          <UserRound size={16} />
        ) : (
          initials(name)
        )}
      </span>

      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">
          {name}
        </span>

        {profile?.username ? (
          <span className="block truncate text-xs text-[var(--muted)]">
            @{profile.username}
          </span>
        ) : null}
      </span>
    </div>
  );
}

function buildQueueUrl({
  status,
  category,
  priority,
  assignment,
  cursor,
}: {
  status: StatusFilter;
  category: SupportCategory | "all";
  priority: SupportPriority | "all";
  assignment: AssignmentFilter;
  cursor?: QueueCursor | null;
}) {
  const params = new URLSearchParams({
    limit: "25",
    assignment,
  });

  if (status !== "active") {
    params.set("status", status);
  }

  if (category !== "all") {
    params.set("category", category);
  }

  if (priority !== "all") {
    params.set("priority", priority);
  }

  if (cursor) {
    params.set(
      "beforeLastMessageAt",
      cursor.beforeLastMessageAt,
    );
    params.set("beforeId", cursor.beforeId);
  }

  return `/api/staff/support/cases?${params.toString()}`;
}

async function readJson<T>(
  response: Response,
): Promise<T> {
  return (await response.json().catch(() => ({}))) as T;
}

export default function StaffSupportPage() {
  const [cases, setCases] = useState<SupportCase[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);

  const [selectedCaseId, setSelectedCaseId] =
    useState<string | null>(null);

  const [selectedCase, setSelectedCase] =
    useState<SupportCaseDetail | null>(null);

  const [messages, setMessages] =
    useState<SupportMessage[]>([]);

  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("active");

  const [categoryFilter, setCategoryFilter] =
    useState<SupportCategory | "all">("all");

  const [priorityFilter, setPriorityFilter] =
    useState<SupportPriority | "all">("all");

  const [assignmentFilter, setAssignmentFilter] =
    useState<AssignmentFilter>("all");

  const [queueCursor, setQueueCursor] =
    useState<QueueCursor | null>(null);

  const [messageCursor, setMessageCursor] =
    useState<MessageCursor | null>(null);

  const [queueHasMore, setQueueHasMore] =
    useState(false);

  const [messagesHaveMore, setMessagesHaveMore] =
    useState(false);

  const [loadingQueue, setLoadingQueue] =
    useState(true);

  const [loadingMoreQueue, setLoadingMoreQueue] =
    useState(false);

  const [loadingDetail, setLoadingDetail] =
    useState(false);

  const [loadingOlderMessages, setLoadingOlderMessages] =
    useState(false);

  const [updatingCase, setUpdatingCase] =
    useState(false);

  const [sendingMessage, setSendingMessage] =
    useState(false);

  const [messageVisibility, setMessageVisibility] =
    useState<"customer" | "internal">("customer");

  const [draft, setDraft] = useState("");
  const [pageError, setPageError] = useState("");
  const [pageNotice, setPageNotice] = useState("");
  const [accessDenied, setAccessDenied] =
    useState(false);

  const loadQueue = useCallback(async () => {
    setLoadingQueue(true);
    setPageError("");

    try {
      const response = await fetch(
        buildQueueUrl({
          status: statusFilter,
          category: categoryFilter,
          priority: priorityFilter,
          assignment: assignmentFilter,
        }),
        {
          cache: "no-store",
          credentials: "same-origin",
        },
      );

      const payload = await readJson<{
        cases?: SupportCase[];
        pagination?: {
          hasMore: boolean;
          nextCursor: QueueCursor | null;
        };
        error?: string;
      }>(response);

      if (response.status === 401) {
        setAccessDenied(true);
        setPageError(
          "Sign in with an authorized Agoré staff account to continue.",
        );
        setCases([]);
        setSelectedCaseId(null);
        return;
      }

      if (response.status === 403) {
        setAccessDenied(true);
        setPageError(
          payload.error ??
            "Your account does not have Support staff access.",
        );
        setCases([]);
        setSelectedCaseId(null);
        return;
      }

      if (!response.ok) {
        throw new Error(
          payload.error ??
            "Unable to load the Support queue.",
        );
      }

      setAccessDenied(false);

      const nextCases = Array.isArray(payload.cases)
        ? payload.cases
        : [];

      setCases(nextCases);
      setQueueHasMore(
        payload.pagination?.hasMore ?? false,
      );
      setQueueCursor(
        payload.pagination?.nextCursor ?? null,
      );

      setSelectedCaseId((current) => {
        if (
          current &&
          nextCases.some((item) => item.id === current)
        ) {
          return current;
        }

        return nextCases[0]?.id ?? null;
      });
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Unable to load the Support queue.",
      );
    } finally {
      setLoadingQueue(false);
    }
  }, [
    statusFilter,
    categoryFilter,
    priorityFilter,
    assignmentFilter,
  ]);

  const loadAssignees = useCallback(async () => {
    try {
      const response = await fetch(
        "/api/staff/support/assignees",
        {
          cache: "no-store",
          credentials: "same-origin",
        },
      );

      const payload = await readJson<{
        staff?: StaffMember[];
        error?: string;
      }>(response);

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setAccessDenied(true);
        }

        throw new Error(
          payload.error ??
            "Unable to load assignable staff.",
        );
      }

      setStaff(
        Array.isArray(payload.staff)
          ? payload.staff
          : [],
      );
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Unable to load assignable staff.",
      );
    }
  }, []);

  const loadCaseDetail = useCallback(async () => {
    if (!selectedCaseId) {
      setSelectedCase(null);
      setMessages([]);
      setMessageCursor(null);
      setMessagesHaveMore(false);
      return;
    }

    setLoadingDetail(true);
    setPageError("");

    try {
      const response = await fetch(
        `/api/staff/support/cases/${encodeURIComponent(
          selectedCaseId,
        )}?limit=50`,
        {
          cache: "no-store",
          credentials: "same-origin",
        },
      );

      const payload = await readJson<{
        case?: SupportCaseDetail;
        messages?: SupportMessage[];
        pagination?: {
          hasMore: boolean;
          nextCursor: MessageCursor | null;
        };
        error?: string;
      }>(response);

      if (response.status === 401 || response.status === 403) {
        setAccessDenied(true);
      }

      if (!response.ok || !payload.case) {
        throw new Error(
          payload.error ??
            "Unable to load this support case.",
        );
      }

      setSelectedCase(payload.case);
      setMessages(
        Array.isArray(payload.messages)
          ? payload.messages
          : [],
      );
      setMessagesHaveMore(
        payload.pagination?.hasMore ?? false,
      );
      setMessageCursor(
        payload.pagination?.nextCursor ?? null,
      );
    } catch (error) {
      setSelectedCase(null);
      setMessages([]);
      setPageError(
        error instanceof Error
          ? error.message
          : "Unable to load this support case.",
      );
    } finally {
      setLoadingDetail(false);
    }
  }, [selectedCaseId]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    void loadAssignees();
  }, [loadAssignees]);

  useEffect(() => {
    void loadCaseDetail();
  }, [loadCaseDetail]);

  async function loadMoreCases() {
    if (
      !queueCursor ||
      loadingMoreQueue
    ) {
      return;
    }

    setLoadingMoreQueue(true);
    setPageError("");

    try {
      const response = await fetch(
        buildQueueUrl({
          status: statusFilter,
          category: categoryFilter,
          priority: priorityFilter,
          assignment: assignmentFilter,
          cursor: queueCursor,
        }),
        {
          cache: "no-store",
          credentials: "same-origin",
        },
      );

      const payload = await readJson<{
        cases?: SupportCase[];
        pagination?: {
          hasMore: boolean;
          nextCursor: QueueCursor | null;
        };
        error?: string;
      }>(response);

      if (!response.ok) {
        throw new Error(
          payload.error ??
            "Unable to load more cases.",
        );
      }

      const olderCases = Array.isArray(payload.cases)
        ? payload.cases
        : [];

      setCases((current) => {
        const existing = new Set(
          current.map((item) => item.id),
        );

        return [
          ...current,
          ...olderCases.filter(
            (item) => !existing.has(item.id),
          ),
        ];
      });

      setQueueHasMore(
        payload.pagination?.hasMore ?? false,
      );
      setQueueCursor(
        payload.pagination?.nextCursor ?? null,
      );
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Unable to load more cases.",
      );
    } finally {
      setLoadingMoreQueue(false);
    }
  }

  async function loadOlderMessages() {
    if (
      !selectedCaseId ||
      !messageCursor ||
      loadingOlderMessages
    ) {
      return;
    }

    setLoadingOlderMessages(true);
    setPageError("");

    try {
      const params = new URLSearchParams({
        limit: "50",
        beforeCreatedAt:
          messageCursor.beforeCreatedAt,
        beforeId: messageCursor.beforeId,
      });

      const response = await fetch(
        `/api/staff/support/cases/${encodeURIComponent(
          selectedCaseId,
        )}?${params.toString()}`,
        {
          cache: "no-store",
          credentials: "same-origin",
        },
      );

      const payload = await readJson<{
        messages?: SupportMessage[];
        pagination?: {
          hasMore: boolean;
          nextCursor: MessageCursor | null;
        };
        error?: string;
      }>(response);

      if (!response.ok) {
        throw new Error(
          payload.error ??
            "Unable to load older messages.",
        );
      }

      const olderMessages = Array.isArray(payload.messages)
        ? payload.messages
        : [];

      setMessages((current) => {
        const existing = new Set(
          current.map((message) => message.id),
        );

        return [
          ...olderMessages.filter(
            (message) => !existing.has(message.id),
          ),
          ...current,
        ];
      });

      setMessagesHaveMore(
        payload.pagination?.hasMore ?? false,
      );
      setMessageCursor(
        payload.pagination?.nextCursor ?? null,
      );
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Unable to load older messages.",
      );
    } finally {
      setLoadingOlderMessages(false);
    }
  }

  async function updateCase(
    changes: {
      status?: SupportStatus;
      priority?: SupportPriority;
      assignedTo?: string | null;
    },
  ) {
    if (!selectedCaseId || updatingCase) {
      return;
    }

    setUpdatingCase(true);
    setPageError("");
    setPageNotice("");

    try {
      const response = await fetch(
        `/api/staff/support/cases/${encodeURIComponent(
          selectedCaseId,
        )}`,
        {
          method: "PATCH",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(changes),
        },
      );

      const payload = await readJson<{
        success?: boolean;
        error?: string;
      }>(response);

      if (!response.ok) {
        throw new Error(
          payload.error ??
            "Unable to update the support case.",
        );
      }

      setPageNotice("Support case updated.");

      await loadQueue();
      await loadCaseDetail();
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Unable to update the support case.",
      );
    } finally {
      setUpdatingCase(false);
    }
  }

  async function sendMessage(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const body = draft.trim();

    if (
      !selectedCaseId ||
      !body ||
      sendingMessage ||
      (selectedCase?.status === "closed" &&
        messageVisibility === "customer")
    ) {
      return;
    }

    setSendingMessage(true);
    setPageError("");
    setPageNotice("");

    try {
      const response = await fetch(
        `/api/staff/support/cases/${encodeURIComponent(
          selectedCaseId,
        )}/messages`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            body,
            visibility: messageVisibility,
          }),
        },
      );

      const payload = await readJson<{
        success?: boolean;
        error?: string;
      }>(response);

      if (!response.ok) {
        throw new Error(
          payload.error ??
            "Unable to send this message.",
        );
      }

      setDraft("");
      setPageNotice(
        messageVisibility === "internal"
          ? "Internal note saved."
          : "Customer reply sent.",
      );

      await loadCaseDetail();
      await loadQueue();
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Unable to send this message.",
      );
    } finally {
      setSendingMessage(false);
    }
  }

  const selectedIsClosed =
    selectedCase?.status === "closed";

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto w-full max-w-[1600px] px-3 py-4 sm:px-6 sm:py-6">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-5">
          <div className="flex items-center gap-3">
            <Link
              href="/settings"
              aria-label="Back to settings"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] transition hover:border-[var(--accent)]"
            >
              <ArrowLeft size={17} />
            </Link>

            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <LifeBuoy size={22} />
            </span>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
                Agoré · Staff tools
              </p>

              <h1 className="mt-0.5 text-xl font-semibold tracking-[-0.04em] sm:text-2xl">
                Support desk
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-medium text-[var(--muted-strong)]">
            <ShieldCheck
              size={15}
              className="text-[var(--accent)]"
            />
            Restricted staff access
          </div>
        </header>

        {pageError ? (
          <div
            role="alert"
            className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-4 py-3 text-sm"
          >
            <span>{pageError}</span>

            <button
              type="button"
              onClick={() => {
                setPageError("");
                void loadQueue();
                void loadAssignees();
                void loadCaseDetail();
              }}
              className="rounded-full border border-[var(--danger)]/30 px-3 py-1.5 text-xs font-semibold"
            >
              Retry
            </button>
          </div>
        ) : null}

        {pageNotice ? (
          <div
            role="status"
            className="mb-4 rounded-2xl border border-[var(--success)]/25 bg-[var(--success-soft)] px-4 py-3 text-sm text-[var(--success)]"
          >
            {pageNotice}
          </div>
        ) : null}

        {accessDenied ? (
          <section className="mx-auto mt-12 max-w-lg rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-7 text-center">
            <ShieldCheck
              size={30}
              className="mx-auto text-[var(--muted)]"
            />

            <h2 className="mt-4 text-lg font-semibold">
              Staff access required
            </h2>

            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              This area is restricted to active Agoré staff
              authorized to handle support cases.
            </p>

            <Link
              href="/home"
              className="mt-5 inline-flex min-h-10 items-center justify-center rounded-full bg-[var(--foreground)] px-4 text-sm font-semibold text-[var(--background)]"
            >
              Return to Agoré
            </Link>
          </section>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[minmax(320px,0.78fr)_minmax(0,1.45fr)]">
            <section className="min-w-0 overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)]">
              <div className="border-b border-[var(--border)] p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="flex items-center gap-2 text-base font-semibold">
                      <Inbox
                        size={18}
                        className="text-[var(--accent)]"
                      />
                      Case queue
                    </h2>

                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {cases.length} loaded
                      {queueHasMore ? " · More available" : ""}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      void loadQueue();
                      void loadAssignees();
                    }}
                    disabled={loadingQueue}
                    aria-label="Refresh case queue"
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] transition hover:border-[var(--accent)] disabled:opacity-50"
                  >
                    <RefreshCw
                      size={15}
                      className={
                        loadingQueue ? "animate-spin" : ""
                      }
                    />
                  </button>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-[11px] font-semibold text-[var(--muted)]">
                      Status
                    </span>

                    <select
                      value={statusFilter}
                      onChange={(event) =>
                        setStatusFilter(
                          event.target.value as StatusFilter,
                        )
                      }
                      className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-xs outline-none focus:border-[var(--accent)]"
                    >
                      {STATUS_FILTERS.map((item) => (
                        <option
                          key={item.value}
                          value={item.value}
                        >
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-[11px] font-semibold text-[var(--muted)]">
                      Assignment
                    </span>

                    <select
                      value={assignmentFilter}
                      onChange={(event) =>
                        setAssignmentFilter(
                          event.target.value as AssignmentFilter,
                        )
                      }
                      className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-xs outline-none focus:border-[var(--accent)]"
                    >
                      <option value="all">Everyone</option>
                      <option value="mine">Assigned to me</option>
                      <option value="unassigned">Unassigned</option>
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-[11px] font-semibold text-[var(--muted)]">
                      Category
                    </span>

                    <select
                      value={categoryFilter}
                      onChange={(event) =>
                        setCategoryFilter(
                          event.target.value as SupportCategory | "all",
                        )
                      }
                      className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-xs outline-none focus:border-[var(--accent)]"
                    >
                      <option value="all">All categories</option>
                      {CATEGORIES.map((item) => (
                        <option
                          key={item.value}
                          value={item.value}
                        >
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-[11px] font-semibold text-[var(--muted)]">
                      Priority
                    </span>

                    <select
                      value={priorityFilter}
                      onChange={(event) =>
                        setPriorityFilter(
                          event.target.value as SupportPriority | "all",
                        )
                      }
                      className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-xs outline-none focus:border-[var(--accent)]"
                    >
                      <option value="all">All priorities</option>
                      {PRIORITIES.map((item) => (
                        <option
                          key={item.value}
                          value={item.value}
                        >
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div className="max-h-[72vh] min-h-64 overflow-y-auto">
                {loadingQueue && cases.length === 0 ? (
                  <div className="flex min-h-60 items-center justify-center gap-3 text-sm text-[var(--muted)]">
                    <LoaderCircle
                      size={18}
                      className="animate-spin"
                    />
                    Loading cases…
                  </div>
                ) : cases.length === 0 ? (
                  <div className="flex min-h-60 flex-col items-center justify-center px-6 text-center">
                    <Inbox
                      size={27}
                      className="text-[var(--muted)]"
                    />

                    <p className="mt-3 text-sm font-semibold">
                      No matching cases
                    </p>

                    <p className="mt-1 max-w-xs text-xs leading-5 text-[var(--muted)]">
                      Try changing the filters or refresh the queue.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--border)]">
                    {cases.map((supportCase) => {
                      const selected =
                        supportCase.id === selectedCaseId;

                      return (
                        <button
                          key={supportCase.id}
                          type="button"
                          onClick={() => {
                            setPageError("");
                            setPageNotice("");
                            setSelectedCaseId(
                              supportCase.id,
                            );
                          }}
                          className={`block w-full px-4 py-4 text-left transition sm:px-5 ${
                            selected
                              ? "border-l-[3px] border-l-[var(--accent)] bg-[var(--accent-soft)]"
                              : "border-l-[3px] border-l-transparent hover:bg-[var(--surface-muted)]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <p className="min-w-0 break-words text-sm font-semibold leading-5">
                              {supportCase.subject}
                            </p>

                            <ChevronRight
                              size={15}
                              className="mt-0.5 shrink-0 text-[var(--muted)]"
                            />
                          </div>

                          <p className="mt-1.5 text-[11px] text-[var(--muted)]">
                            {CATEGORY_LABELS[supportCase.category]}
                            {" · "}
                            {formatDate(supportCase.last_message_at)}
                          </p>

                          <div className="mt-3 flex flex-wrap items-center gap-1.5">
                            <StatusPill
                              status={supportCase.status}
                            />
                            <PriorityPill
                              priority={supportCase.priority}
                            />
                          </div>

                          <div className="mt-3 flex items-center justify-between gap-3">
                            <span className="min-w-0 truncate text-xs text-[var(--muted)]">
                              {supportCase.requester?.display_name ??
                                supportCase.requester?.username ??
                                "Requester unavailable"}
                            </span>

                            <span className="shrink-0 text-[10px] text-[var(--muted)]">
                              {supportCase.assignee
                                ? `Assigned: @${supportCase.assignee.username}`
                                : "Unassigned"}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {queueHasMore ? (
                  <div className="border-t border-[var(--border)] p-3">
                    <button
                      type="button"
                      onClick={() => void loadMoreCases()}
                      disabled={loadingMoreQueue}
                      className="flex min-h-10 w-full items-center justify-center gap-2 rounded-full border border-[var(--border)] text-xs font-semibold transition hover:border-[var(--accent)] disabled:opacity-50"
                    >
                      {loadingMoreQueue ? (
                        <LoaderCircle
                          size={14}
                          className="animate-spin"
                        />
                      ) : null}
                      Load more cases
                    </button>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="min-w-0 overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)]">
              {loadingDetail && !selectedCase ? (
                <div className="flex min-h-[50vh] items-center justify-center gap-3 text-sm text-[var(--muted)]">
                  <LoaderCircle
                    size={18}
                    className="animate-spin"
                  />
                  Loading case…
                </div>
              ) : !selectedCase ? (
                <div className="flex min-h-[50vh] flex-col items-center justify-center px-6 text-center">
                  <MessageSquareText
                    size={28}
                    className="text-[var(--muted)]"
                  />

                  <h2 className="mt-3 text-base font-semibold">
                    Select a support case
                  </h2>

                  <p className="mt-1 max-w-sm text-sm leading-6 text-[var(--muted)]">
                    Choose a case from the queue to read its history,
                    update its status, or contact the requester.
                  </p>
                </div>
              ) : (
                <>
                  <div className="border-b border-[var(--border)] p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--accent)]">
                          Support case
                        </p>

                        <h2 className="mt-1 break-words text-lg font-semibold tracking-[-0.03em] sm:text-xl">
                          {selectedCase.subject}
                        </h2>

                        <p className="mt-1.5 text-xs leading-5 text-[var(--muted)]">
                          {CATEGORY_LABELS[selectedCase.category]}
                          {" · "}
                          Opened {formatDate(selectedCase.created_at)}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          void loadCaseDetail();
                          void loadQueue();
                        }}
                        disabled={loadingDetail}
                        aria-label="Refresh selected case"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] transition hover:border-[var(--accent)] disabled:opacity-50"
                      >
                        <RefreshCw
                          size={15}
                          className={
                            loadingDetail ? "animate-spin" : ""
                          }
                        />
                      </button>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor="support-case-status"
                          className="mb-1.5 block text-[11px] font-semibold text-[var(--muted)]"
                        >
                          Status
                        </label>

                        <select
                          id="support-case-status"
                          value={selectedCase.status}
                          disabled={updatingCase}
                          onChange={(event) =>
                            void updateCase({
                              status: event.target.value as SupportStatus,
                            })
                          }
                          className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-xs outline-none focus:border-[var(--accent)] disabled:opacity-50"
                        >
                          {STATUSES.map((item) => (
                            <option
                              key={item.value}
                              value={item.value}
                            >
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label
                          htmlFor="support-case-priority"
                          className="mb-1.5 block text-[11px] font-semibold text-[var(--muted)]"
                        >
                          Priority
                        </label>

                        <select
                          id="support-case-priority"
                          value={selectedCase.priority}
                          disabled={updatingCase}
                          onChange={(event) =>
                            void updateCase({
                              priority: event.target.value as SupportPriority,
                            })
                          }
                          className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-xs outline-none focus:border-[var(--accent)] disabled:opacity-50"
                        >
                          {PRIORITIES.map((item) => (
                            <option
                              key={item.value}
                              value={item.value}
                            >
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="sm:col-span-2">
                        <label
                          htmlFor="support-case-assignee"
                          className="mb-1.5 block text-[11px] font-semibold text-[var(--muted)]"
                        >
                          Assigned staff member
                        </label>

                        <select
                          id="support-case-assignee"
                          value={selectedCase.assigned_to ?? ""}
                          disabled={updatingCase}
                          onChange={(event) =>
                            void updateCase({
                              assignedTo:
                                event.target.value || null,
                            })
                          }
                          className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-xs outline-none focus:border-[var(--accent)] disabled:opacity-50"
                        >
                          <option value="">
                            Unassigned
                          </option>

                          {staff.map((member) => (
                            <option
                              key={member.userId}
                              value={member.userId}
                            >
                              {member.displayName}
                              {" · "}
                              @{member.username}
                              {" · "}
                              {ROLE_LABELS[member.role]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="border-b border-[var(--border)] bg-[var(--surface-muted)]/50 px-4 py-4 sm:px-5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                      Requester
                    </p>

                    <div className="mt-2">
                      <ProfileIdentity
                        profile={selectedCase.requester}
                        fallback="Requester"
                      />
                    </div>

                    <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--muted-strong)]">
                      {selectedCase.description}
                    </p>

                    {selectedCase.related_report_id ? (
                      <p className="mt-3 text-xs text-[var(--muted)]">
                        Linked report: {selectedCase.related_report_id}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-5">
                    <div className="flex items-center gap-2">
                      <MessageSquareText
                        size={17}
                        className="text-[var(--accent)]"
                      />
                      <h3 className="text-sm font-semibold">
                        Conversation
                      </h3>
                    </div>

                    <span className="text-[11px] text-[var(--muted)]">
                      {messages.length} loaded
                    </span>
                  </div>

                  <div className="max-h-[48vh] min-h-64 space-y-4 overflow-y-auto px-3 py-4 sm:px-5">
                    {messagesHaveMore && messageCursor ? (
                      <div className="flex justify-center">
                        <button
                          type="button"
                          onClick={() =>
                            void loadOlderMessages()
                          }
                          disabled={loadingOlderMessages}
                          className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[var(--border)] px-3 text-xs font-semibold transition hover:border-[var(--accent)] disabled:opacity-50"
                        >
                          {loadingOlderMessages ? (
                            <LoaderCircle
                              size={13}
                              className="animate-spin"
                            />
                          ) : null}
                          Load older messages
                        </button>
                      </div>
                    ) : null}

                    {messages.length === 0 ? (
                      <div className="flex min-h-40 flex-col items-center justify-center text-center">
                        <MessageSquareText
                          size={23}
                          className="text-[var(--muted)]"
                        />

                        <p className="mt-2 text-sm font-medium">
                          No messages
                        </p>
                      </div>
                    ) : (
                      messages.map((message) => {
                        const internal =
                          message.visibility === "internal";

                        return (
                          <article
                            key={message.id}
                            className={`rounded-2xl border p-3.5 sm:p-4 ${
                              internal
                                ? "border-[var(--accent)]/35 bg-[var(--accent-soft)]/50"
                                : "border-[var(--border)] bg-[var(--background)]"
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex min-w-0 items-center gap-2">
                                {internal ? (
                                  <StickyNote
                                    size={15}
                                    className="shrink-0 text-[var(--accent)]"
                                  />
                                ) : (
                                  <UserRound
                                    size={15}
                                    className="shrink-0 text-[var(--muted)]"
                                  />
                                )}

                                <p className="truncate text-xs font-semibold">
                                  {message.sender?.display_name ??
                                    message.sender?.username ??
                                    "Unknown sender"}
                                </p>
                              </div>

                              {internal ? (
                                <span className="rounded-full border border-[var(--accent)]/30 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--accent)]">
                                  Internal note
                                </span>
                              ) : (
                                <span className="rounded-full border border-[var(--border)] px-2 py-1 text-[10px] font-semibold text-[var(--muted)]">
                                  Customer-visible
                                </span>
                              )}
                            </div>

                            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">
                              {message.body}
                            </p>

                            <time
                              dateTime={message.created_at}
                              className="mt-2 block text-[10px] text-[var(--muted)]"
                            >
                              {formatDate(message.created_at)}
                            </time>
                          </article>
                        );
                      })
                    )}
                  </div>

                  <form
                    onSubmit={sendMessage}
                    className="border-t border-[var(--border)] bg-[var(--surface-muted)]/40 p-3 sm:p-5"
                  >
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setMessageVisibility("customer")
                          }
                          className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition ${
                            messageVisibility === "customer"
                              ? "border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]"
                              : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted-strong)]"
                          }`}
                        >
                          <Send size={13} />
                          Customer reply
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setMessageVisibility("internal")
                          }
                          className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition ${
                            messageVisibility === "internal"
                              ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                              : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted-strong)]"
                          }`}
                        >
                          <StickyNote size={13} />
                          Internal note
                        </button>
                      </div>

                      <span className="text-[10px] text-[var(--muted)]">
                        {draft.length}/5000
                      </span>
                    </div>

                    {messageVisibility === "internal" ? (
                      <p className="mb-3 rounded-xl border border-[var(--accent)]/25 bg-[var(--accent-soft)] px-3 py-2 text-xs leading-5 text-[var(--accent)]">
                        Internal notes are visible only to authorized
                        staff. They are not sent to the requester.
                      </p>
                    ) : null}

                    {selectedIsClosed &&
                    messageVisibility === "customer" ? (
                      <p className="mb-3 text-xs leading-5 text-[var(--muted)]">
                        This case is closed. Reopen it before sending a
                        customer-visible reply.
                      </p>
                    ) : null}

                    <textarea
                      value={draft}
                      onChange={(event) =>
                        setDraft(event.target.value)
                      }
                      maxLength={5000}
                      rows={4}
                      disabled={
                        sendingMessage ||
                        (selectedIsClosed &&
                          messageVisibility === "customer")
                      }
                      placeholder={
                        messageVisibility === "internal"
                          ? "Write a private internal note…"
                          : "Write a reply to the requester…"
                      }
                      className="w-full resize-y rounded-2xl border border-[var(--border)] bg-[var(--background)] px-3.5 py-3 text-sm leading-6 outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)] disabled:opacity-50"
                    />

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <span className="text-[11px] text-[var(--muted)]">
                        {messageVisibility === "internal"
                          ? "Staff-only conversation entry"
                          : "Visible to the customer"}
                      </span>

                      <button
                        type="submit"
                        disabled={
                          sendingMessage ||
                          !draft.trim() ||
                          draft.trim().length > 5000 ||
                          (selectedIsClosed &&
                            messageVisibility === "customer")
                        }
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-[var(--foreground)] px-4 text-xs font-semibold text-[var(--background)] transition hover:bg-[var(--accent)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {sendingMessage ? (
                          <LoaderCircle
                            size={15}
                            className="animate-spin"
                          />
                        ) : messageVisibility === "internal" ? (
                          <StickyNote size={14} />
                        ) : (
                          <Send size={14} />
                        )}

                        {sendingMessage
                          ? "Saving…"
                          : messageVisibility === "internal"
                            ? "Add internal note"
                            : "Send reply"}
                      </button>
                    </div>
                  </form>
                </>
              )}
            </section>
          </div>
        )}

        <footer className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-4 text-[10px] leading-5 text-[var(--muted)]">
          <span>Agoré Support · Internal tools</span>
          <span>Access and writes are checked by server APIs.</span>
        </footer>
      </div>
    </main>
  );
}