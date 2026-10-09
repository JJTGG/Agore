
"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  LifeBuoy,
  LoaderCircle,
  MessageSquareText,
  Plus,
  RefreshCw,
  Send,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/browser";

type SupportCategory =
  | "account_access"
  | "technical_issue"
  | "bug_report"
  | "safety"
  | "privacy"
  | "feedback"
  | "other";

type SupportStatus =
  | "open"
  | "in_progress"
  | "waiting_on_user"
  | "resolved"
  | "closed";

type SupportCase = {
  id: string;
  category: SupportCategory;
  subject: string;
  description: string;
  status: SupportStatus;
  priority: "low" | "normal" | "high" | "urgent";
  created_at: string;
  updated_at: string;
  last_message_at: string;
  resolved_at: string | null;
  closed_at: string | null;
};

type SupportForm = {
  category: SupportCategory;
  subject: string;
  description: string;
};

const categories: {
  value: SupportCategory;
  label: string;
  description: string;
}[] = [
  {
    value: "account_access",
    label: "Account access",
    description: "Sign-in or account problems",
  },
  {
    value: "technical_issue",
    label: "Technical issue",
    description: "Something is not working",
  },
  {
    value: "bug_report",
    label: "Report a bug",
    description: "Unexpected behaviour or errors",
  },
  {
    value: "safety",
    label: "Safety",
    description: "A safety or conduct concern",
  },
  {
    value: "privacy",
    label: "Privacy",
    description: "Personal data or privacy concerns",
  },
  {
    value: "feedback",
    label: "Feedback",
    description: "Ideas to improve Agoré",
  },
  {
    value: "other",
    label: "Something else",
    description: "Anything not covered above",
  },
];

const statusLabels: Record<SupportStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  waiting_on_user: "Your reply needed",
  resolved: "Resolved",
  closed: "Closed",
};

const supabase = createClient();

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

function statusStyle(status: SupportStatus) {
  if (status === "resolved") {
    return "border-[var(--success)]/25 bg-[var(--success-soft)] text-[var(--success)]";
  }

  if (status === "closed") {
    return "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--muted)]";
  }

  if (status === "waiting_on_user") {
    return "border-[var(--accent)]/25 bg-[var(--accent-soft)] text-[var(--accent)]";
  }

  return "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]";
}

function SupportStatusPill({
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
      ) : status === "waiting_on_user" ? (
        <MessageSquareText size={12} />
      ) : (
        <Clock3 size={12} />
      )}
      {statusLabels[status]}
    </span>
  );
}

export default function SupportPage() {
  const router = useRouter();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [cases, setCases] = useState<SupportCase[]>([]);
  const [loadingCases, setLoadingCases] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [form, setForm] = useState<SupportForm>({
    category: "technical_issue",
    subject: "",
    description: "",
  });

  const loadCases = useCallback(async () => {
    setLoadingCases(true);
    setError("");

    try {
      const response = await fetch(
        "/api/support/cases?limit=20",
        {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
        },
      );

      const payload = (await response
        .json()
        .catch(() => ({}))) as {
        cases?: SupportCase[];
        error?: string;
      };

      if (response.status === 401) {
        router.replace("/auth");
        return;
      }

      if (!response.ok) {
        throw new Error(
          payload.error ?? "Unable to load support requests.",
        );
      }

      setCases(
        Array.isArray(payload.cases)
          ? payload.cases
          : [],
      );
    } catch (loadError) {
      console.error(
        "Failed to load Agore support requests:",
        loadError,
      );

      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load support requests.",
      );
    } finally {
      setLoadingCases(false);
    }
  }, [router]);

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
      void loadCases();
    }

    void initialise();

    return () => {
      active = false;
    };
  }, [router, loadCases]);

  async function submitSupportCase(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(
        "/api/support/cases",
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            category: form.category,
            subject: form.subject,
            description: form.description,
          }),
        },
      );

      const payload = (await response
        .json()
        .catch(() => ({}))) as {
        case?: { id?: string };
        error?: string;
      };

      if (response.status === 401) {
        router.replace("/auth");
        return;
      }

      if (!response.ok) {
        throw new Error(
          payload.error ?? "Unable to submit your request.",
        );
      }

      setForm({
        category: "technical_issue",
        subject: "",
        description: "",
      });

      setSuccess(
        "Your support request has been submitted.",
      );

      await loadCases();
    } catch (submitError) {
      console.error(
        "Failed to submit Agore support request:",
        submitError,
      );

      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to submit your request.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (checkingAuth) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--background)] text-[var(--muted)]">
        <div className="flex items-center gap-3 text-sm">
          <LoaderCircle className="animate-spin" size={18} />
          Loading your support space…
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto w-full max-w-6xl px-4 pb-12 pt-5 sm:px-6 sm:pt-8 lg:px-8">
        <header className="flex items-center justify-between gap-4 border-b border-[var(--border)] pb-5">
          <Link
            href="/settings"
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3.5 text-sm font-medium transition hover:border-[var(--accent)]"
          >
            <ArrowLeft size={16} />
            <span>Settings</span>
          </Link>

          <Link
            href="/home"
            className="text-lg font-bold tracking-[-0.055em]"
            aria-label="Agoré home"
          >
            Agoré<span className="text-[var(--accent)]">.</span>
          </Link>
        </header>

        <section className="relative mt-7 overflow-hidden rounded-[2rem] border border-[var(--border)] bg-[var(--surface)]">
          <div className="pointer-events-none absolute -right-14 -top-24 h-64 w-64 rounded-full border-[35px] border-[var(--accent-soft)] opacity-80" />
          <div className="pointer-events-none absolute -bottom-20 right-[26%] h-40 w-40 rounded-full border border-[var(--border)]" />

          <div className="relative px-5 py-8 sm:px-8 sm:py-10">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <LifeBuoy size={22} />
            </span>

            <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
              Agoré · Help centre
            </p>

            <h1 className="mt-2 max-w-2xl text-3xl font-semibold tracking-[-0.06em] sm:text-4xl">
              Let’s work through it.
            </h1>

            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)] sm:text-base sm:leading-7">
              Tell us what happened, share enough detail
              to investigate, and keep your requests and
              replies in one place.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
              <span className="rounded-full border border-[var(--border)] px-3 py-1.5">
                Private to your account
              </span>
              <span className="rounded-full border border-[var(--border)] px-3 py-1.5">
                Track request status
              </span>
            </div>
          </div>
        </section>

        {error ? (
          <div
            role="alert"
            className="mt-5 flex flex-col gap-3 rounded-2xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <p>{error}</p>
            <button
              type="button"
              onClick={() => void loadCases()}
              className="inline-flex min-h-9 items-center justify-center gap-2 self-start rounded-full border border-[var(--danger)]/30 px-3 font-semibold sm:self-auto"
            >
              <RefreshCw size={14} />
              Retry loading
            </button>
          </div>
        ) : null}

        {success ? (
          <div
            role="status"
            className="mt-5 flex items-start gap-3 rounded-2xl border border-[var(--success)]/25 bg-[var(--success-soft)] p-4 text-sm text-[var(--success)]"
          >
            <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
            <p>{success}</p>
          </div>
        ) : null}

        <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start">
          <section
            id="new-request"
            className="rounded-[1.8rem] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-muted)]">
                <Plus size={19} />
              </span>

              <div>
                <h2 className="text-lg font-semibold tracking-[-0.03em]">
                  Open a support request
                </h2>
                <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                  Give your request a clear subject and
                  describe the issue.
                </p>
              </div>
            </div>

            <form
              onSubmit={submitSupportCase}
              className="mt-6 space-y-5"
            >
              <div>
                <label
                  htmlFor="support-category"
                  className="mb-2 block text-sm font-semibold"
                >
                  What do you need help with?
                </label>

                <select
                  id="support-category"
                  value={form.category}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      category: event.target.value as SupportCategory,
                    }))
                  }
                  disabled={submitting}
                  className="min-h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3.5 text-sm outline-none transition focus:border-[var(--accent)] disabled:opacity-60"
                >
                  {categories.map((category) => (
                    <option
                      key={category.value}
                      value={category.value}
                    >
                      {category.label} — {category.description}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="support-subject"
                  className="mb-2 block text-sm font-semibold"
                >
                  Subject
                </label>

                <input
                  id="support-subject"
                  type="text"
                  minLength={5}
                  maxLength={160}
                  required
                  value={form.subject}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      subject: event.target.value,
                    }))
                  }
                  disabled={submitting}
                  placeholder="A short description of the issue"
                  className="min-h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3.5 text-sm outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)] disabled:opacity-60"
                />

                <p className="mt-1.5 text-right text-[11px] text-[var(--muted)]">
                  {form.subject.length}/160
                </p>
              </div>

              <div>
                <label
                  htmlFor="support-description"
                  className="mb-2 block text-sm font-semibold"
                >
                  Details
                </label>

                <textarea
                  id="support-description"
                  minLength={10}
                  maxLength={5000}
                  required
                  rows={6}
                  value={form.description}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  disabled={submitting}
                  placeholder="What happened? What did you expect to happen? Include any useful context."
                  className="w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--background)] px-3.5 py-3 text-sm leading-6 outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)] disabled:opacity-60"
                />

                <p className="mt-1.5 text-right text-[11px] text-[var(--muted)]">
                  {form.description.length}/5000
                </p>
              </div>

              <button
                type="submit"
                disabled={
                  submitting ||
                  form.subject.trim().length < 5 ||
                  form.description.trim().length < 10
                }
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--foreground)] px-5 text-sm font-semibold text-[var(--background)] transition hover:bg-[var(--accent)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <LoaderCircle
                      size={17}
                      className="animate-spin"
                    />
                    Submitting request…
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    Submit support request
                  </>
                )}
              </button>

              <p className="text-xs leading-5 text-[var(--muted)]">
                Please do not include passwords, authentication
                codes, or other secrets in your message.
              </p>
            </form>
          </section>

          <section className="min-w-0 rounded-[1.8rem] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-muted)]">
                  <MessageSquareText size={19} />
                </span>

                <div>
                  <h2 className="text-lg font-semibold tracking-[-0.03em]">
                    Your requests
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                    A record of the support cases you have opened.
                  </p>
                </div>
              </div>

              <button
                type="button"
                aria-label="Refresh support requests"
                onClick={() => void loadCases()}
                disabled={loadingCases}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] transition hover:border-[var(--accent)] disabled:opacity-50"
              >
                <RefreshCw
                  size={15}
                  className={
                    loadingCases ? "animate-spin" : ""
                  }
                />
              </button>
            </div>

            <div className="mt-5">
              {loadingCases ? (
                <div className="flex min-h-44 flex-col items-center justify-center gap-3 text-sm text-[var(--muted)]">
                  <LoaderCircle
                    size={21}
                    className="animate-spin"
                  />
                  Loading your requests…
                </div>
              ) : cases.length === 0 ? (
                <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] px-5 py-8 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-muted)] text-[var(--muted)]">
                    <MessageSquareText size={22} />
                  </span>

                  <h3 className="mt-4 text-sm font-semibold">
                    No support requests yet
                  </h3>

                  <p className="mt-2 max-w-xs text-sm leading-6 text-[var(--muted)]">
                    When you submit a request, it will appear
                    here so you can keep track of it.
                  </p>

                  <a
                    href="#new-request"
                    className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent)]"
                  >
                    Create your first request
                    <ArrowRight size={15} />
                  </a>
                </div>
              ) : (
                <div className="divide-y divide-[var(--border)]">
                  {cases.map((supportCase) => (
                    <Link
                      key={supportCase.id}
                      href={`/support/${supportCase.id}`}
                      className="group block rounded-xl px-3 py-4 transition hover:bg-[var(--surface-muted)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="break-words text-sm font-semibold leading-5 transition group-hover:text-[var(--accent)]">
                            {supportCase.subject}
                          </p>

                          <p className="mt-1.5 text-xs text-[var(--muted)]">
                            {categories.find(
                              (category) =>
                                category.value === supportCase.category,
                            )?.label ?? "Support"}{" "}
                            <span aria-hidden="true">·</span>{" "}
                            {formatDate(supportCase.created_at)}
                          </p>
                        </div>

                        <ArrowRight
                          size={16}
                          className="mt-1 shrink-0 text-[var(--muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--accent)]"
                        />
                      </div>

                      <div className="mt-3">
                        <SupportStatusPill
                          status={supportCase.status}
                        />
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {!loadingCases && cases.length === 20 ? (
                <p className="mt-4 text-xs leading-5 text-[var(--muted)]">
                  Showing your 20 most recent requests.
                </p>
              ) : null}
            </div>
          </section>
        </div>

        <footer className="mt-8 border-t border-[var(--border)] pt-5 text-xs leading-5 text-[var(--muted)]">
          Agoré Support · Your requests are accessible only
          through your authenticated account.
        </footer>
      </div>
    </main>
  );
}
