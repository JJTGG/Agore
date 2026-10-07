"use client";

import {
  useEffect,
  useState,
} from "react";

type ReadReceiptSnapshot = {
  conversationType: "direct" | "group";
  currentUserId: string;
  readers: Array<{
    userId: string;
    lastReadAt: string | null;
  }>;
};

type ReadReceiptSubscriber = (
  snapshot: ReadReceiptSnapshot,
) => void;

type ReadReceiptEntry = {
  snapshot: ReadReceiptSnapshot | null;
  subscribers: Set<ReadReceiptSubscriber>;
  intervalId: number | null;
  refreshing: boolean;
};

type MessageStatusProps = {
  conversationId: string;
  senderId: string | null;
  createdAt: string;
};

const readReceiptEntries = new Map<
  string,
  ReadReceiptEntry
>();

function parseSnapshot(
  value: unknown,
): ReadReceiptSnapshot | null {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return null;
  }

  const data =
    value as Record<string, unknown>;

  const conversationType =
    data.conversation_type;

  if (
    conversationType !== "direct" &&
    conversationType !== "group"
  ) {
    return null;
  }

  const currentUserId =
    typeof data.current_user_id ===
    "string"
      ? data.current_user_id
      : "";

  if (!currentUserId) {
    return null;
  }

  const readers = Array.isArray(
    data.readers,
  )
    ? data.readers
        .filter(
          (reader) =>
            reader &&
            typeof reader === "object",
        )
        .map((reader) => {
          const item =
            reader as Record<
              string,
              unknown
            >;

          const userId =
            typeof item.user_id ===
            "string"
              ? item.user_id
              : "";

          const lastReadAt =
            item.last_read_at === null ||
            typeof item.last_read_at ===
              "string"
              ? (item.last_read_at as
                  | string
                  | null)
              : null;

          return {
            userId,
            lastReadAt,
          };
        })
        .filter(
          (reader) =>
            Boolean(reader.userId),
        )
    : [];

  return {
    conversationType,
    currentUserId,
    readers,
  };
}

async function refreshEntry(
  conversationId: string,
  entry: ReadReceiptEntry,
) {
  if (
    entry.refreshing ||
    entry.subscribers.size === 0
  ) {
    return;
  }

  entry.refreshing = true;

  try {
    const response =
      await fetch(
        `/api/conversations/${encodeURIComponent(
          conversationId,
        )}/read-status`,
        {
          cache: "no-store",
        },
      );

    if (!response.ok) {
      return;
    }

    const data =
      await response.json();

    const snapshot =
      parseSnapshot(data);

    if (!snapshot) {
      return;
    }

    entry.snapshot = snapshot;

    entry.subscribers.forEach(
      (subscriber) => {
        subscriber(snapshot);
      },
    );
  } catch {
    // Read receipts are non-critical UI state.
  } finally {
    entry.refreshing = false;
  }
}

function ensureEntry(
  conversationId: string,
) {
  const existing =
    readReceiptEntries.get(
      conversationId,
    );

  if (existing) {
    return existing;
  }

  const entry: ReadReceiptEntry = {
    snapshot: null,
    subscribers:
      new Set<ReadReceiptSubscriber>(),
    intervalId: null,
    refreshing: false,
  };

  readReceiptEntries.set(
    conversationId,
    entry,
  );

  entry.intervalId =
    window.setInterval(() => {
      void refreshEntry(
        conversationId,
        entry,
      );
    }, 2500);

  return entry;
}

function subscribeToReadReceipts(
  conversationId: string,
  subscriber: ReadReceiptSubscriber,
) {
  const entry =
    ensureEntry(conversationId);

  entry.subscribers.add(
    subscriber,
  );

  if (entry.snapshot) {
    subscriber(entry.snapshot);
  }

  void refreshEntry(
    conversationId,
    entry,
  );

  return () => {
    const currentEntry =
      readReceiptEntries.get(
        conversationId,
      );

    if (!currentEntry) {
      return;
    }

    currentEntry.subscribers.delete(
      subscriber,
    );

    if (
      currentEntry.subscribers.size ===
      0
    ) {
      if (
        currentEntry.intervalId !== null
      ) {
        window.clearInterval(
          currentEntry.intervalId,
        );
      }

      readReceiptEntries.delete(
        conversationId,
      );
    }
  };
}

function isRead(
  senderId: string | null,
  createdAt: string,
  snapshot: ReadReceiptSnapshot | null,
) {
  if (
    !senderId ||
    !snapshot ||
    senderId !== snapshot.currentUserId
  ) {
    return false;
  }

  const messageTime =
    new Date(createdAt).getTime();

  if (!Number.isFinite(messageTime)) {
    return false;
  }

  if (
    snapshot.readers.length === 0
  ) {
    return false;
  }

  return snapshot.readers.every(
    (reader) => {
      if (!reader.lastReadAt) {
        return false;
      }

      const readTime =
        new Date(
          reader.lastReadAt,
        ).getTime();

      return (
        Number.isFinite(readTime) &&
        readTime >= messageTime
      );
    },
  );
}

export default function MessageStatus({
  conversationId,
  senderId,
  createdAt,
}: MessageStatusProps) {
  const [
    snapshot,
    setSnapshot,
  ] =
    useState<ReadReceiptSnapshot | null>(
      null,
    );

  useEffect(() => {
    return subscribeToReadReceipts(
      conversationId,
      setSnapshot,
    );
  }, [conversationId]);

  const read = isRead(
    senderId,
    createdAt,
    snapshot,
  );

  return (
    <span
      aria-label={
        read
          ? "Message read"
          : "Message sent"
      }
      title={
        read
          ? "Read"
          : "Sent"
      }
      className={`shrink-0 font-semibold tracking-[-0.08em] ${
        read
          ? "text-white/90"
          : "text-white/65"
      }`}
    >
      {read ? "✓✓" : "✓"}
    </span>
  );
}