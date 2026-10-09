
"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  LifeBuoy,
  LoaderCircle,
  MessageSquareText,
  RefreshCw,
  Send,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";

import { createClient } from "@/lib/supabase/browser";

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

type SupportCase = {
  id: string;
  category: SupportCategory;
  subject: string;
  description: string;
  status: SupportStatus;
  priority: string;
  created_at: string;
  updated_at: string;
  last_message_at: string;
  resolved_at: string | null;
  closed_at: string | null;
};

type SupportMessage = {
  id: string;
  body: string;
  created_at: string;
  sender: "you" | "support";
};

type MessageCursor = {
  beforeCreatedAt: string;
  beforeId: string;
};

type ConversationResponse = {
  case?: SupportCase;
  messages?: SupportMessage[];
  pagination?: {
    limit: number;
    hasMore: boolean;
    nextCursor: MessageCursor | null;
  };
  error?: string;
};

const supabase = createClient();

const categoryLabels: Record<SupportCategory, string> = {
  account_access: "Account access",
  technical_issue: "Technical issue",
  bug_report: "Bug report",
  safety: "Safety",
  privacy: "Privacy",
  feedback: "Feedback",
  other: "Other",
};

const statusLabels: Record<SupportStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  waiting_on_user: "Your reply needed",
  resolved: "Resolved",
  closed: "Closed",
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

function StatusPill({ status }: { status: SupportStatus }) {
  const resolved = status === "resolved";
  const closed = status === "closed";
  const waiting = status === "waiting_on_user";

  const style = resolved
    ? "border-[var(--success)]/25 bg-[var(--success-soft)] text-[var(--success)]"
    : waiting
      ? "border-[var(--accent)]/25 bg-[var(--accent-soft)] text-[var(--accent)]"
      : closed
        ? "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--muted)]"
        : "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${style}`}
    >
      {resolved ? (
        <CheckCircle2 size={13} />
      ) : (
        <Clock3 size={13} />
      )}
      {statusLabels[status]}
    </span>
  );
}

export default function SupportConversationPage() {
  const params = useParams<{ caseId: string }>();
  const router = useRouter();
  const caseId = params.caseId;

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);

  const [supportCase, setSupportCase] =
    useState<SupportCase | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<MessageCursor | null>(null);

  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadConversation = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/support/cases/${encodeURIComponent(caseId)}?limit=40`,
        {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        },
      );

      const payload = (await response
        .json()
        .catch(() => ({}))) as ConversationResponse;

      if (response.status === 401) {
        router.replace("/auth");
        return;
      }

      if (!response.ok || !payload.case) {
        throw new Error(
          payload.error ?? "Unable to load this support conversation.",
        );
      }

      setSupportCase(payload.case);
      setMessages(
        Array.isArray(payload.messages) ? payload.messages : [],
      );
      setHasMore(payload.pagination?.hasMore ?? false);
      setCursor(payload.pagination?.nextCursor ?? null);
    } catch (loadError) {
      console.error("Failed to load Agore support conversation:", loadError);

      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load this support conversation.",
      );
    } finally {
      setLoading(false);
    }
  }, [caseId, router]);

  useEffect(() => {
    let active = true;

    async function initialise() {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (!active) {
        return;
      }

      if (authError || !user) {
        router.replace("/auth");
        return;
      }

      setCheckingAuth(false);
      void loadConversation();
    }

    void initialise();

    return () => {
      active = false;
    };
  }, [router, loadConversation]);

  async function loadOlderMessages() {
    if (!cursor || loadingOlder) {
      return;
    }

    setLoadingOlder(true);
    setError("");

    try {
      const query = new URLSearchParams({
        limit: "40",
        beforeCreatedAt: cursor.beforeCreatedAt,
        beforeId: cursor.beforeId,
      });

      const response = await fetch(
        `/api/support/cases/${encodeURIComponent(caseId)}?${query.toString()}`,
        {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        },
      );

      const payload = (await response
        .json()
        .catch(() => ({}))) as ConversationResponse;

      if (response.status === 401) {
        router.replace("/auth");
        return;
      }

      if (!response.ok) {
        throw new Error(
          payload.error ?? "Unable to load older messages.",
        );
      }

      const olderMessages = Array.isArray(payload.messages)
        ? payload.messages
        : [];

      setMessages((current) => {
        const existingIds = new Set(current.map((message) => message.id));
        const uniqueOlder = olderMessages.filter(
          (message) => !existingIds.has(message.id),
        );

        return [...uniqueOlder, ...current];
      });

      setHasMore(payload.pagination?.hasMore ?? false);
      setCursor(payload.pagination?.nextCursor ?? null);
    } catch (loadError) {
      console.error("Failed to load older support messages:", loadError);

      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load older messages.",
      );
    } finally {
      setLoadingOlder(false);
    }
  }

  async function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const body = draft.trim();

    if (!body || sending || supportCase?.status === "closed") {
      return;
    }

    setSending(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/support/cases/${encodeURIComponent(caseId)}/messages`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ body }),
        },
      );

      const payload = (await response
        .json()
        .catch(() => ({}))) as {
        success?: boolean;
        message?: {
          id: string;
          body: string;
          sender: "you";
        };
        error?: string;
      };

      if (response.status === 401) {
        router.replace("/auth");
        return;
      }

      if (!response.ok) {
        throw new Error(
          payload.error ?? "Unable to send your reply.",
        );
      }

      setDraft("");
      setNotice("Your reply has been sent.");

      // Fetch the stored message so its timestamp and status
      // come from the server rather than the device clock.
      try {
        const latestResponse = await fetch(
          `/api/support/cases/${encodeURIComponent(caseId)}?limit=1`,
          {
            method: "GET",
            credentials: "same-origin",
            cache: "no-store",
          },
        );

        const latestPayload = (await latestResponse
          .json()
          .catch(() => ({}))) as ConversationResponse;

        if (latestResponse.ok && latestPayload.case) {
          setSupportCase(latestPayload.case);

          const latestMessage = latestPayload.messages?.[0];

          if (latestMessage) {
            setMessages((current) => {
              if (current.some((item) => item.id === latestMessage.id)) {
                return current;
              }

              return [...current, latestMessage];
            });
          }
        } else if (payload.message) {
          setMessages((current) => [
            ...current,
            {
              ...payload.message!,
              created_at: new Date().toISOString(),
            },
          ]);
        }
      } catch {
        if (payload.message) {
          setMessages((current) => [
            ...current,
            {
              ...payload.message!,
              created_at: new Date().toISOString(),
            },
          ]);
        }
      }
    } catch (sendError) {
      console.error("Failed to send Agore support reply:", sendError);

      setError(
        sendError instanceof Error
          ? sendError.message
          : "Unable to send your reply.",
      );
    } finally {
      setSending(false);
    }
  }

  if (checkingAuth || loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--background)] text-[var(--muted)]">
        <div className="flex items-center gap-3 text-sm">
          <LoaderCircle size={18} className="animate-spin" />
          Loading your conversation…
        </div>
      </main>
    );
  }

  if (!supportCase) {
    return (
      <main className="min-h-screen bg-[var(--background)] px-4 py-8 text-[var(--foreground)]">
        <div className="mx-auto max-w-xl rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-muted)]">
            <LifeBuoy size={22} />
          </span>
          <h1 className="mt-5 text-xl font-semibold">
            Conversation unavailable
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            {error || "This request could not be found or you do not have access to it."}
          </p>
          <Link
            href="/support"
            className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--foreground)] px-4 text-sm font-semibold text-[var(--background)]"
          >
            <ArrowLeft size={16} />
            Back to Support
          </Link>
        </div>
      </main>
    );
  }

  const isClosed = supportCase.status === "closed";

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-3 pb-4 pt-4 sm:px-6 sm:pt-7">
        <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
          <Link
            href="/support"
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3.5 text-sm font-medium transition hover:border-[var(--accent)]"
          >
            <ArrowLeft size={16} />
            <span>All requests</span>
          </Link>

          <Link
            href="/home"
            className="text-lg font-bold tracking-[-0.055em]"
            aria-label="Agoré home"
          >
            Agoré<span className="text-[var(--accent)]">.</span>
          </Link>
        </header>

        <section className="mt-5 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <MessageSquareText size={21} />
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
                  Support request
                </p>
                <StatusPill status={supportCase.status} />
              </div>

              <h1 className="mt-2 break-words text-xl font-semibold tracking-[-0.04em] sm:text-2xl">
                {supportCase.subject}
              </h1>

              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                {categoryLabels[supportCase.category] ?? "Support"}
                {" · "}
                Opened {formatDate(supportCase.created_at)}
              </p>
            </div>

            <button
              type="button"
              aria-label="Refresh conversation"
              onClick={() => void loadConversation()}
              disabled={loading}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] transition hover:border-[var(--accent)] disabled:opacity-50"
            >
              <RefreshCw size={15} />
            </button>
          </div>
        </section>

        {error ? (
          <div
            role="alert"
            className="mt-4 rounded-2xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-3.5 text-sm"
          >
            {error}
          </div>
        ) : null}

        {notice ? (
          <div
            role="status"
            className="mt-4 rounded-2xl border border-[var(--success)]/25 bg-[var(--success-soft)] p-3.5 text-sm text-[var(--success)]"
          >
            {notice}
          </div>
        ) : null}

        <section
          aria-label="Support conversation"
          className="mt-5 flex min-h-[42vh] flex-1 flex-col overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)]"
        >
          <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-4 sm:px-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[var(--muted)]">
              <LifeBuoy size={17} />
            </span>
            <div>
              <p className="text-sm font-semibold">Agoré Support</p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                Your private support conversation
              </p>
            </div>
          </div>

          <div className="flex-1 space-y-5 px-3 py-5 sm:px-5">
            {hasMore && cursor ? (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => void loadOlderMessages()}
                  disabled={loadingOlder}
                  className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--border)] px-4 text-xs font-semibold transition hover:border-[var(--accent)] disabled:opacity-50"
                >
                  {loadingOlder ? (
                    <LoaderCircle size={14} className="animate-spin" />
                  ) : (
                    <RefreshCw size={13} />
                  )}
                  Load older messages
                </button>
              </div>
            ) : null}

            {messages.length === 0 ? (
              <div className="flex min-h-40 flex-col items-center justify-center text-center">
                <MessageSquareText size={24} className="text-[var(--muted)]" />
                <p className="mt-3 text-sm font-medium">
                  No messages to display
                </p>
              </div>
            ) : (
              messages.map((message) => {
                const isMine = message.sender === "you";

                return (
                  <div
                    key={message.id}
                    className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[88%] sm:max-w-[78%] ${
                        isMine ? "items-end" : "items-start"
                      } flex flex-col`}
                    >
                      <p className="mb-1.5 px-1 text-[11px] font-semibold text-[var(--muted)]">
                        {isMine ? "You" : "Agoré Support"}
                      </p>

                      <div
                        className={`rounded-2xl px-4 py-3 ${
                          isMine
                            ? "rounded-br-md bg-[var(--foreground)] text-[var(--background)]"
                            : "rounded-bl-md border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)]"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words text-sm leading-6">
                          {message.body}
                        </p>
                      </div>

                      <time
                        dateTime={message.created_at}
                        className="mt-1.5 px-1 text-[10px] text-[var(--muted)]"
                      >
                        {formatDate(message.created_at)}
                      </time>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {isClosed ? (
            <div className="border-t border-[var(--border)] bg-[var(--surface-muted)] px-4 py-5 text-center">
              <p className="text-sm font-semibold">
                This request is closed
              </p>
              <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                Closed requests cannot receive new replies. Open a new
                support request if you still need assistance.
              </p>
              <Link
                href="/support"
                className="mt-3 inline-flex min-h-10 items-center justify-center rounded-full bg-[var(--foreground)] px-4 text-xs font-semibold text-[var(--background)]"
              >
                Open another request
              </Link>
            </div>
          ) : (
            <form
              onSubmit={sendReply}
              className="border-t border-[var(--border)] p-3 sm:p-4"
            >
              <label
                htmlFor="support-reply"
                className="mb-2 block text-xs font-semibold text-[var(--muted)]"
              >
                Write a reply
              </label>

              <textarea
                id="support-reply"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={5000}
                rows={3}
                disabled={sending}
                placeholder="Add information or reply to Support…"
                className="w-full resize-y rounded-2xl border border-[var(--border)] bg-[var(--background)] px-3.5 py-3 text-sm leading-6 outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)] disabled:opacity-60"
              />

              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[11px] text-[var(--muted)]">
                  {draft.length}/5000
                </p>

                <button
                  type="submit"
                  disabled={!draft.trim() || sending}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[var(--foreground)] px-5 text-sm font-semibold text-[var(--background)] transition hover:bg-[var(--accent)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sending ? (
                    <>
                      <LoaderCircle size={16} className="animate-spin" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <Send size={15} />
                      Send reply
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </section>

        <footer className="py-5 text-center text-[11px] leading-5 text-[var(--muted)]">
          Do not send passwords, login codes, or other authentication secrets.
        </footer>
      </div>
    </main>
  );
}
