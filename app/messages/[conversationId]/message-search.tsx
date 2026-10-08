"use client";

import {
  FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  MessageCircle,
  Search,
  X,
} from "lucide-react";
import AgoreAvatar from "@/components/agore-avatar";

type Profile = {
  id: string;
  display_name: string;
  username: string;
  avatar_path: string | null;
};

type MessageMedia = {
  id: string;
  message_id: string;
  media_type:
    | "image"
    | "file"
    | "audio";
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  created_at: string;
};

export type MessageSearchResult = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  content: string | null;
  reply_to_message_id: string | null;
  forwarded_from_message_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sender: Profile | null;
  media: MessageMedia[];
};

type MessageSearchProps = {
  conversationId: string;
  disabled?: boolean;
  onSelectMessage: (
    message: MessageSearchResult,
  ) => void;
};

function formatSearchTime(
  value: string,
) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    },
  ).format(date);
}

function getPreview(
  message: MessageSearchResult,
) {
  const content =
    message.content?.trim();

  if (content) {
    return content;
  }

  if (
    message.media.some(
      (item) =>
        item.media_type ===
        "audio",
    )
  ) {
    return "Voice message";
  }

  if (
    message.media.some(
      (item) =>
        item.media_type ===
        "image",
    )
  ) {
    return "Image";
  }

  if (
    message.media.some(
      (item) =>
        item.media_type ===
        "file",
    )
  ) {
    return "Attachment";
  }

  return "Message";
}

export default function MessageSearch({
  conversationId,
  disabled = false,
  onSelectMessage,
}: MessageSearchProps) {
  const router = useRouter();

  const [
    open,
    setOpen,
  ] = useState(false);

  const [
    query,
    setQuery,
  ] = useState("");

  const [
    results,
    setResults,
  ] = useState<
    MessageSearchResult[]
  >([]);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const inputRef =
    useRef<HTMLInputElement | null>(
      null,
    );

  useEffect(() => {
    if (!open) {
      return;
    }

    const frame =
      window.requestAnimationFrame(
        () => {
          inputRef.current?.focus();
        },
      );

    return () =>
      window.cancelAnimationFrame(
        frame,
      );
  }, [open]);

  function openSearch() {
    setOpen(true);
    setError("");
    setResults([]);
  }

  function closeSearch() {
    if (loading) {
      return;
    }

    setOpen(false);
    setQuery("");
    setResults([]);
    setError("");
  }

  async function submitSearch(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const value =
      query.trim();

    if (!value) {
      setResults([]);
      setError(
        "Enter something to search for.",
      );
      return;
    }

    if (!conversationId) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response =
        await fetch(
          `/api/conversations/${encodeURIComponent(
            conversationId,
          )}/messages?search=${encodeURIComponent(
            value,
          )}&limit=50`,
          {
            cache: "no-store",
          },
        );

      const data =
        await response.json();

      if (
        response.status ===
        401
      ) {
        router.push("/auth");
        return;
      }

      if (!response.ok) {
        setResults([]);
        setError(
          data.error ??
            "Unable to search messages.",
        );
        return;
      }

      setResults(
        Array.isArray(
          data.messages,
        )
          ? data.messages
          : [],
      );
    } catch {
      setResults([]);
      setError(
        "Unable to search messages.",
      );
    } finally {
      setLoading(false);
    }
  }

  function selectMessage(
    message: MessageSearchResult,
  ) {
    closeSearch();
    onSelectMessage(message);
  }

  return (
    <>
      <button
        type="button"
        onClick={openSearch}
        disabled={disabled}
        aria-label="Search messages"
        title="Search messages"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--muted-strong)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Search size={17} />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 px-3 py-3 sm:items-center sm:px-5"
          role="dialog"
          aria-modal="true"
          aria-labelledby="message-search-title"
        >
          <div className="flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-[1.75rem] border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
            <header className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-5 py-4">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--accent)]">
                  Conversation
                </p>

                <h2
                  id="message-search-title"
                  className="mt-1 text-xl font-bold tracking-[-0.03em]"
                >
                  Search messages
                </h2>
              </div>

              <button
                type="button"
                onClick={closeSearch}
                disabled={loading}
                aria-label="Close message search"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <X size={17} />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              <form
                onSubmit={
                  submitSearch
                }
              >
                <div className="relative">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
                  />

                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(
                      event,
                    ) =>
                      setQuery(
                        event.target
                          .value,
                      )
                    }
                    maxLength={80}
                    disabled={loading}
                    placeholder="Search this conversation…"
                    aria-label="Search this conversation"
                    className="h-11 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] pl-10 pr-20 text-sm outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/10 disabled:cursor-not-allowed disabled:opacity-50"
                  />

                  <button
                    type="submit"
                    disabled={
                      loading ||
                      !query.trim()
                    }
                    className="absolute right-1.5 top-1/2 inline-flex h-8 -translate-y-1/2 items-center gap-1.5 rounded-xl bg-[var(--accent)] px-3 text-xs font-semibold text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {loading ? (
                      <Loader2
                        size={13}
                        className="animate-spin"
                      />
                    ) : (
                      <Search
                        size={13}
                      />
                    )}
                    Search
                  </button>
                </div>
              </form>

              {error ? (
                <div className="mt-4 rounded-2xl border border-[var(--danger)]/20 bg-[var(--danger-soft)] px-4 py-3">
                  <p className="text-xs font-semibold text-[var(--danger)]">
                    {error}
                  </p>
                </div>
              ) : null}

              {loading ? (
                <div className="flex items-center justify-center py-12 text-[var(--muted)]">
                  <Loader2
                    size={21}
                    className="animate-spin"
                  />
                </div>
              ) : results.length ===
                0 ? (
                <div className="py-12 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                    <MessageCircle
                      size={19}
                    />
                  </div>

                  <p className="mt-4 text-sm font-semibold">
                    No matching messages
                  </p>

                  <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                    Search the conversation by message text.
                  </p>
                </div>
              ) : (
                <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)]">
                  {results.map(
                    (message) => {
                      const senderName =
                        message
                          .sender
                          ?.display_name ??
                        "Agoré user";

                      const preview =
                        getPreview(
                          message,
                        );

                      return (
                        <button
                          key={
                            message.id
                          }
                          type="button"
                          onClick={() =>
                            selectMessage(
                              message,
                            )
                          }
                          className="flex w-full items-start gap-3 border-b border-[var(--border)] px-3 py-3 text-left transition last:border-b-0 hover:bg-[var(--surface-muted)]"
                        >
                          <AgoreAvatar
                            avatarPath={
                              message
                                .sender
                                ?.avatar_path
                            }
                            name={
                              senderName
                            }
                            className="h-10 w-10 shrink-0"
                            textClassName="text-[10px]"
                          />

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-xs font-semibold text-[var(--accent)]">
                                {
                                  senderName
                                }
                              </p>

                              <span className="shrink-0 text-[10px] text-[var(--muted)]">
                                {formatSearchTime(
                                  message.created_at,
                                )}
                              </span>
                            </div>

                            <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-sm leading-5 text-[var(--foreground)]">
                              {
                                preview
                              }
                            </p>
                          </div>
                        </button>
                      );
                    },
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}