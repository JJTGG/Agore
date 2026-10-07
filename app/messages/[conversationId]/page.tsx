"use client";

import Link from "next/link";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Edit3,
  Loader2,
  MessageCircle,
  Plus,
  Search,
  Send,
  Settings,
  Shield,
  ShieldOff,
  UserMinus,
  Users,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import MessageReactions from "./message-reactions";

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
};

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  content: string | null;
  reply_to_message_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sender: Profile | null;
};

type GroupMember = {
  userId: string;
  role: string;
  joinedAt: string;
  profile: Profile | null;
};

type MemberSearchResult = {
  id: string;
  display_name: string;
  username: string;
  bio: string | null;
  avatar_path: string | null;
  created_at: string;
};

function formatMessageTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatMessageDay(value: string) {
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

export default function ConversationPage() {
  const params = useParams<{ conversationId: string }>();
  const router = useRouter();

  const conversationId = params.conversationId;

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(
    null,
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [groupOpen, setGroupOpen] = useState(false);
  const [groupLoading, setGroupLoading] = useState(false);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState("member");
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [savingGroup, setSavingGroup] = useState(false);
  const [groupActionError, setGroupActionError] = useState("");

  const [memberQuery, setMemberQuery] = useState("");
  const [memberResults, setMemberResults] = useState<
    MemberSearchResult[]
  >([]);
  const [searchingMembers, setSearchingMembers] = useState(false);
  const [memberActionLoading, setMemberActionLoading] = useState<
    string | null
  >(null);

  const title = useMemo(() => {
    if (!conversation) {
      return "Messages";
    }

    if (conversation.type === "group") {
      return conversation.name?.trim() || "Unnamed group";
    }

    return conversation.participant?.display_name || "Agoré user";
  }, [conversation]);

  const subtitle = useMemo(() => {
    if (!conversation) {
      return "";
    }

    if (conversation.type === "group") {
      if (groupMembers.length > 0) {
        return `${groupMembers.length} member${
          groupMembers.length === 1 ? "" : "s"
        }`;
      }

      return "Group conversation";
    }

    return conversation.participant
      ? `@${conversation.participant.username}`
      : "Direct conversation";
  }, [conversation, groupMembers.length]);

  const initials = useMemo(() => getInitials(title), [title]);

  const loadConversation = useCallback(async () => {
    if (!conversationId) {
      return;
    }

    try {
      const response = await fetch("/api/conversations?limit=50", {
        cache: "no-store",
      });

      const data = await response.json();

      if (response.status === 401) {
        router.push("/auth");
        return;
      }

      if (!response.ok) {
        setError(data.error ?? "Unable to load this conversation.");
        return;
      }

      const found = Array.isArray(data.conversations)
        ? (data.conversations.find(
            (item: Conversation) => item.id === conversationId,
          ) as Conversation | undefined)
        : undefined;

      if (!found) {
        setError("Conversation not found.");
        setConversation(null);
        return;
      }

      setConversation(found);
      setGroupName(found.name ?? "");
      setGroupDescription(found.description ?? "");
    } catch {
      setError("Unable to load this conversation.");
    }
  }, [conversationId, router]);

  const loadMessages = useCallback(
    async (manual = false) => {
      if (!conversationId) {
        return;
      }

      if (manual) {
        setRefreshing(true);
      }

      try {
        const response = await fetch(
          `/api/conversations/${encodeURIComponent(
            conversationId,
          )}/messages?limit=100`,
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
          setError(data.error ?? "Unable to load messages.");
          return;
        }

        setMessages(
          Array.isArray(data.messages) ? data.messages : [],
        );
      } catch {
        setError("Unable to load messages.");
      } finally {
        setRefreshing(false);
      }
    },
    [conversationId, router],
  );

  const loadGroupMembers = useCallback(async () => {
    if (
      !conversationId ||
      !conversation ||
      conversation.type !== "group"
    ) {
      return;
    }

    setGroupLoading(true);
    setGroupActionError("");

    try {
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(
          conversationId,
        )}/members`,
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
        setGroupActionError(
          data.error ?? "Unable to load group members.",
        );
        return;
      }

      setGroupMembers(
        Array.isArray(data.members) ? data.members : [],
      );
      setCurrentUserRole(data.currentUserRole ?? "member");
    } catch {
      setGroupActionError("Unable to load group members.");
    } finally {
      setGroupLoading(false);
    }
  }, [conversation, conversationId, router]);

  useEffect(() => {
    let active = true;

    async function loadCurrentUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active) {
        return;
      }

      setCurrentUserId(user?.id ?? null);
    }

    void loadCurrentUser();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    async function initialize() {
      setLoading(true);
      setError("");

      try {
        await Promise.all([
          loadConversation(),
          loadMessages(),
        ]);
      } finally {
        setLoading(false);
      }
    }

    void initialize();
  }, [loadConversation, loadMessages]);

  useEffect(() => {
    if (!conversationId) {
      return;
    }

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          void loadMessages();
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setError(
            "Realtime messaging is unavailable. Refresh to reconnect.",
          );
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, loadMessages]);

  useEffect(() => {
    if (groupOpen && conversation?.type === "group") {
      void loadGroupMembers();
    }
  }, [groupOpen, conversation?.type, loadGroupMembers]);

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const content = draft.trim();

    if (!content || sending || !conversationId) {
      return;
    }

    setSending(true);
    setError("");

    try {
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(
          conversationId,
        )}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content,
          }),
        },
      );

      const data = await response.json();

      if (response.status === 401) {
        router.push("/auth");
        return;
      }

      if (!response.ok) {
        setError(data.error ?? "Unable to send the message.");
        return;
      }

      if (data.message) {
        setMessages((current) => {
          if (
            current.some(
              (message) => message.id === data.message.id,
            )
          ) {
            return current;
          }

          return [...current, data.message];
        });
      }

      setDraft("");
      void loadConversation();
    } catch {
      setError("Unable to send the message.");
    } finally {
      setSending(false);
    }
  }

  async function searchMembers(value = memberQuery) {
    const query = value.trim();

    if (query.length < 2) {
      setMemberResults([]);
      return;
    }

    setSearchingMembers(true);
    setGroupActionError("");

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
        setGroupActionError(
          data.error ?? "Unable to search people.",
        );
        setMemberResults([]);
        return;
      }

      const currentMemberIds = new Set(
        groupMembers.map((member) => member.userId),
      );

      setMemberResults(
        (Array.isArray(data.people) ? data.people : []).filter(
          (person: MemberSearchResult) =>
            !currentMemberIds.has(person.id),
        ),
      );
    } catch {
      setGroupActionError("Unable to search people.");
      setMemberResults([]);
    } finally {
      setSearchingMembers(false);
    }
  }

  async function addMember(userId: string) {
    if (currentUserRole !== "admin" || memberActionLoading) {
      return;
    }

    setMemberActionLoading(`add:${userId}`);
    setGroupActionError("");

    try {
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(
          conversationId,
        )}/members`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        setGroupActionError(
          data.error ?? "Unable to add the member.",
        );
        return;
      }

      setMemberResults((current) =>
        current.filter((person) => person.id !== userId),
      );

      await loadGroupMembers();
    } catch {
      setGroupActionError("Unable to add the member.");
    } finally {
      setMemberActionLoading(null);
    }
  }

  async function updateMemberRole(
    userId: string,
    requestedRole: "admin" | "member",
  ) {
    if (
      currentUserRole !== "admin" ||
      userId === currentUserId ||
      memberActionLoading
    ) {
      return;
    }

    const member = groupMembers.find(
      (item) => item.userId === userId,
    );

    const memberName =
      member?.profile?.display_name || "this member";

    const actionLabel =
      requestedRole === "admin"
        ? "promote this member to admin"
        : "remove this member's admin role";

    const confirmed = window.confirm(
      `Are you sure you want to ${actionLabel}?`,
    );

    if (!confirmed) {
      return;
    }

    setMemberActionLoading(`role:${userId}`);
    setGroupActionError("");

    try {
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(
          conversationId,
        )}/members`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId,
            role: requestedRole,
          }),
        },
      );

      const data = await response.json();

      if (response.status === 401) {
        router.push("/auth");
        return;
      }

      if (!response.ok) {
        setGroupActionError(
          data.error ?? `Unable to update ${memberName}'s role.`,
        );
        return;
      }

      await loadGroupMembers();
    } catch {
      setGroupActionError("Unable to update the member role.");
    } finally {
      setMemberActionLoading(null);
    }
  }

  async function removeMember(userId: string) {
    if (
      memberActionLoading ||
      (userId !== currentUserId && currentUserRole !== "admin")
    ) {
      return;
    }

    const isSelf = userId === currentUserId;
    const confirmed = window.confirm(
      isSelf
        ? "Leave this group?"
        : "Remove this member from the group?",
    );

    if (!confirmed) {
      return;
    }

    setMemberActionLoading(`remove:${userId}`);
    setGroupActionError("");

    try {
      const url =
        userId === currentUserId
          ? `/api/conversations/${encodeURIComponent(
              conversationId,
            )}/members`
          : `/api/conversations/${encodeURIComponent(
              conversationId,
            )}/members?userId=${encodeURIComponent(userId)}`;

      const response = await fetch(url, {
        method: "DELETE",
      });

      const data = await response.json();

      if (response.status === 401) {
        router.push("/auth");
        return;
      }

      if (!response.ok) {
        setGroupActionError(
          data.error ?? "Unable to update group membership.",
        );
        return;
      }

      if (isSelf) {
        router.push("/messages");
        return;
      }

      await loadGroupMembers();
    } catch {
      setGroupActionError("Unable to update group membership.");
    } finally {
      setMemberActionLoading(null);
    }
  }

  async function saveGroupSettings(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (currentUserRole !== "admin" || savingGroup) {
      return;
    }

    const name = groupName.trim();
    const description = groupDescription.trim();

    if (!name) {
      setGroupActionError("Group name cannot be empty.");
      return;
    }

    setSavingGroup(true);
    setGroupActionError("");

    try {
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(
          conversationId,
        )}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name,
            description,
          }),
        },
      );

      const data = await response.json();

      if (response.status === 401) {
        router.push("/auth");
        return;
      }

      if (!response.ok) {
        setGroupActionError(
          data.error ?? "Unable to update group settings.",
        );
        return;
      }

      if (data.conversation) {
        setConversation((current) =>
          current
            ? {
                ...current,
                name: data.conversation.name,
                description: data.conversation.description,
                updated_at:
                  data.conversation.updated_at ??
                  current.updated_at,
              }
            : current,
        );
      }
    } catch {
      setGroupActionError("Unable to update group settings.");
    } finally {
      setSavingGroup(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f5f1] text-[#17191c]">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-5 sm:px-6">
        <header className="mb-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.push("/messages")}
            className="inline-flex items-center gap-2 rounded-full border border-[#deddd7] bg-white px-4 py-2 text-sm font-medium transition hover:border-[#b9c7ea] hover:bg-[#f9fbff]"
          >
            <ArrowLeft size={16} />
            Messages
          </button>

          <Link
            href="/home"
            className="text-sm font-semibold tracking-[0.14em] text-[#2148b8]"
          >
            AGORÉ
          </Link>
        </header>

        <section className="flex min-h-[calc(100vh-7rem)] flex-1 flex-col overflow-hidden rounded-3xl border border-[#deddd7] bg-white">
          <header className="flex items-center gap-3 border-b border-[#ebeae5] px-5 py-4 sm:px-6">
            <div
              aria-hidden="true"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#e5ebff] text-sm font-bold text-[#2148b8]"
            >
              {initials}
            </div>

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-semibold">
                {title}
              </h1>

              <p className="truncate text-sm text-[#777b81]">
                {subtitle}
              </p>
            </div>

            {conversation?.type === "group" ? (
              <button
                type="button"
                onClick={() => setGroupOpen(true)}
                aria-label="Open group settings"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#deddd7] bg-white text-[#5d6269] transition hover:bg-[#f8f7f3]"
              >
                <Settings size={17} />
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => void loadMessages(true)}
              disabled={refreshing || loading}
              className="rounded-full px-3 py-2 text-sm font-medium text-[#656a71] transition hover:bg-[#f7f6f2] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            {loading ? (
              <div className="flex min-h-[40vh] items-center justify-center">
                <Loader2
                  size={22}
                  className="animate-spin text-[#2148b8]"
                />
              </div>
            ) : error && !conversation ? (
              <div className="flex min-h-[40vh] flex-col items-center justify-center text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f4e8e8] text-[#8d2f2f]">
                  <MessageCircle size={20} />
                </div>

                <p className="mt-4 text-sm font-medium text-[#8d2f2f]">
                  {error}
                </p>

                <Link
                  href="/messages"
                  className="mt-4 rounded-full bg-[#2148b8] px-4 py-2 text-sm font-semibold text-white"
                >
                  Back to messages
                </Link>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex min-h-[40vh] flex-col items-center justify-center text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#e9edfb] text-[#2148b8]">
                  <MessageCircle size={20} />
                </div>

                <h2 className="mt-4 text-lg font-semibold">
                  Start the conversation
                </h2>

                <p className="mt-2 max-w-sm text-sm leading-6 text-[#777b81]">
                  Send the first message and the conversation will begin here.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message, index) => {
                  const isOwn =
                    message.sender_id === currentUserId;

                  const previousMessage = messages[index - 1];
                  const currentDay = formatMessageDay(
                    message.created_at,
                  );
                  const previousDay = previousMessage
                    ? formatMessageDay(previousMessage.created_at)
                    : null;

                  return (
                    <div key={message.id}>
                      {currentDay !== previousDay ? (
                        <div className="my-5 text-center">
                          <span className="rounded-full bg-[#f2f1ec] px-3 py-1 text-xs font-medium text-[#7c8085]">
                            {currentDay}
                          </span>
                        </div>
                      ) : null}

                      <div
                        className={`flex flex-col ${
                          isOwn
                            ? "items-end"
                            : "items-start"
                        }`}
                      >
                        <div
                          className={`max-w-[82%] rounded-2xl px-4 py-3 ${
                            isOwn
                              ? "rounded-br-md bg-[#2148b8] text-white"
                              : "rounded-bl-md bg-[#f1f0eb] text-[#292d33]"
                          }`}
                        >
                          {!isOwn && message.sender ? (
                            <p className="mb-1 text-xs font-semibold text-[#5f646b]">
                              {message.sender.display_name}
                            </p>
                          ) : null}

                          <p className="whitespace-pre-wrap text-[15px] leading-6">
                            {message.content ?? ""}
                          </p>

                          <p
                            className={`mt-1 text-[11px] ${
                              isOwn
                                ? "text-white/70"
                                : "text-[#85898f]"
                            }`}
                          >
                            {formatMessageTime(
                              message.created_at,
                            )}
                          </p>
                        </div>

                        <MessageReactions
                          conversationId={conversationId}
                          messageId={message.id}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {error && conversation ? (
              <div className="mt-4 rounded-xl border border-[#ead1d1] bg-[#fff7f7] px-4 py-3">
                <p className="text-sm font-medium text-[#8d2f2f]">
                  {error}
                </p>
              </div>
            ) : null}
          </div>

          <form
            onSubmit={handleSend}
            className="border-t border-[#ebeae5] bg-[#fcfcfa] p-3 sm:p-4"
          >
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={5000}
                rows={1}
                disabled={sending || !conversation}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey
                  ) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder="Write a message…"
                className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-[#d9d8d2] bg-white px-4 py-3 text-sm outline-none transition placeholder:text-[#9b9da1] focus:border-[#2148b8] focus:ring-2 focus:ring-[#dce5ff] disabled:cursor-not-allowed disabled:bg-[#f1f0eb]"
              />

              <button
                type="submit"
                disabled={
                  sending ||
                  !conversation ||
                  !draft.trim()
                }
                aria-label="Send message"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#2148b8] text-white transition hover:bg-[#183991] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending ? (
                  <Loader2
                    size={17}
                    className="animate-spin"
                  />
                ) : (
                  <Send size={17} />
                )}
              </button>
            </div>
          </form>
        </section>
      </div>

      {groupOpen && conversation?.type === "group" ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#17191c]/30 px-3 py-3 sm:items-center sm:px-5"
          role="dialog"
          aria-modal="true"
          aria-labelledby="group-settings-title"
        >
          <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-[#deddd7] bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b border-[#ebeae5] px-5 py-4 sm:px-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2148b8]">
                  Group
                </p>

                <h2
                  id="group-settings-title"
                  className="mt-1 text-xl font-semibold tracking-[-0.03em]"
                >
                  Group details
                </h2>
              </div>

              <button
                type="button"
                onClick={() => {
                  setGroupOpen(false);
                  setGroupActionError("");
                  setMemberQuery("");
                  setMemberResults([]);
                }}
                aria-label="Close group details"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#deddd7] text-[#666b72] transition hover:bg-[#f8f7f3]"
              >
                <X size={17} />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="border-b border-[#ebeae5] px-5 py-5 sm:px-6">
                <div className="flex items-center gap-4">
                  <div
                    aria-hidden="true"
                    className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#e5ebff] text-base font-bold text-[#2148b8]"
                  >
                    {initials}
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold">
                      {title}
                    </p>

                    <p className="mt-1 text-sm text-[#777b81]">
                      {groupMembers.length} member
                      {groupMembers.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>

                {currentUserRole === "admin" ? (
                  <form
                    onSubmit={saveGroupSettings}
                    className="mt-6 space-y-4"
                  >
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
                        disabled={savingGroup}
                        className="mt-2 w-full rounded-2xl border border-[#d9d8d2] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#2148b8] focus:ring-2 focus:ring-[#dce5ff] disabled:bg-[#f1f0eb]"
                      />
                    </label>

                    <label className="block">
                      <span className="text-sm font-semibold">
                        Description
                      </span>

                      <textarea
                        value={groupDescription}
                        onChange={(event) =>
                          setGroupDescription(event.target.value)
                        }
                        maxLength={500}
                        rows={3}
                        disabled={savingGroup}
                        className="mt-2 w-full resize-none rounded-2xl border border-[#d9d8d2] bg-white px-4 py-3 text-sm leading-6 outline-none transition focus:border-[#2148b8] focus:ring-2 focus:ring-[#dce5ff] disabled:bg-[#f1f0eb]"
                      />
                    </label>

                    <button
                      type="submit"
                      disabled={
                        savingGroup || !groupName.trim()
                      }
                      className="inline-flex items-center gap-2 rounded-full bg-[#2148b8] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#183991] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {savingGroup ? (
                        <Loader2
                          size={16}
                          className="animate-spin"
                        />
                      ) : (
                        <Edit3 size={16} />
                      )}

                      {savingGroup
                        ? "Saving…"
                        : "Save details"}
                    </button>
                  </form>
                ) : conversation.description ? (
                  <p className="mt-5 text-sm leading-6 text-[#555a61]">
                    {conversation.description}
                  </p>
                ) : null}
              </div>

              <div className="border-b border-[#ebeae5] px-5 py-5 sm:px-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users
                      size={17}
                      className="text-[#2148b8]"
                    />
                    <p className="text-sm font-semibold">
                      Members
                    </p>
                  </div>

                  {currentUserRole === "admin" ? (
                    <span className="text-xs font-medium text-[#7c8085]">
                      Admin controls enabled
                    </span>
                  ) : null}
                </div>

                {groupLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2
                      size={20}
                      className="animate-spin text-[#2148b8]"
                    />
                  </div>
                ) : groupMembers.length === 0 ? (
                  <p className="mt-4 text-sm text-[#777b81]">
                    No active members found.
                  </p>
                ) : (
                  <div className="mt-4 space-y-1">
                    {groupMembers.map((member) => {
                      const profile = member.profile;
                      const memberName =
                        profile?.display_name || "Agoré user";
                      const isCurrentUser =
                        member.userId === currentUserId;
                      const removeLoading =
                        memberActionLoading ===
                        `remove:${member.userId}`;
                      const roleLoading =
                        memberActionLoading ===
                        `role:${member.userId}`;

                      return (
                        <div
                          key={member.userId}
                          className="rounded-2xl px-3 py-3 transition hover:bg-[#f8f7f3]"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              aria-hidden="true"
                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#edf0f8] text-xs font-bold text-[#536071]"
                            >
                              {getInitials(memberName)}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="truncate text-sm font-semibold">
                                  {memberName}
                                </p>

                                {member.role === "admin" ? (
                                  <span className="shrink-0 rounded-full bg-[#e8edff] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#2148b8]">
                                    Admin
                                  </span>
                                ) : null}
                              </div>

                              <p className="mt-0.5 truncate text-xs text-[#777b81]">
                                @{profile?.username || "user"}
                                {isCurrentUser
                                  ? " · You"
                                  : ""}
                              </p>
                            </div>

                            {isCurrentUser ||
                            currentUserRole === "admin" ? (
                              <div className="flex shrink-0 items-center gap-1">
                                {currentUserRole === "admin" &&
                                !isCurrentUser ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void updateMemberRole(
                                        member.userId,
                                        member.role === "admin"
                                          ? "member"
                                          : "admin",
                                      )
                                    }
                                    disabled={Boolean(
                                      memberActionLoading,
                                    )}
                                    aria-label={
                                      member.role === "admin"
                                        ? `Remove admin role from ${memberName}`
                                        : `Promote ${memberName} to admin`
                                    }
                                    title={
                                      member.role === "admin"
                                        ? "Remove admin role"
                                        : "Make admin"
                                    }
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#deddd7] bg-white text-[#536071] transition hover:bg-[#eef2ff] hover:text-[#2148b8] disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {roleLoading ? (
                                      <Loader2
                                        size={15}
                                        className="animate-spin"
                                      />
                                    ) : member.role ===
                                      "admin" ? (
                                      <ShieldOff size={15} />
                                    ) : (
                                      <Shield size={15} />
                                    )}
                                  </button>
                                ) : null}

                                <button
                                  type="button"
                                  onClick={() =>
                                    void removeMember(
                                      member.userId,
                                    )
                                  }
                                  disabled={Boolean(
                                    memberActionLoading,
                                  )}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#deddd7] bg-white text-[#8a4646] transition hover:bg-[#fff7f7] disabled:cursor-not-allowed disabled:opacity-50"
                                  aria-label={
                                    isCurrentUser
                                      ? "Leave group"
                                      : `Remove ${memberName}`
                                  }
                                >
                                  {removeLoading ? (
                                    <Loader2
                                      size={15}
                                      className="animate-spin"
                                    />
                                  ) : (
                                    <UserMinus size={15} />
                                  )}
                                </button>
                              </div>
                            ) : null}
                          </div>

                          {currentUserRole === "admin" &&
                          !isCurrentUser ? (
                            <p className="ml-[52px] mt-2 text-[11px] text-[#8a8d92]">
                              {member.role === "admin"
                                ? "Tap the shield to remove admin access."
                                : "Tap the shield to make this member an admin."}
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {currentUserRole === "admin" ? (
                <div className="px-5 py-5 sm:px-6">
                  <div className="flex items-center gap-2">
                    <Plus
                      size={17}
                      className="text-[#2148b8]"
                    />
                    <p className="text-sm font-semibold">
                      Add members
                    </p>
                  </div>

                  <div className="mt-3 flex gap-2">
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
                        disabled={searchingMembers}
                        className="w-full rounded-2xl border border-[#d9d8d2] bg-white py-3 pl-10 pr-4 text-sm outline-none transition placeholder:text-[#9b9da1] focus:border-[#2148b8] focus:ring-2 focus:ring-[#dce5ff] disabled:bg-[#f1f0eb]"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => void searchMembers()}
                      disabled={
                        searchingMembers ||
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
                        const actionLoading =
                          memberActionLoading ===
                          `add:${person.id}`;

                        return (
                          <button
                            key={person.id}
                            type="button"
                            onClick={() =>
                              void addMember(person.id)
                            }
                            disabled={Boolean(
                              memberActionLoading,
                            )}
                            className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <div
                              aria-hidden="true"
                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e5ebff] text-xs font-bold text-[#2148b8]"
                            >
                              {getInitials(
                                person.display_name,
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold">
                                {person.display_name}
                              </p>

                              <p className="mt-0.5 truncate text-xs text-[#777b81]">
                                @{person.username}
                              </p>
                            </div>

                            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e9edfb] text-[#2148b8]">
                              {actionLoading ? (
                                <Loader2
                                  size={15}
                                  className="animate-spin"
                                />
                              ) : (
                                <Plus size={15} />
                              )}
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
              ) : (
                <div className="px-5 py-5 sm:px-6">
                  <button
                    type="button"
                    onClick={() =>
                      currentUserId
                        ? void removeMember(currentUserId)
                        : undefined
                    }
                    disabled={
                      Boolean(memberActionLoading) ||
                      !currentUserId
                    }
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[#ead1d1] bg-[#fff7f7] px-4 py-3 text-sm font-semibold text-[#8d2f2f] transition hover:bg-[#fff1f1] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <UserMinus size={16} />
                    Leave group
                  </button>
                </div>
              )}

              {groupActionError ? (
                <div className="px-5 pb-5 sm:px-6">
                  <div className="rounded-2xl border border-[#ead1d1] bg-[#fff7f7] px-4 py-3">
                    <p className="text-sm font-medium text-[#8d2f2f]">
                      {groupActionError}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}