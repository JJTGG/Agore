"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  BadgeCheck,
  History,
  RefreshCw,
  Search,
  ShieldCheck,
  UserPlus,
  UserRoundX,
  Users,
  XCircle,
} from "lucide-react";

type View = "staff" | "verification" | "audit";

type StaffRole =
  | "founder"
  | "super_admin"
  | "platform_admin"
  | "moderator"
  | "support_staff"
  | "analyst";

type GrantableRole = Exclude<StaffRole, "founder">;
type VerificationKind = "agore_official" | "paid";

type Account = {
  id: string;
  display_name: string;
  username: string;
  account_type: string;
  account_status: string;
  created_at: string;
};

type StaffMember = Account & {
  role: StaffRole;
  is_active: boolean;
};

type VerificationGrant = {
  verification_kind: VerificationKind;
  verified_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  granted_by: string | null;
  internal_note: string | null;
};

type VerificationAccount = Account & {
  verification: VerificationGrant | null;
};

type AuditEvent = {
  id: string;
  created_at: string;
  actor_username: string | null;
  actor_display_name: string | null;
  action_type: string;
  target_type: string;
  target_id: string;
  target_username: string | null;
  target_display_name: string | null;
  metadata: Record<string, unknown>;
};

type Payload = {
  error?: string;
  message?: string;
  staff?: StaffMember[];
  candidates?: Account[];
  verifications?: VerificationAccount[];
  events?: AuditEvent[];
};

type BadgeDraft = {
  kind: VerificationKind;
  expiresOn: string;
  note: string;
};

const roleOptions: {
  value: GrantableRole;
  label: string;
}[] = [
  { value: "super_admin", label: "Super Admin" },
  { value: "platform_admin", label: "Platform Admin" },
  { value: "moderator", label: "Moderator" },
  { value: "support_staff", label: "Support Staff" },
  { value: "analyst", label: "Analyst" },
];

const roleLabels: Record<StaffRole, string> = {
  founder: "Founder",
  super_admin: "Super Admin",
  platform_admin: "Platform Admin",
  moderator: "Moderator",
  support_staff: "Support Staff",
  analyst: "Analyst",
};

const fieldClass =
  "mt-1.5 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)]";

const buttonClass =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

const primaryClass =
  buttonClass + " bg-[var(--accent)] text-white hover:opacity-90";

const secondaryClass =
  buttonClass + " border border-[var(--border)] hover:bg-[var(--surface-muted)]";

const dangerClass =
  buttonClass + " border border-[var(--danger)]/30 text-[var(--danger)] hover:bg-[var(--danger-soft)]";

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

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

function Status({ value }: { value: string }) {
  const positive =
    value === "active" || value === "granted";

  const negative =
    value === "disabled" ||
    value === "revoked" ||
    value === "expired";

  const style = positive
    ? "border-[var(--success)]/30 bg-[var(--success-soft)] text-[var(--success)]"
    : negative
      ? "border-[var(--danger)]/30 bg-[var(--danger-soft)] text-[var(--danger)]"
      : "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--muted)]";

  return (
    <span
      className={
        "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold " +
        style
      }
    >
      {value.replaceAll("_", " ")}
    </span>
  );
}

function Label({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-sm font-medium"
    >
      {children}
    </label>
  );
}

export default function FounderToolsPage() {
  const [view, setView] = useState<View>("staff");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");

  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [candidates, setCandidates] = useState<Account[]>([]);
  const [verifications, setVerifications] =
    useState<VerificationAccount[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);

  const [roleDrafts, setRoleDrafts] =
    useState<Record<string, GrantableRole>>({});

  const [badgeDrafts, setBadgeDrafts] =
    useState<Record<string, BadgeDraft>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({ view });

      if (query) {
        params.set("q", query);
      }

      const response = await fetch(
        "/api/admin/founder-tools?" + params.toString(),
        {
          cache: "no-store",
          credentials: "same-origin",
        },
      );

      const payload = (await response
        .json()
        .catch(() => ({}))) as Payload;

      if (response.status === 401) {
        window.location.assign("/auth");
        return;
      }

      if (response.status === 403) {
        throw new Error("Founder access required.");
      }

      if (!response.ok) {
        throw new Error(
          payload.error ?? "Unable to load Founder tools.",
        );
      }

      if (view === "staff") {
        const nextStaff = payload.staff ?? [];
        const nextCandidates = payload.candidates ?? [];

        setStaff(nextStaff);
        setCandidates(nextCandidates);

        setRoleDrafts((old) => {
          const next = { ...old };

          for (const member of nextStaff) {
            if (member.role !== "founder") {
              next[member.id] = member.role;
            }
          }

          for (const candidate of nextCandidates) {
            if (!next[candidate.id]) {
              next[candidate.id] = "moderator";
            }
          }

          return next;
        });
      } else if (view === "verification") {
        const rows = payload.verifications ?? [];

        setVerifications(rows);

        setBadgeDrafts((old) => {
          const next = { ...old };

          for (const account of rows) {
            if (!next[account.id]) {
              const grant = account.verification;

              next[account.id] = {
                kind:
                  grant?.verification_kind ?? "agore_official",
                expiresOn:
                  grant?.expires_at?.slice(0, 10) ?? "",
                note: grant?.internal_note ?? "",
              };
            }
          }

          return next;
        });
      } else {
        setEvents(payload.events ?? []);
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to load Founder tools.",
      );
    } finally {
      setLoading(false);
    }
  }, [view, query]);

  useEffect(() => {
    void load();
  }, [load]);

  async function mutate(
    body: Record<string, unknown>,
    busyKey: string,
    confirmation: string,
  ) {
    if (
      confirmation &&
      !window.confirm(confirmation)
    ) {
      return;
    }

    setBusyId(busyKey);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        "/api/admin/founder-tools",
        {
          method: "PATCH",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );

      const payload = (await response
        .json()
        .catch(() => ({}))) as Payload;

      if (response.status === 401) {
        window.location.assign("/auth");
        return;
      }

      if (!response.ok) {
        throw new Error(
          payload.error ?? "The operation failed.",
        );
      }

      setNotice(payload.message ?? "Change saved.");
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The operation failed.",
      );
    } finally {
      setBusyId("");
    }
  }

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(searchInput.trim().slice(0, 60));
  }

  function patchRole(
    id: string,
    role: GrantableRole,
  ) {
    setRoleDrafts((old) => ({
      ...old,
      [id]: role,
    }));
  }

  function draftFor(
    account: VerificationAccount,
  ): BadgeDraft {
    return (
      badgeDrafts[account.id] ?? {
        kind:
          account.verification?.verification_kind ??
          "agore_official",
        expiresOn:
          account.verification?.expires_at?.slice(0, 10) ??
          "",
        note:
          account.verification?.internal_note ?? "",
      }
    );
  }

  function patchBadge(
    id: string,
    patch: Partial<BadgeDraft>,
  ) {
    setBadgeDrafts((old) => ({
      ...old,
      [id]: {
        ...(old[id] ?? {
          kind: "agore_official",
          expiresOn: "",
          note: "",
        }),
        ...patch,
      },
    }));
  }

  const headings: Record<
    View,
    { title: string; description: string }
  > = {
    staff: {
      title: "Staff & role delegation",
      description:
        "Grant roles, change responsibilities, or revoke access. Founder memberships cannot be altered here.",
    },
    verification: {
      title: "Verification & badges",
      description:
        "Manage Agoré Official and account-verified badges using the existing verification records.",
    },
    audit: {
      title: "Administrative audit history",
      description:
        "Review who performed privileged actions, which accounts they affected, and when changes occurred.",
    },
  };

  const heading = headings[view];

  return (
    <main className="min-h-dvh bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto w-full max-w-6xl px-4 pb-12 pt-5 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] pb-5">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              aria-label="Back to Administration"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)]"
            >
              <ArrowLeft size={18} />
            </Link>

            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck
                  size={20}
                  className="text-[var(--accent)]"
                />
                <h1 className="text-xl font-semibold tracking-tight">
                  Founder tools
                </h1>
              </div>

              <p className="mt-1 text-xs text-[var(--muted)]">
                Restricted platform operations
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            aria-label="Refresh current view"
            className={secondaryClass}
          >
            <RefreshCw
              size={15}
              className={loading ? "animate-spin" : ""}
            />
            Refresh
          </button>
        </header>

        <nav
          aria-label="Founder tools sections"
          className="flex gap-2 overflow-x-auto border-b border-[var(--border)] py-3"
        >
          {(
            [
              {
                value: "staff",
                label: "Staff & roles",
                icon: Users,
              },
              {
                value: "verification",
                label: "Verification & badges",
                icon: BadgeCheck,
              },
              {
                value: "audit",
                label: "Audit history",
                icon: History,
              },
            ] as const
          ).map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.value}
                type="button"
                onClick={() => {
                  setError("");
                  setNotice("");
                  setView(item.value);
                }}
                aria-current={
                  view === item.value ? "page" : undefined
                }
                className={[
                  "inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold",
                  view === item.value
                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "text-[var(--muted)] hover:bg-[var(--surface)]",
                ].join(" ")}
              >
                <Icon size={16} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <section className="mt-6 space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
              Founder access
            </p>

            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              {heading.title}
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
              {heading.description}
            </p>
          </div>

          {error ? (
            <div
              role="alert"
              className="rounded-2xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]"
            >
              {error}
            </div>
          ) : null}

          {notice ? (
            <div
              role="status"
              className="rounded-2xl border border-[var(--success)]/25 bg-[var(--success-soft)] px-4 py-3 text-sm text-[var(--success)]"
            >
              {notice}
            </div>
          ) : null}

          {view !== "audit" ? (
            <form
              onSubmit={search}
              className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:flex-row sm:items-end"
            >
              <div className="min-w-0 flex-1">
                <Label htmlFor="founder-search">
                  Search username or display name
                </Label>

                <div className="mt-1.5 flex h-11 items-center gap-2 rounded-xl border border-[var(--border)] px-3">
                  <Search
                    size={17}
                    className="shrink-0 text-[var(--muted)]"
                  />

                  <input
                    id="founder-search"
                    value={searchInput}
                    onChange={(event) =>
                      setSearchInput(event.target.value)
                    }
                    maxLength={60}
                    placeholder="Enter at least 2 characters…"
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                className={primaryClass}
              >
                <Search size={15} />
                Search
              </button>

              <button
                type="button"
                className={secondaryClass}
                onClick={() => {
                  setSearchInput("");
                  setQuery("");
                }}
              >
                Clear
              </button>
            </form>
          ) : (
            <p className="text-sm text-[var(--muted)]">
              Showing the most recent 75 administrative events.
            </p>
          )}

          {loading ? (
            <div className="flex items-center gap-3 py-8 text-sm text-[var(--muted)]">
              <RefreshCw size={18} className="animate-spin" />
              Loading…
            </div>
          ) : null}

          {!loading && view === "staff" ? (
            <>
              <div>
                <h3 className="text-lg font-semibold">
                  Current staff memberships
                </h3>

                <p className="mt-1 text-sm text-[var(--muted)]">
                  Access revocation preserves staff records. Founder memberships are protected.
                </p>
              </div>

              <div className="space-y-3">
                {staff.length === 0 ? (
                  <p className="rounded-2xl border border-[var(--border)] p-5 text-sm text-[var(--muted)]">
                    No staff memberships found.
                  </p>
                ) : (
                  staff.map((member) => {
                    const busy = busyId.startsWith(
                      member.id + ":",
                    );

                    const protectedFounder =
                      member.role === "founder";

                    const draftRole =
                      roleDrafts[member.id] ?? "moderator";

                    return (
                      <article
                        key={member.id}
                        className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5"
                      >
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="truncate font-semibold">
                              {member.display_name}
                            </p>

                            <p className="mt-1 text-sm text-[var(--muted)]">
                              @{member.username} · {member.account_type}
                            </p>

                            <div className="mt-2 flex flex-wrap gap-2">
                              <Status value={roleLabels[member.role]} />
                              <Status
                                value={
                                  member.is_active
                                    ? "active"
                                    : "inactive"
                                }
                              />
                              <Status value={member.account_status} />
                            </div>
                          </div>

                          {protectedFounder ? (
                            <span className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)]">
                              <ShieldCheck size={16} />
                              Protected Founder
                            </span>
                          ) : (
                            <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-56">
                              <Label htmlFor={"role-" + member.id}>
                                Administrative role
                              </Label>

                              <select
                                id={"role-" + member.id}
                                value={draftRole}
                                onChange={(event) =>
                                  patchRole(
                                    member.id,
                                    event.target.value as GrantableRole,
                                  )
                                }
                                className={fieldClass}
                              >
                                {roleOptions.map((option) => (
                                  <option
                                    key={option.value}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </option>
                                ))}
                              </select>

                              {member.is_active ? (
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    disabled={
                                      busy ||
                                      draftRole === member.role
                                    }
                                    className={primaryClass}
                                    onClick={() =>
                                      void mutate(
                                        {
                                          type: "staff",
                                          userId: member.id,
                                          action: "change_role",
                                          role: draftRole,
                                          note:
                                            "Role updated in Agoré Founder tools.",
                                        },
                                        member.id + ":role",
                                        "Change @" +
                                          member.username +
                                          " from " +
                                          roleLabels[member.role] +
                                          " to " +
                                          roleLabels[draftRole] +
                                          "?",
                                      )
                                    }
                                  >
                                    Save role
                                  </button>

                                  <button
                                    type="button"
                                    disabled={busy}
                                    className={dangerClass}
                                    onClick={() =>
                                      void mutate(
                                        {
                                          type: "staff",
                                          userId: member.id,
                                          action: "revoke",
                                          note:
                                            "Staff access revoked in Agoré Founder tools.",
                                        },
                                        member.id + ":revoke",
                                        "Revoke staff access for @" +
                                          member.username +
                                          "?",
                                      )
                                    }
                                  >
                                    <UserRoundX size={15} />
                                    Revoke
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  disabled={busy}
                                  className={primaryClass}
                                  onClick={() =>
                                    void mutate(
                                      {
                                        type: "staff",
                                        userId: member.id,
                                        action: "grant",
                                        role: draftRole,
                                        note:
                                          "Staff access reactivated in Agoré Founder tools.",
                                      },
                                      member.id + ":grant",
                                      "Reactivate @" +
                                        member.username +
                                        " as " +
                                        roleLabels[draftRole] +
                                        "?",
                                    )
                                  }
                                >
                                  <UserPlus size={15} />
                                  Reactivate access
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })
                )}
              </div>

              <div>
                <h3 className="text-lg font-semibold">
                  Grant a staff role
                </h3>

                <p className="mt-1 text-sm text-[var(--muted)]">
                  Search active accounts to add new staff. Founder status cannot be granted here.
                </p>
              </div>

              {query.length < 2 ? (
                <p className="rounded-2xl border border-dashed border-[var(--border)] p-5 text-sm text-[var(--muted)]">
                  Search for an account to find eligible staff candidates.
                </p>
              ) : candidates.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-[var(--border)] p-5 text-sm text-[var(--muted)]">
                  No eligible accounts matched. Existing staff memberships are listed above.
                </p>
              ) : (
                <div className="space-y-3">
                  {candidates.map((candidate) => {
                    const draftRole =
                      roleDrafts[candidate.id] ?? "moderator";

                    const busy = busyId.startsWith(
                      candidate.id + ":",
                    );

                    return (
                      <article
                        key={candidate.id}
                        className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-semibold">
                            {candidate.display_name}
                          </p>

                          <p className="mt-1 text-sm text-[var(--muted)]">
                            @{candidate.username} · {candidate.account_type}
                          </p>
                        </div>

                        <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-56">
                          <Label htmlFor={"candidate-role-" + candidate.id}>
                            Role to grant
                          </Label>

                          <select
                            id={"candidate-role-" + candidate.id}
                            value={draftRole}
                            onChange={(event) =>
                              patchRole(
                                candidate.id,
                                event.target.value as GrantableRole,
                              )
                            }
                            className={fieldClass}
                          >
                            {roleOptions.map((option) => (
                              <option
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </option>
                            ))}
                          </select>

                          <button
                            type="button"
                            disabled={busy}
                            className={primaryClass}
                            onClick={() =>
                              void mutate(
                                {
                                  type: "staff",
                                  userId: candidate.id,
                                  action: "grant",
                                  role: draftRole,
                                  note:
                                    "Staff access granted in Agoré Founder tools.",
                                },
                                candidate.id + ":grant",
                                "Grant @" +
                                  candidate.username +
                                  " the " +
                                  roleLabels[draftRole] +
                                  " role?",
                              )
                            }
                          >
                            <UserPlus size={15} />
                            Grant role
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          ) : null}

          {!loading && view === "verification" ? (
            <>
              <p className="text-sm text-[var(--muted)]">
                Account type controls badge shape and colour. Verification records control whether
                the badge appears. Private notes are only returned to this Founder-only view.
              </p>

              <div className="space-y-3">
                {verifications.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-[var(--border)] p-5 text-sm text-[var(--muted)]">
                    No matching accounts.
                  </p>
                ) : (
                  verifications.map((account) => {
                    const grant = account.verification;
                    const draft = draftFor(account);

                    const expired =
                      grant?.verification_kind === "paid" &&
                      Boolean(grant.expires_at) &&
                      Date.parse(grant.expires_at as string) <=
                        Date.now();

                    const activeGrant = Boolean(
                      grant &&
                        !grant.revoked_at &&
                        !expired &&
                        (grant.verification_kind === "agore_official" ||
                          Boolean(grant.expires_at)),
                    );

                    const status = !grant
                      ? "no badge"
                      : grant.revoked_at
                        ? "revoked"
                        : expired
                          ? "expired"
                          : activeGrant
                            ? "granted"
                            : "inactive";

                    const busy = busyId.startsWith(
                      account.id + ":",
                    );

                    const unavailable =
                      account.account_status !== "active";

                    const expiryValue = draft.expiresOn
                      ? new Date(
                          draft.expiresOn + "T23:59:59.999Z",
                        ).getTime()
                      : 0;

                    const expiryInvalid =
                      draft.kind === "paid" &&
                      (!draft.expiresOn ||
                        !Number.isFinite(expiryValue) ||
                        expiryValue <= Date.now());

                    return (
                      <article
                        key={account.id}
                        className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5"
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 lg:flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold">
                                {account.display_name}
                              </p>
                              <Status value={status} />
                              <Status value={account.account_status} />
                            </div>

                            <p className="mt-1 text-sm text-[var(--muted)]">
                              @{account.username} · {account.account_type}
                            </p>

                            {grant ? (
                              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                                Last granted {formatDate(grant.verified_at)}
                                {" · "}Expires {formatDate(grant.expires_at)}
                                {" · "}
                                {grant.revoked_at
                                  ? "Revoked " + formatDate(grant.revoked_at)
                                  : "Not revoked"}
                              </p>
                            ) : (
                              <p className="mt-2 text-xs text-[var(--muted)]">
                                No verification record.
                              </p>
                            )}
                          </div>

                          <div className="grid w-full gap-3 lg:max-w-md lg:flex-1">
                            <div>
                              <Label htmlFor={"badge-kind-" + account.id}>
                                Badge type
                              </Label>

                              <select
                                id={"badge-kind-" + account.id}
                                value={draft.kind}
                                onChange={(event) =>
                                  patchBadge(account.id, {
                                    kind: event.target.value as VerificationKind,
                                  })
                                }
                                className={fieldClass}
                              >
                                <option value="agore_official">
                                  Agoré Official (permanent)
                                </option>
                                <option value="paid">
                                  Account verified (expires)
                                </option>
                              </select>
                            </div>

                            {draft.kind === "paid" ? (
                              <div>
                                <Label htmlFor={"expiry-" + account.id}>
                                  Expiry date (required)
                                </Label>

                                <input
                                  id={"expiry-" + account.id}
                                  type="date"
                                  min={new Date().toISOString().slice(0, 10)}
                                  value={draft.expiresOn}
                                  onChange={(event) =>
                                    patchBadge(account.id, {
                                      expiresOn: event.target.value,
                                    })
                                  }
                                  className={fieldClass}
                                />
                              </div>
                            ) : null}

                            <div>
                              <Label htmlFor={"note-" + account.id}>
                                Private administrative note (optional)
                              </Label>

                              <textarea
                                id={"note-" + account.id}
                                rows={2}
                                maxLength={1000}
                                value={draft.note}
                                onChange={(event) =>
                                  patchBadge(account.id, {
                                    note: event.target.value,
                                  })
                                }
                                placeholder="Reason for this verification decision"
                                className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm"
                              />
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={
                                  busy || unavailable || expiryInvalid
                                }
                                className={primaryClass}
                                onClick={() => {
                                  const expiresAt =
                                    draft.kind === "paid"
                                      ? new Date(
                                          draft.expiresOn +
                                            "T23:59:59.999Z",
                                        ).toISOString()
                                      : null;

                                  void mutate(
                                    {
                                      type: "verification",
                                      userId: account.id,
                                      action: "grant",
                                      kind: draft.kind,
                                      expiresAt,
                                      note: draft.note,
                                    },
                                    account.id + ":grant",
                                    (grant && !grant.revoked_at
                                      ? "Update"
                                      : "Grant") +
                                      " the " +
                                      (draft.kind === "paid"
                                        ? "account-verified"
                                        : "Agoré Official") +
                                      " badge for @" +
                                      account.username +
                                      "?",
                                  );
                                }}
                              >
                                {grant && !grant.revoked_at
                                  ? "Update badge"
                                  : "Grant badge"}
                              </button>

                              <button
                                type="button"
                                disabled={
                                  busy ||
                                  !grant ||
                                  Boolean(grant.revoked_at)
                                }
                                className={dangerClass}
                                onClick={() =>
                                  void mutate(
                                    {
                                      type: "verification",
                                      userId: account.id,
                                      action: "revoke",
                                      note: draft.note,
                                    },
                                    account.id + ":revoke",
                                    "Revoke the current verification badge for @" +
                                      account.username +
                                      "?",
                                  )
                                }
                              >
                                <XCircle size={15} />
                                Revoke badge
                              </button>
                            </div>

                            {unavailable ? (
                              <p className="text-xs text-[var(--muted)]">
                                Badges can only be granted to active accounts. Revocation remains available.
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </>
          ) : null}

          {!loading && view === "audit" ? (
            <div className="space-y-3">
              {events.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-[var(--border)] p-5 text-sm text-[var(--muted)]">
                  No administrative events recorded yet.
                </p>
              ) : (
                events.map((event) => (
                  <article
                    key={event.id}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Status value={event.action_type} />
                          <Status value={event.target_type} />
                        </div>

                        <p className="mt-2 text-sm font-semibold">
                          {event.actor_display_name ?? "Unknown actor"}
                          {event.actor_username
                            ? " (@" + event.actor_username + ")"
                            : ""}
                        </p>

                        <p className="mt-1 break-words text-sm text-[var(--muted)]">
                          Target:{" "}
                          {event.target_display_name
                            ? event.target_display_name +
                              (event.target_username
                                ? " (@" + event.target_username + ")"
                                : "")
                            : event.target_id}
                        </p>
                      </div>

                      <time className="shrink-0 text-xs text-[var(--muted)]">
                        {formatDate(event.created_at)}
                      </time>
                    </div>

                    {event.metadata &&
                    Object.keys(event.metadata).length > 0 ? (
                      <details className="mt-3 rounded-xl bg-[var(--surface-muted)] p-3">
                        <summary className="cursor-pointer text-sm font-medium">
                          Recorded details
                        </summary>

                        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs leading-5 text-[var(--muted)]">
                          {JSON.stringify(event.metadata, null, 2)}
                        </pre>
                      </details>
                    ) : null}
                  </article>
                ))
              )}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}