"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  MessageCircle,
  RefreshCw,
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
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

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
    [],
  );

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  return (
    <main className="min-h-screen bg-[#f6f5f1] text-[#17191c]">
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
          <div className="flex items-center justify-between border-b border-[#ebeae5] px-5 py-5 sm:px-6">
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
                When you start talking to someone on Agoré, your conversation
                will appear here.
              </p>

              <Link
                href="/explore"
                className="mt-5 inline-flex rounded-full bg-[#2148b8] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#183991]"
              >
                Find people
              </Link>
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
    </main>
  );
}