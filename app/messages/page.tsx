"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Loader2,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";

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
  if (!value) return "";

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

  const [groupOpen, setGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [memberResults, setMemberResults] = useState<SearchPerson[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<SearchPerson[]>([]);
  const [searchingMembers, setSearchingMembers] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupError, setGroupError] = useState("");

  const loadConversations = useCallback(
    async (manual = false) => {
      if (manual) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

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
          setError(
            data.error ?? "Unable to load your conversations.",
          );
          setConversations([]);
          return;
        }

        setConversations(
          Array.isArray(data.conversations) ? data.conversations : [],
        );
      } catch {
        setError("Unable to load your conversations.");
        setConversations([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [router],
  );

  useEffect(() => {
    void loadConversations();
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
        setGroupError(data.error ?? "Unable to search people.");
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

  function toggleMember(person: SearchPerson) {
    setGroupError("");

    setSelectedMembers((current) => {
      const exists = current.some((member) => member.id === person.id);

      if (exists) {
        return current.filter((member) => member.id !== person.id);
      }

      if (current.length >= 49) {
        setGroupError("A group can have at most 50 members.");
        return current;
      }

      return [...current, person];
    });
  }

  function removeSelectedMember(personId: string) {
    setSelectedMembers((current) =>
      current.filter((member) => member.id !== personId),
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

  async function handleCreateGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = groupName.trim();
    const description = groupDescription.trim();

    if (!name) {
      setGroupError("Enter a group name.");
      return;
    }

    if (selectedMembers.length < 1) {
      setGroupError("Select at least one other member.");
      return;
    }

    setCreatingGroup(true);
    setGroupError("");

    try {
      const response = await fetch("/api/conversations/group", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          description,
          memberIds: selectedMembers.map((member) => member.id),
        }),
      });

      const data = await response.json();

      if (response.status === 401) {
        router.push("/auth");
        return;
      }

      if (!response.ok) {
        setGroupError(
          data.error ?? "Unable to create the group.",
        );
        return;
      }

      if (!data.conversation?.id) {
        setGroupError("The group was created without a conversation ID.");
        return;
      }

      setGroupOpen(false);
      resetGroupForm();

      router.push(
        `/messages/${encodeURIComponent(data.conversation.id)}`,
      );
    } catch {
      setGroupError("Unable to create the group.");
    } finally {
      setCreatingGroup(false);
    }
  }

  return (
    <main className="relative min-h-screen bg-[#f6f5f1] text-[#17191c]">
      <div className="mx-auto min-h-screen w-full max-w-2xl px-4 py-5 sm:px-6">
        <header className="mb-5 flex items-center justify-between">
          <Link
            href="/home"
            className="inline-flex items-center gap-2 rounded-full border border-[#deddd7] bg-white px-4 py-2 text-sm font-medium transition hover:border-[#b9c7ea] hover:bg-[#f9fbff]"
          >
            <ArrowLeft size={16} />
            Home
          </Link>

          <span className="text-sm font-semibold tracking-[0.14em] text-[#2148b8]">
            AGORÉ
          </span>
        </header>

        <section className="overflow-hidden rounded-3xl border border-[#deddd7] bg-white">
          <div className="flex items-center justify-between gap-4 border-b border-[#ebeae5] px-5 py-5 sm:px-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2148b8]">
                Messages
              </p>

              <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em]">
                Conversations
              </h1>

              <p className="mt-1 text-sm text-[#777b81]">
                Your direct and group conversations will appear here.
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setGroupOpen(true)}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-[#2148b8] px-4 text-sm font-semibold text-white transition hover:bg-[#183991]"
              >
                <Plus size={16} />
                New group
              </button>

              <button
                type="button"
                onClick={() => void loadConversations(true)}
                disabled={refreshing || loading}
                aria-label="Refresh conversations"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#deddd7] bg-white text-[#555a60] transition hover:bg-[#f8f7f3] disabled:cursor-not-allowed disabled:opacity-50"
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
                    <div className="h-12 w-12 rounded-full bg-[#e8e7e1]" />

                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="h-4 w-36 rounded bg-[#e8e7e1]" />
                      <div className="h-3 w-24 rounded bg-[#e8e7e1]" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="px-6 py-10 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#f4e8e8] text-[#8d2f2f]">
                <MessageCircle size={20} />
              </div>

              <p className="mt-4 text-sm font-medium text-[#8d2f2f]">
                {error}
              </p>

              <button
                type="button"
                onClick={() => void loadConversations(true)}
                className="mt-4 rounded-full bg-[#2148b8] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#183991]"
              >
                Retry
              </button>
            </div>
          ) : conversations.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#e9edfb] text-[#2148b8]">
                <MessageCircle size={22} />
              </div>

              <h2 className="mt-5 text-lg font-semibold">
                No conversations yet
              </h2>

              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#777b81]">
                Start a direct conversation or create a group to begin
                messaging.
              </p>

              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Link
                  href="/explore"
                  className="rounded-full border border-[#deddd7] bg-white px-5 py-2.5 text-sm font-semibold text-[#4d535b] transition hover:bg-[#f8f7f3]"
                >
                  Find people
                </Link>

                <button
                  type="button"
                  onClick={() => setGroupOpen(true)}
                  className="rounded-full bg-[#2148b8] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#183991]"
                >
                  Create group
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-1 p-2">
              {conversations.map((conversation) => {
                const title = getConversationTitle(conversation);
                const subtitle = getConversationSubtitle(conversation);
                const initials = getInitials(title);

                return (
                  <Link
                    key={conversation.id}
                    href={`/messages/${encodeURIComponent(
                      conversation.id,
                    )}`}
                    className="flex items-center gap-3 rounded-2xl px-4 py-4 transition hover:bg-[#f8f7f3]"
                  >
                    <div
                      aria-hidden="true"
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#e5ebff] text-sm font-bold text-[#2148b8]"
                    >
                      {initials}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-semibold">
                          {title}
                        </p>

                        <span className="shrink-0 text-xs text-[#85898f]">
                          {formatConversationDate(
                            conversation.last_message_at ??
                              conversation.updated_at ??
                              conversation.created_at,
                          )}
                        </span>
                      </div>

                      <p className="mt-1 truncate text-sm text-[#777b81]">
                        {subtitle}
                      </p>
                    </div>

                    <ChevronRight
                      size={17}
                      className="shrink-0 text-[#a0a3a8]"
                    />
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {groupOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#17191c]/30 px-3 py-3 sm:items-center sm:px-5"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-group-title"
        >
          <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-[#deddd7] bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b border-[#ebeae5] px-5 py-4 sm:px-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2148b8]">
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
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#deddd7] text-[#666b72] transition hover:bg-[#f8f7f3] disabled:cursor-not-allowed disabled:opacity-50"
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
                    onChange={(event) => setGroupName(event.target.value)}
                    maxLength={80}
                    autoFocus
                    placeholder="e.g. Project Defence Team"
                    disabled={creatingGroup}
                    className="mt-2 w-full rounded-2xl border border-[#d9d8d2] bg-white px-4 py-3 text-sm outline-none transition placeholder:text-[#9b9da1] focus:border-[#2148b8] focus:ring-2 focus:ring-[#dce5ff] disabled:cursor-not-allowed disabled:bg-[#f1f0eb]"
                  />
                </label>

                <label className="mt-5 block">
                  <span className="text-sm font-semibold">
                    Description
                    <span className="ml-1 font-normal text-[#96999e]">
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
                    className="mt-2 w-full resize-none rounded-2xl border border-[#d9d8d2] bg-white px-4 py-3 text-sm leading-6 outline-none transition placeholder:text-[#9b9da1] focus:border-[#2148b8] focus:ring-2 focus:ring-[#dce5ff] disabled:cursor-not-allowed disabled:bg-[#f1f0eb]"
                  />
                </label>

                {selectedMembers.length > 0 ? (
                  <div className="mt-5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">
                        Members
                      </span>

                      <span className="text-xs text-[#7c8085]">
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
                          className="inline-flex items-center gap-2 rounded-full border border-[#d9d8d2] bg-[#f8f7f3] px-3 py-1.5 text-xs font-semibold text-[#4f555c] transition hover:bg-[#f1f0eb] disabled:cursor-not-allowed disabled:opacity-60"
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

                    <span className="text-xs text-[#7c8085]">
                      {selectedMembers.length}/49
                    </span>
                  </div>

                  <div className="mt-2 flex gap-2">
                    <div className="relative min-w-0 flex-1">
                      <Search
                        size={17}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94979c]"
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
                        className="w-full rounded-2xl border border-[#d9d8d2] bg-white py-3 pl-10 pr-4 text-sm outline-none transition placeholder:text-[#9b9da1] focus:border-[#2148b8] focus:ring-2 focus:ring-[#dce5ff] disabled:cursor-not-allowed disabled:bg-[#f1f0eb]"
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
                      className="rounded-2xl bg-[#eef2ff] px-4 text-sm font-semibold text-[#2148b8] transition hover:bg-[#e4eaff] disabled:cursor-not-allowed disabled:opacity-50"
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
                    <div className="mt-3 space-y-1 rounded-2xl border border-[#ebeae5] bg-[#fcfcfa] p-2">
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
                            className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <div
                              aria-hidden="true"
                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e5ebff] text-xs font-bold text-[#2148b8]"
                            >
                              {getInitials(person.display_name)}
                            </div>

                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold">
                                {person.display_name}
                              </p>

                              <p className="mt-0.5 truncate text-xs text-[#777b81]">
                                @{person.username}
                              </p>
                            </div>

                            <span
                              className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                                selected
                                  ? "border-[#2148b8] bg-[#2148b8] text-white"
                                  : "border-[#d9d8d2] bg-white text-transparent"
                              }`}
                            >
                              <Check size={14} />
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : memberQuery.trim().length >= 2 &&
                    !searchingMembers ? (
                    <p className="mt-3 rounded-2xl border border-[#ebeae5] bg-[#fcfcfa] px-4 py-3 text-sm text-[#777b81]">
                      No available people found.
                    </p>
                  ) : null}
                </div>

                {groupError ? (
                  <div className="mt-5 rounded-2xl border border-[#ead1d1] bg-[#fff7f7] px-4 py-3">
                    <p className="text-sm font-medium text-[#8d2f2f]">
                      {groupError}
                    </p>
                  </div>
                ) : null}
              </div>

              <footer className="flex items-center justify-end gap-2 border-t border-[#ebeae5] bg-[#fcfcfa] px-5 py-4 sm:px-6">
                <button
                  type="button"
                  onClick={closeGroupCreator}
                  disabled={creatingGroup}
                  className="rounded-full border border-[#deddd7] bg-white px-4 py-2.5 text-sm font-semibold text-[#4d535b] transition hover:bg-[#f8f7f3] disabled:cursor-not-allowed disabled:opacity-60"
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
                  className="inline-flex items-center gap-2 rounded-full bg-[#2148b8] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#183991] disabled:cursor-not-allowed disabled:opacity-50"
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