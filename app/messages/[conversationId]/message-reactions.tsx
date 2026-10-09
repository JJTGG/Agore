"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Heart,
  Loader2,
  SmilePlus,
} from "lucide-react";
import { createClient } from "@/lib/supabase/browser";

type ReactionType =
  | "like"
  | "love"
  | "laugh"
  | "care"
  | "wow"
  | "sad"
  | "angry";

type ReactionState = {
  myReaction: ReactionType | null;
  reactions: Record<ReactionType, number>;
};

type MessageReactionsProps = {
  conversationId: string;
  messageId: string;
};

type ReactionRealtimeCallback = () => void;

type ReactionChannelEntry = {
  channel: ReturnType<
    ReturnType<typeof createClient>["channel"]
  >;
  subscribers: Map<
    string,
    Set<ReactionRealtimeCallback>
  >;
  cleanupRecovery: () => void;
};

const supabase = createClient();

const reactionChannels = new Map<
  string,
  ReactionChannelEntry
>();

const reactionOptions: Array<{
  type: ReactionType;
  emoji: string;
  label: string;
}> = [
  { type: "like", emoji: "👍", label: "Like" },
  { type: "love", emoji: "❤️", label: "Love" },
  { type: "laugh", emoji: "😂", label: "Laugh" },
  { type: "care", emoji: "🥹", label: "Care" },
  { type: "wow", emoji: "😮", label: "Wow" },
  { type: "sad", emoji: "😢", label: "Sad" },
  { type: "angry", emoji: "😡", label: "Angry" },
];

const emptyReactions: Record<ReactionType, number> = {
  like: 0,
  love: 0,
  laugh: 0,
  care: 0,
  wow: 0,
  sad: 0,
  angry: 0,
};

function getReactionMessageId(payload: {
  eventType: string;
  new: Record<string, unknown>;
  old: Record<string, unknown>;
}) {
  const messageId =
    payload.eventType === "DELETE"
      ? payload.old?.message_id
      : payload.new?.message_id;

  return typeof messageId === "string" ? messageId : null;
}

function notifyReactionSubscribers(
  conversationId: string,
  messageId: string,
) {
  const entry = reactionChannels.get(conversationId);
  if (!entry) return;

  const callbacks = entry.subscribers.get(messageId);
  if (!callbacks) return;

  callbacks.forEach((callback) => callback());
}

/**
 * Refresh every mounted reaction component belonging to a conversation.
 * This is used after reconnection or when a backgrounded tab becomes active.
 */
function refreshReactionSubscribers(conversationId: string) {
  const entry = reactionChannels.get(conversationId);
  if (!entry) return;

  for (const messageId of entry.subscribers.keys()) {
    notifyReactionSubscribers(conversationId, messageId);
  }
}

function ensureReactionChannel(
  conversationId: string,
): ReactionChannelEntry {
  const existing = reactionChannels.get(conversationId);
  if (existing) return existing;

  const channel = supabase
    .channel(`message-reactions:${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "message_reactions",
      },
      (payload) => {
        const messageId = getReactionMessageId(payload);

        if (messageId) {
          notifyReactionSubscribers(
            conversationId,
            messageId,
          );
        }
      },
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "message_reactions",
      },
      (payload) => {
        const messageId = getReactionMessageId(payload);

        if (messageId) {
          notifyReactionSubscribers(
            conversationId,
            messageId,
          );
        }

        const oldMessageId =
          typeof payload.old?.message_id === "string"
            ? payload.old.message_id
            : null;

        if (oldMessageId && oldMessageId !== messageId) {
          notifyReactionSubscribers(
            conversationId,
            oldMessageId,
          );
        }
      },
    )
    .on(
      "postgres_changes",
      {
        event: "DELETE",
        schema: "public",
        table: "message_reactions",
      },
      (payload) => {
        const messageId = getReactionMessageId(payload);

        if (messageId) {
          notifyReactionSubscribers(
            conversationId,
            messageId,
          );
        }
      },
    );

  let wasVisible =
    document.visibilityState === "visible";

  const handleOnline = () => {
    refreshReactionSubscribers(conversationId);
  };

  const handleVisibilityChange = () => {
    const isVisible =
      document.visibilityState === "visible";

    if (isVisible && !wasVisible) {
      refreshReactionSubscribers(conversationId);
    }

    wasVisible = isVisible;
  };

  const cleanupRecovery = () => {
    window.removeEventListener("online", handleOnline);
    document.removeEventListener(
      "visibilitychange",
      handleVisibilityChange,
    );
  };

  const entry: ReactionChannelEntry = {
    channel,
    subscribers: new Map(),
    cleanupRecovery,
  };

  // Register the entry before subscribing so status callbacks can
  // safely confirm that this channel is still the active one.
  reactionChannels.set(conversationId, entry);

  window.addEventListener("online", handleOnline);
  document.addEventListener(
    "visibilitychange",
    handleVisibilityChange,
  );

  void channel.subscribe((status, subscriptionError) => {
    const currentEntry =
      reactionChannels.get(conversationId);

    // Ignore callbacks from a channel that has already been removed.
    if (currentEntry?.channel !== channel) return;

    if (status === "SUBSCRIBED") {
      // Re-fetch server state instead of assuming every event sent
      // during a connection interruption was received by the browser.
      refreshReactionSubscribers(conversationId);
      return;
    }

    if (
      status === "CHANNEL_ERROR" ||
      status === "TIMED_OUT" ||
      status === "CLOSED"
    ) {
      console.warn(
        "Agoré message-reaction realtime status:",
        status,
        subscriptionError,
      );
    }
  });

  return entry;
}

function subscribeToReactionEvents(
  conversationId: string,
  messageId: string,
  callback: ReactionRealtimeCallback,
) {
  const entry = ensureReactionChannel(conversationId);

  const callbacks =
    entry.subscribers.get(messageId) ??
    new Set<ReactionRealtimeCallback>();

  callbacks.add(callback);
  entry.subscribers.set(messageId, callbacks);

  return () => {
    const currentEntry =
      reactionChannels.get(conversationId);

    if (!currentEntry) return;

    const currentCallbacks =
      currentEntry.subscribers.get(messageId);

    if (!currentCallbacks) return;

    currentCallbacks.delete(callback);

    if (currentCallbacks.size === 0) {
      currentEntry.subscribers.delete(messageId);
    }

    // Only dispose the shared channel when no message components
    // in this conversation are listening to it.
    if (currentEntry.subscribers.size === 0) {
      currentEntry.cleanupRecovery();
      reactionChannels.delete(conversationId);

      void supabase.removeChannel(currentEntry.channel);
    }
  };
}

export default function MessageReactions({
  conversationId,
  messageId,
}: MessageReactionsProps) {
  const [state, setState] = useState<ReactionState>({
    myReaction: null,
    reactions: emptyReactions,
  });

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const activeReactions = useMemo(
    () =>
      reactionOptions.filter(
        (option) => state.reactions[option.type] > 0,
      ),
    [state.reactions],
  );

  useEffect(() => {
    let active = true;

    async function loadReactions(showLoading = true) {
      if (showLoading) setLoading(true);

      try {
        const response = await fetch(
          `/api/conversations/${encodeURIComponent(
            conversationId,
          )}/messages/${encodeURIComponent(
            messageId,
          )}/reaction`,
          { cache: "no-store" },
        );

        const data = await response.json();

        if (!active) return;

        if (!response.ok) {
          setError(
            data.error ??
              "Unable to load message reactions.",
          );
          return;
        }

        const reactions =
          data?.reactions &&
          typeof data.reactions === "object"
            ? data.reactions
            : {};

        setState({
          myReaction: data.myReaction ?? null,
          reactions: {
            ...emptyReactions,
            ...reactions,
          },
        });

        setError("");
      } catch {
        if (active) {
          setError("Unable to load message reactions.");
        }
      } finally {
        if (active && showLoading) {
          setLoading(false);
        }
      }
    }

    void loadReactions();

    const unsubscribe = subscribeToReactionEvents(
      conversationId,
      messageId,
      () => {
        void loadReactions(false);
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [conversationId, messageId]);

  async function handleReaction(type: ReactionType) {
    if (pending) return;

    setPending(true);
    setError("");

    try {
      const isRemoving = state.myReaction === type;

      const response = await fetch(
        `/api/conversations/${encodeURIComponent(
          conversationId,
        )}/messages/${encodeURIComponent(
          messageId,
        )}/reaction`,
        {
          method: isRemoving ? "DELETE" : "POST",
          headers: isRemoving
            ? undefined
            : { "Content-Type": "application/json" },
          body: isRemoving
            ? undefined
            : JSON.stringify({ reactionType: type }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        setError(
          data.error ??
            "Unable to update the reaction.",
        );
        return;
      }

      const reactions =
        data?.reactions &&
        typeof data.reactions === "object"
          ? data.reactions
          : {};

      setState({
        myReaction: data.myReaction ?? null,
        reactions: {
          ...emptyReactions,
          ...reactions,
        },
      });

      setOpen(false);
    } catch {
      setError("Unable to update the reaction.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="relative mt-2">
      {loading ? (
        <div className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 text-[11px] text-[var(--muted)]">
          <Loader2 size={12} className="animate-spin" />
          Loading reactions
        </div>
      ) : null}

      {!loading && activeReactions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeReactions.map((option) => {
            const count = state.reactions[option.type];
            const selected = state.myReaction === option.type;

            return (
              <button
                key={option.type}
                type="button"
                onClick={() => void handleReaction(option.type)}
                disabled={pending}
                aria-label={`${option.label}: ${count}`}
                aria-pressed={selected}
                className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  selected
                    ? "border-[var(--accent)]/35 bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted-strong)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-soft)] hover:text-[var(--foreground)]"
                }`}
                title={option.label}
              >
                <span aria-hidden="true">{option.emoji}</span>
                <span>{count}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            disabled={pending}
            aria-label="Add reaction"
            aria-expanded={open}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-[var(--border-strong)] bg-[var(--surface)] text-[var(--muted)] transition hover:border-[var(--accent)]/45 hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <SmilePlus size={13} />
          </button>
        </div>
      ) : null}

      {!loading && activeReactions.length === 0 ? (
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          disabled={pending}
          aria-label="Add reaction"
          aria-expanded={open}
          className="inline-flex h-7 items-center gap-1.5 rounded-full border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-2.5 text-[11px] font-medium text-[var(--muted)] transition hover:border-[var(--accent)]/45 hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Heart size={12} />
          React
        </button>
      ) : null}

      {open ? (
        <div className="absolute bottom-full left-0 z-20 mb-2 flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-1 rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-2 shadow-xl">
          {reactionOptions.map((option) => {
            const selected = state.myReaction === option.type;

            return (
              <button
                key={option.type}
                type="button"
                onClick={() => void handleReaction(option.type)}
                disabled={pending}
                aria-label={option.label}
                aria-pressed={selected}
                title={option.label}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-xl text-lg transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  selected
                    ? "bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]/35"
                    : "hover:bg-[var(--surface-muted)]"
                }`}
              >
                <span aria-hidden="true">{option.emoji}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {error ? (
        <p className="mt-1 text-[11px] font-medium text-[var(--danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}