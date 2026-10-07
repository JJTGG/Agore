"use client";

import Link from "next/link";
import {
  FormEvent,
  useCallback,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bell,
  Check,
  ChevronRight,
  Compass,
  Home,
  Loader2,
  MessageCircle,
  MessageSquarePlus,
  Plus,
  RefreshCw,
  Search,
  Settings,
  X,
} from "lucide-react";
import AgoreAvatar from "@/components/agore-avatar";
import { createClient } from "@/lib/supabase/browser";

const supabase = createClient();

type Profile = {
  id: string;
  display_name: string;
  username: string;
  avatar_path: string | null;
};

type Conversation = {
  id: string;
  type: "direct" | "group";
  created_by: string;
  name: string | null;
  description: string | null;
  image_path: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
  membership: {
    role: string;
    joined_at: string;
    last_read_at: string | null;
  };
  participant: Profile | null;
  latest_message: {
    id: string;
    sender_id: string | null;
    content: string | null;
    created_at: string;
    preview: string;
  } | null;
  has_unread_messages: boolean;
};

type SearchPerson = {
  id: string;
  display_name: string;
  username: string;
  bio: string | null;
  avatar_path: string | null;
  created_at: string;
};

function formatConversationDate(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const now = new Date();

  const sameDay =
    now.getFullYear() === date.getFullYear() &&
    now.getMonth() === date.getMonth() &&
    now.getDate() === date.getDate();

  if (sameDay) {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function getConversationTitle(conversation: Conversation) {
  if (conversation.type === "group") {
    return conversation.name?.trim() || "Unnamed group";
  }

  return conversation.participant?.display_name || "Agoré user";
}

function getConversationSubtitle(conversation: Conversation) {
  if (conversation.type === "group") {
    return "Group conversation";
  }

  return conversation.participant
    ? `@${conversation.participant.username}`
    : "Direct conversation";
}

function getInitials(value: string) {
  return (
    value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "A"
  );
}

export default function MessagesPage() {
  const router = useRouter();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [realtimeNotice, setRealtimeNotice] = useState("");

  const [groupOpen, setGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [memberResults, setMemberResults] = useState<SearchPerson[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<SearchPerson[]>([]);
  const [searchingMembers, setSearchingMembers] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupError, setGroupError] = useState("");

  const [directOpen, setDirectOpen] = useState(false);
  const [directQuery, setDirectQuery] = useState("");
  const [directResults, setDirectResults] = useState<SearchPerson[]>([]);
  const [searchingDirect, setSearchingDirect] = useState(false);
  const [openingDirect, setOpeningDirect] = useState(false);
  const [directError, setDirectError] = useState("");

  const loadConversations = useCallback(
    async (manual = false, background = false) => {
      if (manual) {
        setRefreshing(true);
      } else if (!background) {
        setLoading(true);
      }

      if (!background) {
        setError("");
      }

      try {
        const response = await fetch("/api/conversations?limit=30", {
          cache: "no-store",
        });

        const data = await response.json();

        if (response.status === 401) {
          router.push("/auth");
          return;
        }

        if (!response.ok) {
          if (!background) {
            setError(
              data.error ?? "Unable to load your conversations.",
            );
          }
          return;
        }

        setConversations(
          Array.isArray(data.conversations)
            ? data.conversations
            : [],
        );

        if (background) {
          setRealtimeNotice("");
        }
      } catch {
        if (!background) {
          setError("Unable to load your conversations.");
        }
      } finally {
        if (manual) {
          setRefreshing(false);
        } else if (!background) {
          setLoading(false);
        }
      }
    },
    [router],
  );

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    const channel = supabase
      .channel("messages-hub")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        () => {
          void loadConversations(false, true);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
        },
        () => {
          void loadConversations(false, true);
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setRealtimeNotice("");
          return;
        }

        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT"
        ) {
          setRealtimeNotice(
            "Live updates are paused. Refresh to reconnect.",
          );
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadConversations]);

  async function searchMembers(value = memberQuery) {
    const query = value.trim();

    if (query.length < 2) {
      setMemberResults([]);
      return;
    }

    setSearchingMembers(true);
    setGroupError("");

    try {
      const response = await fetch(
        `/api/users/search?q=${encodeURIComponent(query)}&limit=20`,
        {
          cache: "no-store",
        },
      );

      const data = await response.json();

      if (response.status === 401) {
        router.push("/auth");
        return;
      }

      if (!response.ok) {
        setGroupError(
          data.error ?? "Unable to search people.",
        );
        setMemberResults([]);
        return;
      }

      setMemberResults(
        Array.isArray(data.people) ? data.people : [],
      );
    } catch {
      setGroupError("Unable to search people.");
      setMemberResults([]);
    } finally {
      setSearchingMembers(false);
    }
  }

  async function searchDirect(value = directQuery) {
    const query = value.trim();

    if (query.length < 2) {
      setDirectResults([]);
      return;
    }

    setSearchingDirect(true);
    setDirectError("");

    try {
      const response = await fetch(
        `/api/users/search?q=${encodeURIComponent(query)}&limit=20`,
        {
          cache: "no-store",
        },
      );

      const data = await response.json();

      if (response.status === 401) {
        router.push("/auth");
        return;
      }

      if (!response.ok) {
        setDirectError(
          data.error ?? "Unable to search people.",
        );
        setDirectResults([]);
        return;
      }

      setDirectResults(
        Array.isArray(data.people) ? data.people : [],
      );
    } catch {
      setDirectError("Unable to search people.");
      setDirectResults([]);
    } finally {
      setSearchingDirect(false);
    }
  }

  async function startDirectConversation(person: SearchPerson) {
    if (openingDirect) {
      return;
    }

    setOpeningDirect(true);
    setDirectError("");

    try {
      const response = await fetch("/api/conversations/direct", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: person.id,
        }),
      });

      const data = await response.json();

      if (response.status === 401) {
        router.push("/auth");
        return;
      }

      if (!response.ok) {
        setDirectError(
          data.error ?? "Unable to start the conversation.",
        );
        return;
      }

      if (!data.conversation?.id) {
        setDirectError(
          "The conversation could not be opened.",
        );
        return;
      }

      router.push(
        `/messages/${encodeURIComponent(data.conversation.id)}`,
      );
    } catch {
      setDirectError("Unable to start the conversation.");
    } finally {
      setOpeningDirect(false);
    }
  }

  function toggleMember(person: SearchPerson) {
    setGroupError("");

    setSelectedMembers((current) => {
      const exists = current.some(
        (member) => member.id === person.id,
      );

      if (exists) {
        return current.filter(
          (member) => member.id !== person.id,
        );
      }

      if (current.length >= 49) {
        setGroupError(
          "A group can have at most 50 members.",
        );
        return current;
      }

      return [...current, person];
    });
  }

  function removeSelectedMember(personId: string) {
    setSelectedMembers((current) =>
      current.filter(
        (member) => member.id !== personId,
      ),
    );
  }

  function resetGroupForm() {
    setGroupName("");
    setGroupDescription("");
    setMemberQuery("");
    setMemberResults([]);
    setSelectedMembers([]);
    setGroupError("");
    setCreatingGroup(false);
  }

  function closeGroupCreator() {
    if (creatingGroup) {
      return;
    }

    setGroupOpen(false);
    resetGroupForm();
  }

  function closeDirectCreator() {
    if (openingDirect) {
      return;
    }

    setDirectOpen(false);
    setDirectQuery("");
    setDirectResults([]);
    setDirectError("");
    setOpeningDirect(false);
  }

  async function handleCreateGroup(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const name = groupName.trim();
    const description = groupDescription.trim();

    if (!name) {
      setGroupError("Enter a group name.");
      return;
    }

    if (selectedMembers.length < 1) {
      setGroupError(
        "Select at least one other member.",
      );
      return;
    }

    setCreatingGroup(true);
    setGroupError("");

    try {
      const response = await fetch(
        "/api/conversations/group",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name,
            description,
            memberIds: selectedMembers.map(
              (member) => member.id,
            ),
          }),
        },
      );

      const data = await response.json();

      if (response.status === 401) {
        router.push("/auth");
        return;
      }

      if (!response.ok) {
        setGroupError(
          data.error ??
            "Unable to create the group.",
        );
        return;
      }

      if (!data.conversation?.id) {
        setGroupError(
          "The group was created without a conversation ID.",
        );
        return;
      }

      setGroupOpen(false);
      resetGroupForm();

      router.push(
        `/messages/${encodeURIComponent(
          data.conversation.id,
        )}`,
      );
    } catch {
      setGroupError("Unable to create the group.");
    } finally {
      setCreatingGroup(false);
    }
  }

  const navigationClass =
    "inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2 text-xs font-semibold text-[var(--muted)] transition hover:border-[var(--accent)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]";

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto min-h-screen w-full max-w-5xl px-4 pb-8 pt-5 sm:px-6 lg:px-8">
        <header className="mb-5 rounded-3xl border border-[var(--border)] bg-[var(--surface)] px-4 py-4 sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Link
                href="/home"
                aria-label="Back to Home"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted)] transition hover:border-[var(--accent)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
              >
                <ArrowLeft size={17} />
              </Link>

              <div className="min-w-0">
                <p className="truncate text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
                  Agoré
                </p>

                <h1 className="truncate text-lg font-semibold tracking-[-0.03em]">
                  Messages
                </h1>
              </div>
            </div>

            <div className="hidden items-center gap-2 sm:flex">
              <Link
                href="/home"
                className={navigationClass}
              >
                <Home size={15} />
                Home
              </Link>

              <Link
                href="/app/explore"
                className={navigationClass}
              >
                <Compass size={15} />
                Explore
              </Link>

              <Link
                href="/notifications"
                className={navigationClass}
              >
                <Bell size={15} />
                Alerts
              </Link>

              <Link
                href="/settings"
                className={navigationClass}
              >
                <Settings size={15} />
                Settings
              </Link>
            </div>

            <div className="sm:hidden">
              <Link
                href="/notifications"
                aria-label="Notifications"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] transition hover:border-[var(--accent)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
              >
                <Bell size={17} />
              </Link>
            </div>
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 sm:hidden">
            <Link
              href="/home"
              className={navigationClass}
            >
              <Home size={14} />
              Home
            </Link>

            <Link
              href="/app/explore"
              className={navigationClass}
            >
              <Compass size={14} />
              Explore
            </Link>

            <Link
              href="/notifications"
              className={navigationClass}
            >
              <Bell size={14} />
              Alerts
            </Link>

            <Link
              href="/settings"
              className={navigationClass}
            >
              <Settings size={14} />
              Settings
            </Link>
          </div>
        </header>

        <section className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="flex flex-col gap-4 border-b border-[var(--border)] px-5 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
                Conversations
              </p>

              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em]">
                Stay in touch.
              </h2>

              <p className="mt-1 max-w-xl text-sm leading-6 text-[var(--muted)]">
                Continue a direct conversation or move a group
                conversation forward.
              </p>

              {realtimeNotice ? (
                <p className="mt-2 text-xs font-medium text-[var(--muted)]">
                  {realtimeNotice}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setDirectOpen(true)}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)] hover:bg-[var(--surface-muted)]"
              >
                <MessageSquarePlus size={16} />
                New message
              </button>

              <button
                type="button"
                onClick={() => setGroupOpen(true)}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--accent)] px-4 text-sm font-semibold text-white transition hover:opacity-90"
              >
                <Plus size={16} />
                New group
              </button>

              <button
                type="button"
                onClick={() => void loadConversations(true)}
                disabled={refreshing || loading}
                aria-label="Refresh conversations"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw
                  size={16}
                  className={refreshing ? "animate-spin" : ""}
                />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="space-y-1 p-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="animate-pulse rounded-2xl px-4 py-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-[var(--surface-muted)]" />

                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="h-4 w-36 rounded bg-[var(--surface-muted)]" />
                      <div className="h-3 w-24 rounded bg-[var(--surface-muted)]" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="px-6 py-10 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                <MessageCircle size={20} />
              </div>

              <p className="mt-4 text-sm font-medium text-[var(--danger)]">
                {error}
              </p>

              <button
                type="button"
                onClick={() => void loadConversations(true)}
                className="mt-4 rounded-full bg-[var(--foreground)] px-4 py-2 text-sm font-semibold text-[var(--background)] transition hover:bg-[var(--accent)] hover:text-white"
              >
                Retry
              </button>
            </div>
          ) : conversations.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                <MessageCircle size={22} />
              </div>

              <h2 className="mt-5 text-lg font-semibold">
                No conversations yet
              </h2>

              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--muted)]">
                Start a direct conversation or create a group to begin
                messaging.
              </p>

              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setDirectOpen(true)}
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-5 py-2.5 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--surface-muted)]"
                >
                  <MessageSquarePlus size={16} />
                  New message
                </button>

                <button
                  type="button"
                  onClick={() => setGroupOpen(true)}
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                >
                  <Plus size={16} />
                  Create group
                </button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {conversations.map((conversation) => {
                const title = getConversationTitle(conversation);
                const subtitle = getConversationSubtitle(conversation);

                const preview =
                  conversation.latest_message?.preview ?? subtitle;

                const timestamp = formatConversationDate(
                  conversation.latest_message?.created_at ??
                    conversation.last_message_at ??
                    conversation.updated_at ??
                    conversation.created_at,
                );

                return (
                  <Link
                    key={conversation.id}
                    href={`/messages/${encodeURIComponent(
                      conversation.id,
                    )}`}
                    className="flex items-center gap-3 px-4 py-4 transition hover:bg-[var(--surface-muted)] sm:px-5"
                  >
                    <AgoreAvatar
                      avatarPath={
                        conversation.type === "group"
                          ? conversation.image_path
                          : conversation.participant?.avatar_path
                      }
                      name={title}
                      className="h-12 w-12 shrink-0"
                      textClassName="text-sm"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p
                          className={`truncate text-sm ${
                            conversation.has_unread_messages
                              ? "font-bold"
                              : "font-semibold"
                          }`}
                        >
                          {title}
                        </p>

                        <div className="flex shrink-0 items-center gap-2">
                          {conversation.has_unread_messages ? (
                            <span
                              aria-label="Unread messages"
                              className="h-2.5 w-2.5 rounded-full bg-[var(--accent)]"
                            />
                          ) : null}

                          <span className="text-xs text-[var(--muted)]">
                            {timestamp}
                          </span>
                        </div>
                      </div>

                      <p
                        className={`mt-1 truncate text-sm ${
                          conversation.has_unread_messages
                            ? "font-semibold text-[var(--foreground)]"
                            : "text-[var(--muted)]"
                        }`}
                      >
                        {preview}
                      </p>
                    </div>

                    <ChevronRight
                      size={17}
                      className="shrink-0 text-[var(--muted)]"
                    />
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {directOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-3 py-3 sm:items-center sm:px-5"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-message-title"
        >
          <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
            <header className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4 sm:px-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
                  Direct message
                </p>

                <h2
                  id="new-message-title"
                  className="mt-1 text-xl font-semibold tracking-[-0.03em]"
                >
                  Start a conversation
                </h2>
              </div>

              <button
                type="button"
                onClick={closeDirectCreator}
                disabled={openingDirect}
                aria-label="Close new message"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted)] transition hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X size={17} />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              <div className="relative">
                <Search
                  size={17}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
                />

                <input
                  value={directQuery}
                  onChange={(event) => {
                    const value = event.target.value;
                    setDirectQuery(value);

                    if (value.trim().length < 2) {
                      setDirectResults([]);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void searchDirect();
                    }
                  }}
                  maxLength={50}
                  autoFocus
                  placeholder="Search username or name…"
                  disabled={openingDirect}
                  className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] py-3 pl-10 pr-4 text-sm outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] disabled:cursor-not-allowed disabled:bg-[var(--surface-muted)]"
                />
              </div>

              {directError ? (
                <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3">
                  <p className="text-sm font-medium text-[var(--danger)]">
                    {directError}
                  </p>
                </div>
              ) : null}

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => void searchDirect()}
                  disabled={
                    searchingDirect ||
                    directQuery.trim().length < 2
                  }
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-soft)] px-4 py-2.5 text-sm font-semibold text-[var(--accent)] transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {searchingDirect ? (
                    <Loader2
                      size={15}
                      className="animate-spin"
                    />
                  ) : (
                    <Search size={15} />
                  )}
                  Search
                </button>
              </div>

              {directResults.length > 0 ? (
                <div className="mt-4 space-y-1">
                  {directResults.map((person) => (
                    <button
                      key={person.id}
                      type="button"
                      onClick={() =>
                        void startDirectConversation(person)
                      }
                      disabled={openingDirect}
                      className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <div
                        aria-hidden="true"
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-xs font-bold text-[var(--accent)]"
                      >
                        {getInitials(person.display_name)}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {person.display_name}
                        </p>

                        <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                          @{person.username}
                        </p>
                      </div>

                      {openingDirect ? (
                        <Loader2
                          size={16}
                          className="shrink-0 animate-spin text-[var(--accent)]"
                        />
                      ) : (
                        <MessageCircle
                          size={16}
                          className="shrink-0 text-[var(--muted)]"
                        />
                      )}
                    </button>
                  ))}
                </div>
              ) : directQuery.trim().length >= 2 &&
                !searchingDirect ? (
                <p className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--muted)]">
                  No available people found.
                </p>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-[var(--border)] px-4 py-6 text-center">
                  <p className="text-sm font-medium text-[var(--foreground)]">
                    Find someone to message.
                  </p>

                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Search by username or display name.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {groupOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-3 py-3 sm:items-center sm:px-5"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-group-title"
        >
          <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
            <header className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4 sm:px-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
                  Groups
                </p>

                <h2
                  id="create-group-title"
                  className="mt-1 text-xl font-semibold tracking-[-0.03em]"
                >
                  Create a group
                </h2>
              </div>

              <button
                type="button"
                onClick={closeGroupCreator}
                disabled={creatingGroup}
                aria-label="Close group creator"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted)] transition hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X size={17} />
              </button>
            </header>

            <form
              onSubmit={handleCreateGroup}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
                <label className="block">
                  <span className="text-sm font-semibold">
                    Group name
                  </span>

                  <input
                    value={groupName}
                    onChange={(event) =>
                      setGroupName(event.target.value)
                    }
                    maxLength={80}
                    autoFocus
                    placeholder="e.g. Project Defence Team"
                    disabled={creatingGroup}
                    className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] disabled:cursor-not-allowed disabled:bg-[var(--surface-muted)]"
                  />
                </label>

                <label className="mt-5 block">
                  <span className="text-sm font-semibold">
                    Description
                    <span className="ml-1 font-normal text-[var(--muted)]">
                      optional
                    </span>
                  </span>

                  <textarea
                    value={groupDescription}
                    onChange={(event) =>
                      setGroupDescription(event.target.value)
                    }
                    maxLength={500}
                    rows={3}
                    placeholder="What is this group for?"
                    disabled={creatingGroup}
                    className="mt-2 w-full resize-none rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm leading-6 outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] disabled:cursor-not-allowed disabled:bg-[var(--surface-muted)]"
                  />
                </label>

                {selectedMembers.length > 0 ? (
                  <div className="mt-5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">
                        Members
                      </span>

                      <span className="text-xs text-[var(--muted)]">
                        {selectedMembers.length} selected
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedMembers.map((member) => (
                        <button
                          key={member.id}
                          type="button"
                          onClick={() =>
                            removeSelectedMember(member.id)
                          }
                          disabled={creatingGroup}
                          className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] transition hover:bg-[var(--background)] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          @{member.username}
                          <X size={13} />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="mt-5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">
                      Add people
                    </span>

                    <span className="text-xs text-[var(--muted)]">
                      {selectedMembers.length}/49
                    </span>
                  </div>

                  <div className="mt-2 flex gap-2">
                    <div className="relative min-w-0 flex-1">
                      <Search
                        size={17}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
                      />

                      <input
                        value={memberQuery}
                        onChange={(event) => {
                          const value = event.target.value;
                          setMemberQuery(value);

                          if (value.trim().length < 2) {
                            setMemberResults([]);
                          }
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void searchMembers();
                          }
                        }}
                        maxLength={50}
                        placeholder="Search username or name…"
                        disabled={creatingGroup}
                        className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] py-3 pl-10 pr-4 text-sm outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] disabled:cursor-not-allowed disabled:bg-[var(--surface-muted)]"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => void searchMembers()}
                      disabled={
                        searchingMembers ||
                        creatingGroup ||
                        memberQuery.trim().length < 2
                      }
                      className="rounded-2xl bg-[var(--accent-soft)] px-4 text-sm font-semibold text-[var(--accent)] transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {searchingMembers ? (
                        <Loader2
                          size={17}
                          className="animate-spin"
                        />
                      ) : (
                        "Search"
                      )}
                    </button>
                  </div>

                  {memberResults.length > 0 ? (
                    <div className="mt-3 space-y-1 rounded-2xl border border-[var(--border)] bg-[var(--background)] p-2">
                      {memberResults.map((person) => {
                        const selected = selectedMembers.some(
                          (member) => member.id === person.id,
                        );

                        return (
                          <button
                            key={person.id}
                            type="button"
                            onClick={() => toggleMember(person)}
                            disabled={creatingGroup}
                            className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <div
                              aria-hidden="true"
                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-xs font-bold text-[var(--accent)]"
                            >
                              {getInitials(person.display_name)}
                            </div>

                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold">
                                {person.display_name}
                              </p>

                              <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                                @{person.username}
                              </p>
                            </div>

                            <span
                              className={[
                                "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
                                selected
                                  ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                                  : "border-[var(--border)] bg-[var(--surface)] text-transparent",
                              ].join(" ")}
                            >
                              <Check size={14} />
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : memberQuery.trim().length >= 2 &&
                    !searchingMembers ? (
                    <p className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--muted)]">
                      No available people found.
                    </p>
                  ) : null}
                </div>

                {groupError ? (
                  <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3">
                    <p className="text-sm font-medium text-[var(--danger)]">
                      {groupError}
                    </p>
                  </div>
                ) : null}
              </div>

              <footer className="flex items-center justify-end gap-2 border-t border-[var(--border)] bg-[var(--surface-muted)] px-5 py-4 sm:px-6">
                <button
                  type="button"
                  onClick={closeGroupCreator}
                  disabled={creatingGroup}
                  className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--background)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={
                    creatingGroup ||
                    !groupName.trim() ||
                    selectedMembers.length < 1
                  }
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {creatingGroup ? (
                    <>
                      <Loader2
                        size={16}
                        className="animate-spin"
                      />
                      Creating…
                    </>
                  ) : (
                    <>
                      <Plus size={16} />
                      Create group
                    </>
                  )}
                </button>
              </footer>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}