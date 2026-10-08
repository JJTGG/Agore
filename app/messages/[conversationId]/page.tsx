"use client";

import Link from "next/link";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  CornerUpLeft,
  Edit3,
  Loader2,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Shield,
  ShieldOff,
  UserMinus,
  Users,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import AgoreAvatar from "@/components/agore-avatar";
import MessageActionMenu from "./message-action-menu";
import MessageReactions from "./message-reactions";
import MessageStatus from "./message-status";
import ConversationPresence from "./conversation-presence";
import MessageMediaContent from "./message-media-content";
import MediaMessageComposer from "./media-message-composer";
import VoiceMessagePlayer from "./voice-message-player";
import VoiceNoteComposer from "./voice-note-composer";

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

type MessageMedia = {
  id: string;
  message_id: string;
  media_type: "image" | "file" | "audio";
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  created_at: string;
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
  media: MessageMedia[];
  reply_to_message?: {
    id: string;
    sender_id: string | null;
    content: string | null;
    created_at: string;
    sender: Profile | null;
    media?: MessageMedia[];
  } | null;
};

type ReplyTarget = Pick<
  Message,
  | "id"
  | "sender_id"
  | "content"
  | "created_at"
  | "sender"
> & {
  media?: MessageMedia[];
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
    month: "long",
    year: "numeric",
  }).format(date);
}

function getInitials(value: string) {
  return (
    value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(
        (part) =>
          part[0]?.toUpperCase() ?? "",
      )
      .join("") || "A"
  );
}

function getMessagePreview(
  message:
    | Pick<Message, "content" | "media">
    | {
        content: string | null;
        media?: MessageMedia[];
      }
    | null
    | undefined,
) {
  const content = message?.content?.trim();

  if (content) {
    return content;
  }

  const media = message?.media ?? [];

  if (
    media.some(
      (item) => item.media_type === "audio",
    )
  ) {
    return "Voice message";
  }

  if (
    media.some(
      (item) => item.media_type === "image",
    )
  ) {
    return "Image";
  }

  if (
    media.some(
      (item) => item.media_type === "file",
    )
  ) {
    return "Attachment";
  }

  return "Message";
}

function truncateMessage(
  message:
    | Pick<Message, "content" | "media">
    | {
        content: string | null;
        media?: MessageMedia[];
      }
    | null
    | undefined,
  length = 120,
) {
  const text = getMessagePreview(message);

  if (text.length <= length) {
    return text;
  }

  return `${text.slice(0, length - 1).trim()}…`;
}

function isSameMessageGroup(
  previous: Message | undefined,
  current: Message,
) {
  if (!previous) {
    return false;
  }

  if (
    previous.sender_id !== current.sender_id ||
    !previous.sender_id ||
    !current.sender_id
  ) {
    return false;
  }

  const previousDate = new Date(
    previous.created_at,
  ).getTime();

  const currentDate = new Date(
    current.created_at,
  ).getTime();

  if (
    Number.isNaN(previousDate) ||
    Number.isNaN(currentDate)
  ) {
    return false;
  }

  return (
    currentDate - previousDate <=
    5 * 60 * 1000
  );
}

function wasEdited(message: Message) {
  const created = new Date(
    message.created_at,
  ).getTime();

  const updated = new Date(
    message.updated_at,
  ).getTime();

  return (
    Number.isFinite(created) &&
    Number.isFinite(updated) &&
    updated - created > 1000
  );
}

type MessageBubbleProps = {
  message: Message;
  replyTarget: ReplyTarget | null;
  isOwn: boolean;
  grouped: boolean;
  currentUserId: string | null;
  conversationType: Conversation["type"];
  editing: boolean;
  editDraft: string;
  editSaving: boolean;
  onReply: (message: ReplyTarget) => void;
  onJumpToMessage: (
    messageId: string,
  ) => void;
  onEdit: (message: Message) => void;
  onEditDraftChange: (value: string) => void;
  onSaveEdit: (messageId: string) => Promise<void>;
  onCancelEdit: () => void;
  onDelete: (messageId: string) => Promise<void>;
};

function MessageBubble({
  message,
  replyTarget,
  isOwn,
  grouped,
  currentUserId,
  conversationType,
  editing,
  editDraft,
  editSaving,
  onReply,
  onJumpToMessage,
  onEdit,
  onEditDraftChange,
  onSaveEdit,
  onCancelEdit,
  onDelete,
}: MessageBubbleProps) {
  const hasText = Boolean(
    message.content?.trim(),
  );

  const audioMedia = message.media.filter(
    (media) =>
      media.media_type === "audio",
  );

  const visualMedia = message.media.filter(
    (media) =>
      media.media_type === "image" ||
      media.media_type === "file",
  );

  const senderName =
    message.sender?.display_name ??
    "Agoré user";

  if (editing) {
    return (
      <div
        className={`flex ${
          isOwn
            ? "justify-end"
            : "justify-start"
        }`}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void onSaveEdit(message.id);
          }}
          className="w-full max-w-[92%] sm:max-w-[78%]"
        >
          <div className="rounded-[1.35rem] border border-[var(--accent)]/40 bg-[var(--surface-raised)] p-3 shadow-[0_8px_28px_rgba(0,0,0,0.08)]">
            <textarea
              value={editDraft}
              onChange={(event) =>
                onEditDraftChange(
                  event.target.value,
                )
              }
              maxLength={5000}
              rows={3}
              autoFocus
              disabled={editSaving}
              className="min-h-20 w-full resize-none rounded-xl bg-[var(--surface-muted)] px-3 py-3 text-sm leading-6 outline-none placeholder:text-[var(--muted)] focus:ring-2 focus:ring-[var(--accent)]/10 disabled:opacity-50"
            />

            <div className="mt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onCancelEdit}
                disabled={editSaving}
                className="rounded-full px-3 py-2 text-xs font-semibold text-[var(--muted-strong)] transition hover:bg-[var(--surface-muted)] disabled:opacity-40"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={
                  editSaving ||
                  !editDraft.trim()
                }
                className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {editSaving ? (
                  <Loader2
                    size={14}
                    className="animate-spin"
                  />
                ) : (
                  <Edit3 size={14} />
                )}
                Save
              </button>
            </div>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div
      className={`flex ${
        isOwn
          ? "justify-end"
          : "justify-start"
      }`}
    >
      <div
        className={`group flex min-w-0 ${
          isOwn
            ? "max-w-[88%] flex-row-reverse"
            : "max-w-[92%] flex-row"
        } items-end gap-2 sm:max-w-[78%]`}
      >
        {!isOwn &&
        conversationType === "group" &&
        !grouped ? (
          <AgoreAvatar
            avatarPath={
              message.sender?.avatar_path
            }
            name={senderName}
            className="h-8 w-8"
            textClassName="text-[10px]"
          />
        ) : !isOwn &&
          conversationType === "group" ? (
          <span className="h-8 w-8 shrink-0" />
        ) : null}

        <div
          className={`relative min-w-0 ${
            isOwn
              ? "items-end"
              : "items-start"
          } flex flex-col`}
        >
          {!isOwn &&
          conversationType === "group" &&
          !grouped ? (
            <p className="mb-1 px-1 text-xs font-semibold text-[var(--accent)]">
              {senderName}
            </p>
          ) : null}

          <div
            className={`rounded-[1.35rem] px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${
              isOwn
                ? `bg-[var(--accent)] text-white ${
                    grouped
                      ? "rounded-tr-md"
                      : "rounded-br-md"
                  }`
                : `bg-[var(--surface-muted)] text-[var(--foreground)] ${
                    grouped
                      ? "rounded-tl-md"
                      : "rounded-bl-md"
                  }`
            }`}
          >
            {replyTarget ? (
              <button
                type="button"
                onClick={() =>
                  onJumpToMessage(
                    replyTarget.id,
                  )
                }
                className={`mb-3 block w-full overflow-hidden rounded-xl border-l-2 px-3 py-2 text-left transition ${
                  isOwn
                    ? "border-white/60 bg-white/10 hover:bg-white/15"
                    : "border-[var(--accent)] bg-[var(--surface)] hover:bg-[var(--surface-soft)]"
                }`}
              >
                <p
                  className={`text-[11px] font-semibold ${
                    isOwn
                      ? "text-white/85"
                      : "text-[var(--accent)]"
                  }`}
                >
                  {replyTarget.sender
                    ?.display_name ||
                    (replyTarget.sender_id ===
                    currentUserId
                      ? "You"
                      : "Message")}
                </p>

                <p
                  className={`mt-1 line-clamp-2 text-xs leading-5 ${
                    isOwn
                      ? "text-white/75"
                      : "text-[var(--muted)]"
                  }`}
                >
                  {truncateMessage(
                    replyTarget,
                  )}
                </p>
              </button>
            ) : message.reply_to_message_id ? (
              <div
                className={`mb-3 rounded-xl border-l-2 px-3 py-2 ${
                  isOwn
                    ? "border-white/60 bg-white/10"
                    : "border-[var(--accent)] bg-[var(--surface)]"
                }`}
              >
                <p
                  className={`text-xs ${
                    isOwn
                      ? "text-white/70"
                      : "text-[var(--muted)]"
                  }`}
                >
                  Original message unavailable
                </p>
              </div>
            ) : null}

            {visualMedia.length > 0 ? (
              <div
                className={
                  audioMedia.length > 0 ||
                  hasText
                    ? "space-y-3"
                    : undefined
                }
              >
                <MessageMediaContent
                  media={visualMedia}
                  isOwn={isOwn}
                />

                {audioMedia.length > 0 ? (
                  <div className="space-y-3">
                    {audioMedia.map((media) => (
                      <VoiceMessagePlayer
                        key={media.id}
                        storagePath={
                          media.storage_path
                        }
                        durationMs={
                          media.duration_ms
                        }
                        isOwn={isOwn}
                      />
                    ))}
                  </div>
                ) : null}

                {hasText ? (
                  <p className="whitespace-pre-wrap break-words text-[15px] leading-6">
                    {message.content}
                  </p>
                ) : null}
              </div>
            ) : audioMedia.length > 0 ? (
              <div
                className={
                  hasText
                    ? "space-y-3"
                    : undefined
                }
              >
                {audioMedia.map((media) => (
                  <VoiceMessagePlayer
                    key={media.id}
                    storagePath={
                      media.storage_path
                    }
                    durationMs={
                      media.duration_ms
                    }
                    isOwn={isOwn}
                  />
                ))}

                {hasText ? (
                  <p className="whitespace-pre-wrap break-words text-[15px] leading-6">
                    {message.content}
                  </p>
                ) : null}
              </div>
            ) : hasText ? (
              <p className="whitespace-pre-wrap break-words text-[15px] leading-6">
                {message.content}
              </p>
            ) : (
              <p
                className={`text-sm ${
                  isOwn
                    ? "text-white/70"
                    : "text-[var(--muted)]"
                }`}
              >
                Message unavailable
              </p>
            )}

            <div
              className={`mt-2 flex items-center justify-end gap-2 text-[10px] tabular-nums ${
                isOwn
                  ? "text-white/65"
                  : "text-[var(--muted)]"
              }`}
            >
              {wasEdited(message) ? (
                <span>edited</span>
              ) : null}

              <span>
                {formatMessageTime(
                  message.created_at,
                )}
              </span>

              {isOwn ? (
                <MessageStatus
                  conversationId={
                    message.conversation_id
                  }
                  senderId={
                    message.sender_id
                  }
                  createdAt={
                    message.created_at
                  }
                />
              ) : null}
            </div>
          </div>

          <div
            className={`mt-1 flex w-full items-center ${
              isOwn
                ? "justify-end"
                : "justify-start"
            }`}
          >
            <MessageReactions
              conversationId={
                message.conversation_id
              }
              messageId={message.id}
            />
          </div>

          <div
            className={`absolute top-1/2 z-20 flex -translate-y-1/2 items-center ${
              isOwn
                ? "right-full mr-1"
                : "left-full ml-1"
            }`}
          >
            <MessageActionMenu
              isOwn={isOwn}
              content={message.content}
              onReply={() =>
                onReply(message)
              }
              onEdit={() =>
                onEdit(message)
              }
              onDelete={() =>
                onDelete(message.id)
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ConversationPage() {
  const params =
    useParams<{
      conversationId: string;
    }>();

  const router = useRouter();

  const conversationId =
    params.conversationId;

  const [
    currentUserId,
    setCurrentUserId,
  ] = useState<string | null>(null);

  const [
    conversation,
    setConversation,
  ] = useState<Conversation | null>(
    null,
  );

  const [
    messages,
    setMessages,
  ] = useState<Message[]>([]);

  const [draft, setDraft] =
    useState("");

  const [
    replyingTo,
    setReplyingTo,
  ] = useState<ReplyTarget | null>(null);

  const [
    editingMessageId,
    setEditingMessageId,
  ] = useState<string | null>(null);

  const [
    editDraft,
    setEditDraft,
  ] = useState("");

  const [
    editSaving,
    setEditSaving,
  ] = useState(false);

  const [loading, setLoading] =
    useState(true);

  const [sending, setSending] =
    useState(false);

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const [error, setError] =
    useState("");

  const [
    showJumpToLatest,
    setShowJumpToLatest,
  ] = useState(false);

  const [
    highlightedMessageId,
    setHighlightedMessageId,
  ] = useState<string | null>(
    null,
  );

  const [
    groupOpen,
    setGroupOpen,
  ] = useState(false);

  const [
    groupLoading,
    setGroupLoading,
  ] = useState(false);

  const [
    groupMembers,
    setGroupMembers,
  ] = useState<GroupMember[]>([]);

  const [
    currentUserRole,
    setCurrentUserRole,
  ] = useState("member");

  const [groupName, setGroupName] =
    useState("");

  const [
    groupDescription,
    setGroupDescription,
  ] = useState("");

  const [
    savingGroup,
    setSavingGroup,
  ] = useState(false);

  const [
    groupActionError,
    setGroupActionError,
  ] = useState("");

  const [memberQuery, setMemberQuery] =
    useState("");

  const [
    memberResults,
    setMemberResults,
  ] = useState<MemberSearchResult[]>(
    [],
  );

  const [
    searchingMembers,
    setSearchingMembers,
  ] = useState(false);

  const [
    memberActionLoading,
    setMemberActionLoading,
  ] = useState<string | null>(null);

  const messagesViewportRef =
    useRef<HTMLDivElement | null>(null);

  const messagesBottomRef =
    useRef<HTMLDivElement | null>(null);

  const nearBottomRef =
    useRef(true);

  const initialScrollDoneRef =
    useRef(false);

  const highlightTimeoutRef =
    useRef<number | null>(null);

  const title = useMemo(() => {
    if (!conversation) {
      return "Messages";
    }

    if (conversation.type === "group") {
      return (
        conversation.name?.trim() ||
        "Unnamed group"
      );
    }

    return (
      conversation.participant
        ?.display_name ||
      "Agoré user"
    );
  }, [conversation]);

  const subtitle = useMemo(() => {
    if (!conversation) {
      return "";
    }

    if (conversation.type === "group") {
      return groupMembers.length > 0
        ? `${groupMembers.length} members`
        : "Group conversation";
    }

    return conversation.participant
      ? `@${conversation.participant.username}`
      : "Direct conversation";
  }, [
    conversation,
    groupMembers.length,
  ]);

  const participantAvatar =
    conversation?.type === "direct"
      ? conversation.participant
          ?.avatar_path
      : null;

  const loadConversation =
    useCallback(async () => {
      if (!conversationId) {
        return;
      }

      try {
        const response = await fetch(
          "/api/conversations?limit=50",
          {
            cache: "no-store",
          },
        );

        const data =
          await response.json();

        if (response.status === 401) {
          router.push("/auth");
          return;
        }

        if (!response.ok) {
          setError(
            data.error ??
              "Unable to load this conversation.",
          );
          return;
        }

        const found =
          Array.isArray(
            data.conversations,
          )
            ? (data.conversations.find(
                (
                  item: Conversation,
                ) =>
                  item.id ===
                  conversationId,
              ) as
                | Conversation
                | undefined)
            : undefined;

        if (!found) {
          setError(
            "Conversation not found.",
          );
          setConversation(null);
          return;
        }

        setConversation(found);
        setGroupName(
          found.name ?? "",
        );
        setGroupDescription(
          found.description ?? "",
        );
      } catch {
        setError(
          "Unable to load this conversation.",
        );
      }
    }, [conversationId, router]);

  const markConversationRead =
    useCallback(async () => {
      if (!conversationId) {
        return;
      }

      try {
        const response =
          await fetch(
            `/api/conversations/${encodeURIComponent(
              conversationId,
            )}/read`,
            {
              method: "PATCH",
            },
          );

        if (
          response.status === 401
        ) {
          router.push("/auth");
          return;
        }

        if (!response.ok) {
          console.warn(
            "Agore conversation read state could not be updated.",
          );
        }
      } catch {
        console.warn(
          "Agore conversation read state request failed.",
        );
      }
    }, [
      conversationId,
      router,
    ]);

  const loadMessages =
    useCallback(
      async (manual = false) => {
        if (!conversationId) {
          return;
        }

        if (manual) {
          setRefreshing(true);
        }

        try {
          const response =
            await fetch(
              `/api/conversations/${encodeURIComponent(
                conversationId,
              )}/messages?limit=100`,
              {
                cache: "no-store",
              },
            );

          const data =
            await response.json();

          if (
            response.status === 401
          ) {
            router.push("/auth");
            return;
          }

          if (!response.ok) {
            setError(
              data.error ??
                "Unable to load messages.",
            );
            return;
          }

          setMessages(
            Array.isArray(data.messages)
              ? data.messages
              : [],
          );

          void markConversationRead();
        } catch {
          setError(
            "Unable to load messages.",
          );
        } finally {
          setRefreshing(false);
        }
      },
      [
        conversationId,
        markConversationRead,
        router,
      ],
    );

  const loadGroupMembers =
    useCallback(async () => {
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
        const response =
          await fetch(
            `/api/conversations/${encodeURIComponent(
              conversationId,
            )}/members`,
            {
              cache: "no-store",
            },
          );

        const data =
          await response.json();

        if (
          response.status === 401
        ) {
          router.push("/auth");
          return;
        }

        if (!response.ok) {
          setGroupActionError(
            data.error ??
              "Unable to load group members.",
          );
          return;
        }

        setGroupMembers(
          Array.isArray(data.members)
            ? data.members
            : [],
        );

        setCurrentUserRole(
          data.currentUserRole ??
            "member",
        );
      } catch {
        setGroupActionError(
          "Unable to load group members.",
        );
      } finally {
        setGroupLoading(false);
      }
    }, [
      conversation,
      conversationId,
      router,
    ]);

  useEffect(() => {
    let active = true;

    async function loadCurrentUser() {
      const {
        data: { user },
      } =
        await supabase.auth.getUser();

      if (!active) {
        return;
      }

      setCurrentUserId(
        user?.id ?? null,
      );
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
      initialScrollDoneRef.current =
        false;

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
  }, [
    loadConversation,
    loadMessages,
  ]);

  useEffect(() => {
    if (!conversationId) {
      return;
    }

    const channel = supabase
      .channel(
        `messages:${conversationId}`,
      )
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
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          void loadMessages();
        },
      )
      .subscribe((status) => {
        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT"
        ) {
          setError(
            "Realtime messaging is unavailable. Refresh to reconnect.",
          );
        }
      });

    return () => {
      void supabase.removeChannel(
        channel,
      );
    };
  }, [
    conversationId,
    loadMessages,
  ]);

  useEffect(() => {
    if (
      groupOpen &&
      conversation?.type === "group"
    ) {
      void loadGroupMembers();
    }
  }, [
    groupOpen,
    conversation?.type,
    loadGroupMembers,
  ]);

  useEffect(() => {
    const viewport =
      messagesViewportRef.current;

    if (!viewport) {
      return;
    }

    const handleScroll = () => {
      const distanceFromBottom =
        viewport.scrollHeight -
        viewport.scrollTop -
        viewport.clientHeight;

      const nearBottom =
        distanceFromBottom <= 96;

      nearBottomRef.current =
        nearBottom;

      setShowJumpToLatest(
        !nearBottom,
      );
    };

    viewport.addEventListener(
      "scroll",
      handleScroll,
      { passive: true },
    );

    handleScroll();

    return () => {
      viewport.removeEventListener(
        "scroll",
        handleScroll,
      );
    };
  }, []);

  useEffect(() => {
    if (messages.length === 0) {
      return;
    }

    const shouldStick =
      !initialScrollDoneRef.current ||
      nearBottomRef.current;

    if (!shouldStick) {
      initialScrollDoneRef.current =
        true;
      return;
    }

    const frame =
      window.requestAnimationFrame(
        () => {
          messagesBottomRef.current?.scrollIntoView(
            {
              behavior:
                initialScrollDoneRef.current
                  ? "smooth"
                  : "auto",
              block: "end",
            },
          );

          initialScrollDoneRef.current =
            true;

          nearBottomRef.current =
            true;

          setShowJumpToLatest(false);
        },
      );

    return () =>
      window.cancelAnimationFrame(
        frame,
      );
  }, [messages]);

  useEffect(() => {
    return () => {
      if (
        highlightTimeoutRef.current !==
        null
      ) {
        window.clearTimeout(
          highlightTimeoutRef.current,
        );
      }
    };
  }, []);

  function scrollToLatest() {
    messagesBottomRef.current?.scrollIntoView(
      {
        behavior: "smooth",
        block: "end",
      },
    );

    nearBottomRef.current =
      true;

    setShowJumpToLatest(false);
  }

  function jumpToMessage(
    messageId: string,
  ) {
    const element =
      document.getElementById(
        `agore-message-${messageId}`,
      );

    if (!element) {
      return;
    }

    element.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });

    setHighlightedMessageId(
      messageId,
    );

    if (
      highlightTimeoutRef.current !==
      null
    ) {
      window.clearTimeout(
        highlightTimeoutRef.current,
      );
    }

    highlightTimeoutRef.current =
      window.setTimeout(() => {
        setHighlightedMessageId(null);
        highlightTimeoutRef.current =
          null;
      }, 1200);
  }

  function startReply(
    message: ReplyTarget,
  ) {
    setEditingMessageId(null);
    setEditDraft("");
    setReplyingTo(message);
    setError("");

    window.setTimeout(() => {
      document
        .querySelector<HTMLTextAreaElement>(
          'textarea[placeholder="Write a message…"]',
        )
        ?.focus();
    }, 0);
  }

  function beginEdit(
    message: Message,
  ) {
    const content =
      message.content ?? "";

    setReplyingTo(null);
    setError("");
    setEditingMessageId(
      message.id,
    );
    setEditDraft(content);

    window.setTimeout(() => {
      document
        .querySelector<HTMLTextAreaElement>(
          'textarea[autofocus]',
        )
        ?.focus();
    }, 0);
  }

  function cancelEdit() {
    setEditingMessageId(null);
    setEditDraft("");
    setEditSaving(false);
  }

  async function saveEdit(
    messageId: string,
  ) {
    const content =
      editDraft.trim();

    if (
      !content ||
      editSaving ||
      !conversationId
    ) {
      return;
    }

    setEditSaving(true);
    setError("");

    try {
      const response =
        await fetch(
          `/api/conversations/${encodeURIComponent(
            conversationId,
          )}/messages/${encodeURIComponent(
            messageId,
          )}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              content,
            }),
          },
        );

      const data =
        await response.json();

      if (
        response.status === 401
      ) {
        router.push("/auth");
        return;
      }

      if (!response.ok) {
        setError(
          data.error ??
            "Unable to edit the message.",
        );
        return;
      }

      if (data.message) {
        setMessages(
          (current) =>
            current.map(
              (message) => {
                if (
                  message.id !==
                  messageId
                ) {
                  return message;
                }

                return {
                  ...message,
                  content:
                    data.message
                      .content,
                  updated_at:
                    data.message
                      .updated_at,
                  deleted_at:
                    data.message
                      .deleted_at ??
                    null,
                };
              },
            ),
        );
      }

      setEditingMessageId(null);
      setEditDraft("");
    } catch {
      setError(
        "Unable to edit the message.",
      );
    } finally {
      setEditSaving(false);
    }
  }

  async function deleteMessage(
    messageId: string,
  ) {
    if (!conversationId) {
      return;
    }

    setError("");

    try {
      const response =
        await fetch(
          `/api/conversations/${encodeURIComponent(
            conversationId,
          )}/messages/${encodeURIComponent(
            messageId,
          )}`,
          {
            method: "DELETE",
          },
        );

      const data =
        await response.json();

      if (
        response.status === 401
      ) {
        router.push("/auth");
        throw new Error(
          "Authentication required.",
        );
      }

      if (!response.ok) {
        const message =
          data.error ??
          "Unable to delete the message.";

        setError(message);
        throw new Error(message);
      }

      setMessages(
        (current) =>
          current.filter(
            (message) =>
              message.id !==
              messageId,
          ),
      );

      if (
        editingMessageId ===
        messageId
      ) {
        cancelEdit();
      }

      if (
        replyingTo?.id ===
        messageId
      ) {
        setReplyingTo(null);
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message
      ) {
        setError(error.message);
      } else {
        setError(
          "Unable to delete the message.",
        );
      }

      throw error;
    }
  }

  function cancelReply() {
    setReplyingTo(null);
  }

  async function handleSend(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const content = draft.trim();

    if (
      !content ||
      sending ||
      !conversationId
    ) {
      return;
    }

    setSending(true);
    setError("");

    try {
      const response =
        await fetch(
          `/api/conversations/${encodeURIComponent(
            conversationId,
          )}/messages`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              content,
              reply_to_message_id:
                replyingTo?.id ?? null,
            }),
          },
        );

      const data =
        await response.json();

      if (
        response.status === 401
      ) {
        router.push("/auth");
        return;
      }

      if (!response.ok) {
        setError(
          data.error ??
            "Unable to send the message.",
        );
        return;
      }

      if (data.message) {
        const sentMessage =
          data.message as Message;

        if (replyingTo) {
          sentMessage.reply_to_message =
            {
              id: replyingTo.id,
              sender_id:
                replyingTo.sender_id,
              content:
                replyingTo.content,
              created_at:
                replyingTo.created_at,
              sender:
                replyingTo.sender ??
                null,
              media:
                replyingTo.media ?? [],
            };
        }

        setMessages(
          (current) => {
            if (
              current.some(
                (message) =>
                  message.id ===
                  sentMessage.id,
              )
            ) {
              return current;
            }

            return [
              ...current,
              sentMessage,
            ];
          },
        );
      }

      setDraft("");
      setReplyingTo(null);

      nearBottomRef.current =
        true;

      setShowJumpToLatest(false);

      void loadConversation();
    } catch {
      setError(
        "Unable to send the message.",
      );
    } finally {
      setSending(false);
    }
  }

  function handleVoiceSent() {
    setError("");
    nearBottomRef.current =
      true;
    setShowJumpToLatest(false);
    void loadMessages();
    void loadConversation();
  }

  function handleVoiceError(
    message: string,
  ) {
    setError(message);
  }

  function handleMediaSent() {
    setError("");
    nearBottomRef.current =
      true;
    setShowJumpToLatest(false);
    void loadMessages();
    void loadConversation();
  }

  function handleMediaError(
    message: string,
  ) {
    setError(message);
  }

  async function searchMembers(
    value = memberQuery,
  ) {
    const query = value.trim();

    if (query.length < 2) {
      setMemberResults([]);
      return;
    }

    setSearchingMembers(true);
    setGroupActionError("");

    try {
      const response =
        await fetch(
          `/api/users/search?q=${encodeURIComponent(
            query,
          )}&limit=20`,
          {
            cache: "no-store",
          },
        );

      const data =
        await response.json();

      if (
        response.status === 401
      ) {
        router.push("/auth");
        return;
      }

      if (!response.ok) {
        setGroupActionError(
          data.error ??
            "Unable to search people.",
        );
        setMemberResults([]);
        return;
      }

      const currentMemberIds =
        new Set(
          groupMembers.map(
            (member) =>
              member.userId,
          ),
        );

      setMemberResults(
        (
          Array.isArray(
            data.people,
          )
            ? data.people
            : []
        ).filter(
          (
            person: MemberSearchResult,
          ) =>
            !currentMemberIds.has(
              person.id,
            ),
        ),
      );
    } catch {
      setGroupActionError(
        "Unable to search people.",
      );
      setMemberResults([]);
    } finally {
      setSearchingMembers(false);
    }
  }

  async function addMember(
    userId: string,
  ) {
    if (
      currentUserRole !== "admin" ||
      memberActionLoading
    ) {
      return;
    }

    setMemberActionLoading(
      `add:${userId}`,
    );
    setGroupActionError("");

    try {
      const response =
        await fetch(
          `/api/conversations/${encodeURIComponent(
            conversationId,
          )}/members`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              userId,
            }),
          },
        );

      const data =
        await response.json();

      if (
        response.status === 401
      ) {
        router.push("/auth");
        return;
      }

      if (!response.ok) {
        setGroupActionError(
          data.error ??
            "Unable to add the member.",
        );
        return;
      }

      setMemberResults(
        (current) =>
          current.filter(
            (person) =>
              person.id !== userId,
          ),
      );

      await loadGroupMembers();
    } catch {
      setGroupActionError(
        "Unable to add the member.",
      );
    } finally {
      setMemberActionLoading(null);
    }
  }

  async function updateMemberRole(
    userId: string,
    requestedRole:
      | "admin"
      | "member",
  ) {
    if (
      currentUserRole !== "admin" ||
      userId === currentUserId ||
      memberActionLoading
    ) {
      return;
    }

    const member =
      groupMembers.find(
        (item) =>
          item.userId === userId,
      );

    const memberName =
      member?.profile
        ?.display_name ??
      "this member";

    const actionLabel =
      requestedRole === "admin"
        ? "promote this member to admin"
        : "remove this member's admin role";

    if (
      !window.confirm(
        `Are you sure you want to ${actionLabel}?`,
      )
    ) {
      return;
    }

    setMemberActionLoading(
      `role:${userId}`,
    );
    setGroupActionError("");

    try {
      const response =
        await fetch(
          `/api/conversations/${encodeURIComponent(
            conversationId,
          )}/members`,
          {
            method: "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              userId,
              role: requestedRole,
            }),
          },
        );

      const data =
        await response.json();

      if (
        response.status === 401
      ) {
        router.push("/auth");
        return;
      }

      if (!response.ok) {
        setGroupActionError(
          data.error ??
            `Unable to update ${memberName}'s role.`,
        );
        return;
      }

      await loadGroupMembers();
    } catch {
      setGroupActionError(
        "Unable to update the member role.",
      );
    } finally {
      setMemberActionLoading(null);
    }
  }

  async function removeMember(
    userId: string,
  ) {
    if (
      memberActionLoading ||
      (userId !== currentUserId &&
        currentUserRole !== "admin")
    ) {
      return;
    }

    const isSelf =
      userId === currentUserId;

    if (
      !window.confirm(
        isSelf
          ? "Leave this group?"
          : "Remove this member from the group?",
      )
    ) {
      return;
    }

    setMemberActionLoading(
      `remove:${userId}`,
    );
    setGroupActionError("");

    try {
      const url =
        userId === currentUserId
          ? `/api/conversations/${encodeURIComponent(
              conversationId,
            )}/members`
          : `/api/conversations/${encodeURIComponent(
              conversationId,
            )}/members?userId=${encodeURIComponent(
              userId,
            )}`;

      const response =
        await fetch(url, {
          method: "DELETE",
        });

      const data =
        await response.json();

      if (
        response.status === 401
      ) {
        router.push("/auth");
        return;
      }

      if (!response.ok) {
        setGroupActionError(
          data.error ??
            "Unable to update group membership.",
        );
        return;
      }

      if (isSelf) {
        router.push("/messages");
        return;
      }

      await loadGroupMembers();
    } catch {
      setGroupActionError(
        "Unable to update group membership.",
      );
    } finally {
      setMemberActionLoading(null);
    }
  }

  async function saveGroupSettings(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      currentUserRole !== "admin" ||
      savingGroup
    ) {
      return;
    }

    const name =
      groupName.trim();

    const description =
      groupDescription.trim();

    if (!name) {
      setGroupActionError(
        "Group name cannot be empty.",
      );
      return;
    }

    setSavingGroup(true);
    setGroupActionError("");

    try {
      const response =
        await fetch(
          `/api/conversations/${encodeURIComponent(
            conversationId,
          )}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              name,
              description,
            }),
          },
        );

      const data =
        await response.json();

      if (
        response.status === 401
      ) {
        router.push("/auth");
        return;
      }

      if (!response.ok) {
        setGroupActionError(
          data.error ??
            "Unable to update group settings.",
        );
        return;
      }

      if (data.conversation) {
        setConversation(
          (current) =>
            current
              ? {
                  ...current,
                  name:
                    data
                      .conversation
                      .name,
                  description:
                    data
                      .conversation
                      .description,
                  updated_at:
                    data
                      .conversation
                      .updated_at ??
                    current.updated_at,
                }
              : current,
        );
      }
    } catch {
      setGroupActionError(
        "Unable to update group settings.",
      );
    } finally {
      setSavingGroup(false);
    }
  }

  function handleComposerKeyDown(
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ) {
    if (
      event.key === "Enter" &&
      (event.ctrlKey || event.metaKey)
    ) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <main className="h-dvh max-h-dvh overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col md:px-4 md:py-4">
        <header className="flex h-14 shrink-0 items-center justify-between px-3 md:px-1">
          <button
            type="button"
            onClick={() =>
              router.push("/messages")
            }
            className="inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold text-[var(--muted-strong)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
          >
            <ArrowLeft size={17} />
            <span className="hidden sm:inline">
              Messages
            </span>
          </button>

          <Link
            href="/home"
            className="text-sm font-bold tracking-[0.18em] text-[var(--accent)]"
          >
            AGORÉ
          </Link>

          <div className="w-20 sm:w-28" />
        </header>

        <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden border-y border-[var(--border)] bg-[var(--surface)] md:min-h-0 md:rounded-[1.75rem] md:border md:shadow-[0_12px_40px_rgba(0,0,0,0.05)]">
          <header className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-5">
            <AgoreAvatar
              avatarPath={
                participantAvatar
              }
              name={title}
              className="h-11 w-11"
              textClassName="text-xs"
            />

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[15px] font-bold tracking-[-0.01em]">
                {title}
              </h1>

              <p className="truncate text-xs text-[var(--muted)]">
                {conversation?.type ===
                "direct" ? (
                  <ConversationPresence
                    conversationId={
                      conversation.id
                    }
                    currentUserId={
                      currentUserId
                    }
                    participantId={
                      conversation
                        .participant
                        ?.id ?? null
                    }
                    fallback={subtitle}
                  />
                ) : (
                  subtitle
                )}
              </p>
            </div>

            <div className="flex items-center gap-1">
              {conversation?.type ===
              "group" ? (
                <button
                  type="button"
                  onClick={() =>
                    setGroupOpen(true)
                  }
                  aria-label="Open group details"
                  title="Group details"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--muted-strong)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
                >
                  <Settings size={17} />
                </button>
              ) : null}

              <button
                type="button"
                onClick={() =>
                  void loadMessages(true)
                }
                disabled={
                  refreshing || loading
                }
                aria-label="Refresh conversation"
                title="Refresh"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--muted-strong)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RefreshCw
                  size={17}
                  className={
                    refreshing
                      ? "animate-spin"
                      : undefined
                  }
                />
              </button>
            </div>
          </header>

          <div
            ref={messagesViewportRef}
            className="relative min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-3 py-5 sm:px-5 sm:py-6"
          >
            {loading ? (
              <div className="flex min-h-[50vh] items-center justify-center">
                <Loader2
                  size={22}
                  className="animate-spin text-[var(--accent)]"
                />
              </div>
            ) : error &&
              !conversation ? (
              <div className="flex min-h-[50vh] flex-col items-center justify-center px-5 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--danger-soft)] text-[var(--danger)]">
                  <MessageCircle size={20} />
                </div>

                <p className="mt-4 max-w-sm text-sm font-medium text-[var(--danger)]">
                  {error}
                </p>

                <Link
                  href="/messages"
                  className="mt-5 rounded-full bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)]"
                >
                  Back to messages
                </Link>
              </div>
            ) : messages.length ===
              0 ? (
              <div className="flex min-h-[50vh] flex-col items-center justify-center px-5 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                  <MessageCircle size={22} />
                </div>

                <h2 className="mt-5 text-lg font-bold tracking-[-0.02em]">
                  Start the conversation
                </h2>

                <p className="mt-2 max-w-sm text-sm leading-6 text-[var(--muted)]">
                  Send the first message and this space becomes yours to fill.
                </p>
              </div>
            ) : (
              <div className="mx-auto flex w-full max-w-4xl flex-col gap-1">
                {messages.map(
                  (message, index) => {
                    const previousMessage =
                      messages[index - 1];

                    const isOwn =
                      message.sender_id ===
                      currentUserId;

                    const grouped =
                      isSameMessageGroup(
                        previousMessage,
                        message,
                      );

                    const currentDay =
                      formatMessageDay(
                        message.created_at,
                      );

                    const previousDay =
                      previousMessage
                        ? formatMessageDay(
                            previousMessage.created_at,
                          )
                        : null;

                    const replyTarget =
                      message.reply_to_message ??
                      messages.find(
                        (candidate) =>
                          candidate.id ===
                          message.reply_to_message_id,
                      ) ??
                      null;

                    return (
                      <div
                        id={`agore-message-${message.id}`}
                        key={message.id}
                        className={`rounded-2xl transition-all duration-300 ${
                          highlightedMessageId ===
                          message.id
                            ? "bg-[var(--accent-soft)]/70 ring-2 ring-[var(--accent)]/30"
                            : ""
                        } ${
                          grouped
                            ? "mt-0.5"
                            : "mt-4 first:mt-0"
                        }`}
                      >
                        {currentDay !==
                        previousDay ? (
                          <div className="mb-5 mt-2 flex items-center gap-3">
                            <div className="h-px flex-1 bg-[var(--border)]" />

                            <span className="rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                              {currentDay}
                            </span>

                            <div className="h-px flex-1 bg-[var(--border)]" />
                          </div>
                        ) : null}

                        <MessageBubble
                          message={message}
                          replyTarget={
                            replyTarget
                          }
                          isOwn={isOwn}
                          grouped={grouped}
                          currentUserId={
                            currentUserId
                          }
                          conversationType={
                            conversation?.type ??
                            "direct"
                          }
                          editing={
                            editingMessageId ===
                            message.id
                          }
                          editDraft={
                            editingMessageId ===
                            message.id
                              ? editDraft
                              : ""
                          }
                          editSaving={
                            editSaving
                          }
                          onReply={
                            startReply
                          }
                          onJumpToMessage={
                            jumpToMessage
                          }
                          onEdit={
                            beginEdit
                          }
                          onEditDraftChange={
                            setEditDraft
                          }
                          onSaveEdit={
                            saveEdit
                          }
                          onCancelEdit={
                            cancelEdit
                          }
                          onDelete={
                            deleteMessage
                          }
                        />
                      </div>
                    );
                  },
                )}

                <div
                  ref={messagesBottomRef}
                  className="h-1"
                  aria-hidden="true"
                />
              </div>
            )}

            {error &&
            conversation ? (
              <div className="sticky bottom-2 mx-auto mt-3 max-w-4xl rounded-2xl border border-[var(--danger)]/20 bg-[var(--danger-soft)] px-4 py-3">
                <p className="text-xs font-semibold text-[var(--danger)]">
                  {error}
                </p>
              </div>
            ) : null}

            {showJumpToLatest &&
            messages.length > 0 ? (
              <button
                type="button"
                onClick={scrollToLatest}
                aria-label="Jump to latest messages"
                title="Jump to latest"
                className="sticky bottom-3 left-full mt-2 inline-flex h-10 w-10 translate-x-[-3.25rem] items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--foreground)] shadow-lg transition hover:border-[var(--accent)]/40 hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
              >
                <ArrowDown size={17} />
              </button>
            ) : null}
          </div>

          <form
            onSubmit={handleSend}
            className="shrink-0 border-t border-[var(--border)] bg-[var(--surface-raised)] p-3 sm:p-4"
          >
            <div className="mx-auto max-w-4xl">
              {replyingTo ? (
                <div className="mb-3 flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                    <CornerUpLeft size={16} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-[var(--accent)]">
                      Replying to{" "}
                      {replyingTo.sender_id ===
                      currentUserId
                        ? "yourself"
                        : replyingTo.sender
                            ?.display_name ??
                          "message"}
                    </p>

                    <p className="mt-1 truncate text-xs text-[var(--muted)]">
                      {truncateMessage(
                        replyingTo,
                      )}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={cancelReply}
                    disabled={sending}
                    aria-label="Cancel reply"
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <X size={15} />
                  </button>
                </div>
              ) : null}

              <div className="flex items-end gap-2">
                <MediaMessageComposer
                  conversationId={
                    conversationId
                  }
                  disabled={
                    sending ||
                    !conversation
                  }
                  onSent={
                    handleMediaSent
                  }
                  onError={
                    handleMediaError
                  }
                />

                <div className="min-w-0 flex-1 rounded-[1.35rem] border border-[var(--border)] bg-[var(--surface)] transition focus-within:border-[var(--accent)]/50 focus-within:ring-2 focus-within:ring-[var(--accent)]/10">
                  <textarea
                    value={draft}
                    onChange={(event) =>
                      setDraft(
                        event.target
                          .value,
                      )
                    }
                    onKeyDown={
                      handleComposerKeyDown
                    }
                    maxLength={5000}
                    rows={1}
                    disabled={
                      sending ||
                      !conversation
                    }
                    placeholder="Write a message…"
                    aria-label="Write a message"
                    className="max-h-36 min-h-11 w-full resize-none overflow-y-auto bg-transparent px-4 py-3 text-sm leading-5 outline-none placeholder:text-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>

                <VoiceNoteComposer
                  conversationId={
                    conversationId
                  }
                  disabled={
                    sending ||
                    !conversation
                  }
                  onSent={
                    handleVoiceSent
                  }
                  onError={
                    handleVoiceError
                  }
                />

                <button
                  type="submit"
                  disabled={
                    sending ||
                    !conversation ||
                    !draft.trim()
                  }
                  aria-label={
                    replyingTo
                      ? "Send reply"
                      : "Send message"
                  }
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-sm transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {sending ? (
                    <Loader2
                      size={17}
                      className="animate-spin"
                    />
                  ) : (
                    <ArrowDown
                      size={17}
                      className="rotate-[-90deg]"
                    />
                  )}
                </button>
              </div>

              <p className="mt-2 px-1 text-[10px] text-[var(--muted)]">
                Enter for a new line · Ctrl/Cmd + Enter to send
              </p>
            </div>
          </form>
        </section>
      </div>

      {groupOpen &&
      conversation?.type ===
        "group" ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-5"
          role="dialog"
          aria-modal="true"
          aria-labelledby="group-settings-title"
        >
          <div className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[1.75rem] border border-[var(--border)] bg-[var(--surface)] shadow-2xl sm:rounded-[1.75rem]">
            <header className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-5 py-4 sm:px-6">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--accent)]">
                  Group
                </p>

                <h2
                  id="group-settings-title"
                  className="mt-1 text-xl font-bold tracking-[-0.03em]"
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
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted-strong)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
              >
                <X size={17} />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <AgoreAvatar
                    avatarPath={
                      conversation.image_path
                    }
                    name={title}
                    className="h-16 w-16"
                    textClassName="text-base"
                  />

                  <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[var(--surface)] bg-[var(--accent-soft)] text-[var(--accent)]">
                    <Users size={12} />
                  </div>
                </div>

                <div className="min-w-0">
                  <p className="truncate text-lg font-bold tracking-[-0.02em]">
                    {title}
                  </p>

                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {subtitle}
                  </p>
                </div>
              </div>

              {currentUserRole ===
              "admin" ? (
                <form
                  onSubmit={
                    saveGroupSettings
                  }
                  className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-4"
                >
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                    <Settings size={13} />
                    Group settings
                  </div>

                  <label className="mt-4 block">
                    <span className="text-xs font-semibold text-[var(--muted-strong)]">
                      Group name
                    </span>

                    <input
                      value={groupName}
                      onChange={(event) =>
                        setGroupName(
                          event.target
                            .value,
                        )
                      }
                      maxLength={80}
                      disabled={savingGroup}
                      className="mt-1.5 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm outline-none transition focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/10 disabled:opacity-50"
                    />
                  </label>

                  <label className="mt-4 block">
                    <span className="text-xs font-semibold text-[var(--muted-strong)]">
                      Description
                    </span>

                    <textarea
                      value={
                        groupDescription
                      }
                      onChange={(event) =>
                        setGroupDescription(
                          event.target
                            .value,
                        )
                      }
                      maxLength={500}
                      rows={3}
                      disabled={savingGroup}
                      className="mt-1.5 min-h-20 w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-sm leading-6 outline-none transition focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/10 disabled:opacity-50"
                    />
                  </label>

                  <div className="mt-4 flex justify-end">
                    <button
                      type="submit"
                      disabled={
                        savingGroup ||
                        !groupName.trim()
                      }
                      className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {savingGroup ? (
                        <Loader2
                          size={14}
                          className="animate-spin"
                        />
                      ) : (
                        <Settings
                          size={14}
                        />
                      )}
                      Save changes
                    </button>
                  </div>
                </form>
              ) : null}

              <section className="mt-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                      Members
                    </p>

                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {groupMembers.length}{" "}
                      active member
                      {groupMembers.length ===
                      1
                        ? ""
                        : "s"}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      void loadGroupMembers()
                    }
                    disabled={
                      groupLoading
                    }
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--muted-strong)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)] disabled:opacity-40"
                    aria-label="Refresh members"
                    title="Refresh members"
                  >
                    <RefreshCw
                      size={15}
                      className={
                        groupLoading
                          ? "animate-spin"
                          : undefined
                      }
                    />
                  </button>
                </div>

                {groupActionError ? (
                  <div className="mt-3 rounded-xl border border-[var(--danger)]/20 bg-[var(--danger-soft)] px-3 py-2.5">
                    <p className="text-xs font-semibold leading-5 text-[var(--danger)]">
                      {groupActionError}
                    </p>
                  </div>
                ) : null}

                <div className="mt-3 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)]">
                  {groupLoading &&
                  groupMembers.length ===
                    0 ? (
                    <div className="flex items-center justify-center px-4 py-8 text-[var(--muted)]">
                      <Loader2
                        size={18}
                        className="animate-spin"
                      />
                    </div>
                  ) : groupMembers.length ===
                    0 ? (
                    <div className="px-4 py-8 text-center">
                      <p className="text-sm font-semibold">
                        No active members found
                      </p>

                      <p className="mt-1 text-xs text-[var(--muted)]">
                        Refresh the group to try again.
                      </p>
                    </div>
                  ) : (
                    <div>
                      {groupMembers.map(
                        (member) => {
                          const profile =
                            member.profile;

                          const memberName =
                            profile?.display_name ??
                            "Agoré user";

                          const isSelf =
                            member.userId ===
                            currentUserId;

                          const actionLoading =
                            memberActionLoading?.endsWith(
                              `:${member.userId}`,
                            ) ?? false;

                          const canManage =
                            currentUserRole ===
                              "admin" &&
                            !isSelf;

                          return (
                            <div
                              key={
                                member.userId
                              }
                              className="flex items-center gap-3 border-b border-[var(--border)] px-3 py-3 last:border-b-0"
                            >
                              <AgoreAvatar
                                avatarPath={
                                  profile
                                    ?.avatar_path
                                }
                                name={
                                  memberName
                                }
                                className="h-10 w-10"
                                textClassName="text-[10px]"
                              />

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="truncate text-sm font-semibold">
                                    {
                                      memberName
                                    }
                                  </p>

                                  {isSelf ? (
                                    <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--accent)]">
                                      You
                                    </span>
                                  ) : null}

                                  {member.role ===
                                  "admin" ? (
                                    <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--muted-strong)]">
                                      Admin
                                    </span>
                                  ) : null}
                                </div>

                                {profile
                                  ?.username ? (
                                  <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                                    @
                                    {
                                      profile.username
                                    }
                                  </p>
                                ) : null}
                              </div>

                              {canManage ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void updateMemberRole(
                                        member.userId,
                                        member.role ===
                                          "admin"
                                          ? "member"
                                          : "admin",
                                      )
                                    }
                                    disabled={
                                      memberActionLoading !==
                                        null ||
                                      groupLoading
                                    }
                                    title={
                                      member.role ===
                                      "admin"
                                        ? "Remove admin"
                                        : "Make admin"
                                    }
                                    aria-label={
                                      member.role ===
                                      "admin"
                                        ? `Remove admin from ${memberName}`
                                        : `Make ${memberName} an admin`
                                    }
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--muted-strong)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    {actionLoading ? (
                                      <Loader2
                                        size={
                                          15
                                        }
                                        className="animate-spin"
                                      />
                                    ) : member.role ===
                                      "admin" ? (
                                      <ShieldOff
                                        size={
                                          15
                                        }
                                      />
                                    ) : (
                                      <Shield
                                        size={
                                          15
                                        }
                                      />
                                    )}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      void removeMember(
                                        member.userId,
                                      )
                                    }
                                    disabled={
                                      memberActionLoading !==
                                        null ||
                                      groupLoading
                                    }
                                    title="Remove member"
                                    aria-label={`Remove ${memberName}`}
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--muted-strong)] transition hover:bg-[var(--danger-soft)] hover:text-[var(--danger)] disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    {memberActionLoading ===
                                    `remove:${member.userId}` ? (
                                      <Loader2
                                        size={
                                          15
                                        }
                                        className="animate-spin"
                                      />
                                    ) : (
                                      <UserMinus
                                        size={
                                          15
                                        }
                                      />
                                    )}
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          );
                        },
                      )}
                    </div>
                  )}
                </div>
              </section>

              {currentUserRole ===
              "admin" ? (
                <section className="mt-6">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                      Add members
                    </p>

                    <p className="mt-1 text-sm text-[var(--muted)]">
                      Search for another Agoré user to add to this group.
                    </p>
                  </div>

                  <div className="mt-3 flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] px-3">
                    <Search
                      size={16}
                      className="shrink-0 text-[var(--muted)]"
                    />

                    <input
                      value={memberQuery}
                      onChange={(event) => {
                        const value =
                          event.target
                            .value;

                        setMemberQuery(
                          value,
                        );

                        if (
                          value.trim()
                            .length <
                          2
                        ) {
                          setMemberResults(
                            [],
                          );
                        }
                      }}
                      onKeyDown={(event) => {
                        if (
                          event.key ===
                          "Enter"
                        ) {
                          event.preventDefault();
                          void searchMembers();
                        }
                      }}
                      placeholder="Search people…"
                      className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--muted)]"
                    />

                    <button
                      type="button"
                      onClick={() =>
                        void searchMembers()
                      }
                      disabled={
                        searchingMembers ||
                        memberQuery.trim()
                          .length <
                          2
                      }
                      className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full bg-[var(--accent)] px-3 text-xs font-semibold text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {searchingMembers ? (
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

                  {memberResults.length >
                  0 ? (
                    <div className="mt-3 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)]">
                      {memberResults.map(
                        (person) => {
                          const actionKey =
                            `add:${person.id}`;

                          return (
                            <div
                              key={
                                person.id
                              }
                              className="flex items-center gap-3 border-b border-[var(--border)] px-3 py-3 last:border-b-0"
                            >
                              <AgoreAvatar
                                avatarPath={
                                  person.avatar_path
                                }
                                name={
                                  person.display_name
                                }
                                className="h-10 w-10"
                                textClassName="text-[10px]"
                              />

                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold">
                                  {
                                    person.display_name
                                  }
                                </p>

                                <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                                  @
                                  {
                                    person.username
                                  }
                                </p>
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  void addMember(
                                    person.id,
                                  )
                                }
                                disabled={
                                  memberActionLoading !==
                                    null ||
                                  groupLoading
                                }
                                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)]/40 hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {memberActionLoading ===
                                actionKey ? (
                                  <Loader2
                                    size={
                                      13
                                    }
                                    className="animate-spin"
                                  />
                                ) : (
                                  <Plus
                                    size={
                                      13
                                    }
                                  />
                                )}
                                Add
                              </button>
                            </div>
                          );
                        },
                      )}
                    </div>
                  ) : memberQuery.trim()
                      .length >= 2 &&
                    !searchingMembers ? (
                    <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-5 text-center">
                      <p className="text-sm font-semibold">
                        No new members found
                      </p>

                      <p className="mt-1 text-xs text-[var(--muted)]">
                        Try a different name or username.
                      </p>
                    </div>
                  ) : null}
                </section>
              ) : null}

              <section className="mt-6">
                <div className="rounded-2xl border border-[var(--danger)]/20 bg-[var(--danger-soft)] p-4">
                  <p className="text-sm font-semibold text-[var(--danger)]">
                    Leave group
                  </p>

                  <p className="mt-1 text-xs leading-5 text-[var(--danger)]/80">
                    You will stop receiving messages from this group until you are added again.
                  </p>

                  <button
                    type="button"
                    onClick={() =>
                      void removeMember(
                        currentUserId ??
                          "",
                      )
                    }
                    disabled={
                      !currentUserId ||
                      memberActionLoading !==
                        null ||
                      groupLoading
                    }
                    className="mt-3 inline-flex items-center gap-2 rounded-full border border-[var(--danger)]/20 bg-[var(--surface)] px-3.5 py-2 text-xs font-semibold text-[var(--danger)] transition hover:bg-[var(--danger)]/5 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {memberActionLoading ===
                    `remove:${currentUserId}` ? (
                      <Loader2
                        size={13}
                        className="animate-spin"
                      />
                    ) : (
                      <UserMinus
                        size={13}
                      />
                    )}
                    Leave group
                  </button>
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}