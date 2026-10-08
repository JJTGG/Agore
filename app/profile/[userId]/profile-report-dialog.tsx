"use client";

import {
  AlertTriangle,
  Check,
  Loader2,
  X,
} from "lucide-react";
import {
  useEffect,
  useState,
} from "react";

type ProfileReportDialogProps = {
  userId: string;
  displayName: string;
  open: boolean;
  onClose: () => void;
};

const REPORT_REASONS = [
  "Spam",
  "Harassment or bullying",
  "Impersonation",
  "Hate or hateful conduct",
  "Threats or violence",
  "Inappropriate or sexual content",
  "Scam or fraud",
  "Something else",
] as const;

export default function ProfileReportDialog({
  userId,
  displayName,
  open,
  onClose,
}: ProfileReportDialogProps) {
  const [
    reason,
    setReason,
  ] = useState("");

  const [
    details,
    setDetails,
  ] = useState("");

  const [
    submitting,
    setSubmitting,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const [
    submitted,
    setSubmitted,
  ] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setReason("");
    setDetails("");
    setError("");
    setSubmitted(false);
    setSubmitting(false);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(
      event: KeyboardEvent,
    ) {
      if (
        event.key === "Escape" &&
        !submitting
      ) {
        onClose();
      }
    }

    window.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () =>
      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );
  }, [
    onClose,
    open,
    submitting,
  ]);

  async function submitReport() {
    if (
      !userId ||
      !reason ||
      submitting
    ) {
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const response =
        await fetch(
          `/api/users/${encodeURIComponent(
            userId,
          )}/report`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              reason,
              details:
                details.trim() ||
                null,
            }),
          },
        );

      const data =
        await response
          .json()
          .catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.error ??
            "Unable to submit the report.",
        );
      }

      setSubmitted(true);
    } catch (requestError) {
      setError(
        requestError instanceof
          Error
          ? requestError.message
          : "Unable to submit the report.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function closeOnBackdrop(
    event: React.MouseEvent<HTMLDivElement>,
  ) {
    if (
      event.target ===
      event.currentTarget &&
      !submitting
    ) {
      onClose();
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-report-title"
      onMouseDown={
        closeOnBackdrop
      }
    >
      <section className="w-full max-w-lg overflow-hidden rounded-t-[1.75rem] border border-[var(--border)] bg-[var(--surface)] shadow-2xl sm:rounded-[1.75rem]">
        <header className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-5 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--danger-soft)] text-[var(--danger)]">
              <AlertTriangle size={18} />
            </div>

            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--danger)]">
                Moderation
              </p>

              <h2
                id="profile-report-title"
                className="mt-1 text-lg font-bold tracking-[-0.03em]"
              >
                Report {displayName}
              </h2>

              <p className="mt-1 text-sm leading-5 text-[var(--muted)]">
                Tell us what is wrong with this profile.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close report dialog"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X size={17} />
          </button>
        </header>

        {submitted ? (
          <div className="px-5 py-10 text-center sm:px-6">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--success-soft)] text-[var(--success)]">
              <Check size={24} />
            </div>

            <h3 className="mt-5 text-base font-semibold">
              Report submitted
            </h3>

            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--muted)]">
              Thanks for helping keep Agoré safe. The report has been sent for review.
            </p>

            <button
              type="button"
              onClick={onClose}
              className="mt-6 inline-flex items-center justify-center rounded-full bg-[var(--foreground)] px-5 py-2.5 text-sm font-semibold text-[var(--background)] transition hover:bg-[var(--accent)] hover:text-white"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="px-5 py-5 sm:px-6">
            <fieldset>
              <legend className="text-sm font-semibold">
                Why are you reporting this profile?
              </legend>

              <div className="mt-3 grid gap-2">
                {REPORT_REASONS.map(
                  (reportReason) => (
                    <label
                      key={reportReason}
                      className={[
                        "flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition",
                        reason ===
                        reportReason
                          ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                          : "border-[var(--border)] hover:bg-[var(--surface-muted)]",
                      ].join(" ")}
                    >
                      <input
                        type="radio"
                        name="profile-report-reason"
                        value={
                          reportReason
                        }
                        checked={
                          reason ===
                          reportReason
                        }
                        onChange={(
                          event,
                        ) =>
                          setReason(
                            event.target
                              .value,
                          )
                        }
                        className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                      />

                      <span className="text-sm leading-5">
                        {
                          reportReason
                        }
                      </span>
                    </label>
                  ),
                )}
              </div>
            </fieldset>

            <div className="mt-5">
              <label
                htmlFor="profile-report-details"
                className="text-sm font-semibold"
              >
                Additional details
                <span className="ml-1 font-normal text-[var(--muted)]">
                  (optional)
                </span>
              </label>

              <textarea
                id="profile-report-details"
                value={details}
                onChange={(
                  event,
                ) =>
                  setDetails(
                    event.target.value,
                  )
                }
                maxLength={2000}
                rows={4}
                placeholder="Add context that could help the review."
                className="mt-2 w-full resize-none rounded-2xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm leading-6 outline-none transition focus:border-[var(--accent)]"
              />

              <div className="mt-1 flex justify-end">
                <span className="text-[11px] tabular-nums text-[var(--muted)]">
                  {details.length}/2000
                </span>
              </div>
            </div>

            {error ? (
              <div className="mt-4 rounded-2xl border border-[var(--danger)]/20 bg-[var(--danger-soft)] px-4 py-3">
                <p className="text-sm font-medium text-[var(--danger)]">
                  {error}
                </p>
              </div>
            ) : null}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="inline-flex items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() =>
                  void submitReport()
                }
                disabled={
                  submitting ||
                  !reason
                }
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--danger)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2
                    size={16}
                    className="animate-spin"
                  />
                ) : (
                  <AlertTriangle
                    size={16}
                  />
                )}

                {submitting
                  ? "Submitting…"
                  : "Submit report"}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}