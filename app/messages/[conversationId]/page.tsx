"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  MessageCircle,
  Send,
} from "lucide-react";
import { createClient } from "@/lib/supabase/browser";

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
  const supabase = createClient();

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
      return "Group conversation";
    }

    return conversation.participant
      ? `@${conversation.participant.username}`
      : "Direct conversation";
  }, [conversation]);

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

      if (!response.ok) {
        setError(
          data.error ?? "Unable to load this conversation.",
        );
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
    } catch {
      setError("Unable to load this conversation.");
    }
  }, [conversationId]);

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
    [conversationId],
  );

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
  }, [supabase]);

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

      if (!response.ok) {
        setError(data.error ?? "Unable to send the message.");
        return;
      }

      if (data.message) {
        setMessages((current) => [...current, data.message]);
      }

      setDraft("");
      void loadConversation();
    } catch {
      setError("Unable to send the message.");
    } finally {
      setSending(false);
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
                        className={`flex ${
                          isOwn
                            ? "justify-end"
                            : "justify-start"
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
                  <Loader2 size={17} className="animate-spin" />
                ) : (
                  <Send size={17} />
                )}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}