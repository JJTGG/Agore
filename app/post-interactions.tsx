"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Check,
  ChevronDown,
  Edit3,
  Heart,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Repeat2,
  Send,
  Trash2,
  X,
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

type ReactionRow = {
  reaction_type: ReactionType;
  user_id: string;
};

type CommentProfile =
  | {
      display_name: string;
      username: string;
    }
  | Array<{
      display_name: string;
      username: string;
    }>
  | null;

type Comment = {
  id: string;
  post_id: string;
  author_id: string;
  parent_comment_id: string | null;
  content: string;
  created_at: string;
  updated_at: string;
  profiles: CommentProfile;
};

type PostInteractionsProps = {
  postId: string;
  initialContent: string;
  isOwner: boolean;
  onPostUpdated?: (postId: string, content: string) => void;
  onPostDeleted?: (postId: string) => void;
};

const REACTIONS: Array<{
  type: ReactionType;
  emoji: string;
  label: string;
}> = [
  { type: "like", emoji: "👍", label: "Like" },
  { type: "love", emoji: "❤️", label: "Love" },
  { type: "laugh", emoji: "😂", label: "Laugh" },
  { type: "care", emoji: "🤍", label: "Care" },
  { type: "wow", emoji: "😮", label: "Wow" },
  { type: "sad", emoji: "😢", label: "Sad" },
  { type: "angry", emoji: "😡", label: "Angry" },
];

const supabase = createClient();

function getReaction(type: ReactionType) {
  return REACTIONS.find((reaction) => reaction.type === type);
}

function getCommentProfile(comment: Comment) {
  if (!comment.profiles) {
    return null;
  }

  return Array.isArray(comment.profiles)
    ? comment.profiles[0] ?? null
    : comment.profiles;
}

function formatCommentDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function PostInteractions({
  postId,
  initialContent,
  isOwner,
  onPostUpdated,
  onPostDeleted,
}: PostInteractionsProps) {
  const [viewerId, setViewerId] = useState<string | null>(null);

  const [reactionCounts, setReactionCounts] = useState<
    Record<ReactionType, number>
  >({
    like: 0,
    love: 0,
    laugh: 0,
    care: 0,
    wow: 0,
    sad: 0,
    angry: 0,
  });

  const [myReaction, setMyReaction] =
    useState<ReactionType | null>(null);

  const [repostCount, setRepostCount] = useState(0);
  const [hasReposted, setHasReposted] = useState(false);
  const [commentCount, setCommentCount] = useState(0);

  const [reactionPickerOpen, setReactionPickerOpen] =
    useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);

  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentPublishing, setCommentPublishing] =
    useState(false);
  const [commentContent, setCommentContent] = useState("");
  const [replyingTo, setReplyingTo] = useState<Comment | null>(
    null,
  );

  const [reactionLoading, setReactionLoading] =
    useState(false);
  const [repostLoading, setRepostLoading] =
    useState(false);

  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] =
    useState(initialContent);
  const [editLoading, setEditLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [error, setError] = useState("");

  const totalReactionCount = useMemo(
    () =>
      Object.values(reactionCounts).reduce(
        (total, count) => total + count,
        0,
      ),
    [reactionCounts],
  );

  const selectedReaction = myReaction
    ? getReaction(myReaction)
    : null;

  const loadInteractionState = useCallback(async () => {
    setError("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setViewerId(null);
        return;
      }

      setViewerId(user.id);

      const [
        reactionsResult,
        repostsResult,
        commentCountResult,
      ] = await Promise.all([
        supabase
          .from("post_reactions")
          .select("reaction_type, user_id")
          .eq("post_id", postId),

        supabase
          .from("reposts")
          .select("id, user_id")
          .eq("post_id", postId),

        supabase
          .from("comments")
          .select("id", {
            count: "exact",
            head: true,
          })
          .eq("post_id", postId),
      ]);

      if (reactionsResult.error) {
        throw reactionsResult.error;
      }

      if (repostsResult.error) {
        throw repostsResult.error;
      }

      if (commentCountResult.error) {
        throw commentCountResult.error;
      }

      const nextCounts: Record<ReactionType, number> = {
        like: 0,
        love: 0,
        laugh: 0,
        care: 0,
        wow: 0,
        sad: 0,
        angry: 0,
      };

      let nextMyReaction: ReactionType | null = null;

      for (const reaction of (reactionsResult.data ??
        []) as ReactionRow[]) {
        nextCounts[reaction.reaction_type] += 1;

        if (reaction.user_id === user.id) {
          nextMyReaction = reaction.reaction_type;
        }
      }

      const repostRows = repostsResult.data ?? [];

      setReactionCounts(nextCounts);
      setMyReaction(nextMyReaction);
      setRepostCount(repostRows.length);
      setHasReposted(
        repostRows.some(
          (repost) => repost.user_id === user.id,
        ),
      );
      setCommentCount(commentCountResult.count ?? 0);
    } catch (requestError) {
      console.error(
        "Failed to load Agore post interactions:",
        requestError,
      );

      setError("Unable to load post interactions.");
    }
  }, [postId]);

  useEffect(() => {
    void loadInteractionState();
  }, [loadInteractionState]);

  useEffect(() => {
    setEditContent(initialContent);
  }, [initialContent]);

  async function chooseReaction(
    reactionType: ReactionType,
  ) {
    if (reactionLoading) {
      return;
    }

    setReactionLoading(true);
    setError("");

    const previousReaction = myReaction;
    const previousCounts = { ...reactionCounts };

    setReactionPickerOpen(false);

    try {
      if (previousReaction === reactionType) {
        const response = await fetch(
          `/api/posts/${encodeURIComponent(
            postId,
          )}/reaction`,
          {
            method: "DELETE",
          },
        );

        const data = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            data?.error ??
              "Unable to remove your reaction.",
          );
        }

        setReactionCounts((current) => ({
          ...current,
          [reactionType]: Math.max(
            0,
            current[reactionType] - 1,
          ),
        }));
        setMyReaction(null);

        return;
      }

      const response = await fetch(
        `/api/posts/${encodeURIComponent(
          postId,
        )}/reaction`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            reactionType,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ??
            "Unable to save your reaction.",
        );
      }

      setReactionCounts((current) => {
        const next = { ...current };

        if (previousReaction) {
          next[previousReaction] = Math.max(
            0,
            next[previousReaction] - 1,
          );
        }

        next[reactionType] += 1;

        return next;
      });

      setMyReaction(reactionType);
    } catch (requestError) {
      setReactionCounts(previousCounts);
      setMyReaction(previousReaction);

      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to update your reaction.",
      );
    } finally {
      setReactionLoading(false);
    }
  }

  async function toggleRepost() {
    if (repostLoading) {
      return;
    }

    setRepostLoading(true);
    setError("");

    try {
      const method = hasReposted ? "DELETE" : "POST";

      const response = await fetch(
        `/api/posts/${encodeURIComponent(
          postId,
        )}/repost`,
        {
          method,
        },
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.error ??
            (hasReposted
              ? "Unable to undo the repost."
              : "Unable to repost the post."),
        );
      }

      setHasReposted((current) => !current);
      setRepostCount((current) =>
        hasReposted
          ? Math.max(0, current - 1)
          : current + 1,
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to update the repost.",
      );
    } finally {
      setRepostLoading(false);
    }
  }

  async function loadComments() {
    setCommentsLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/posts/${encodeURIComponent(
          postId,
        )}/comments?limit=100`,
        {
          cache: "no-store",
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ?? "Unable to load comments.",
        );
      }

      setComments(
        Array.isArray(data.comments)
          ? data.comments
          : [],
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load comments.",
      );
    } finally {
      setCommentsLoading(false);
    }
  }

  async function toggleComments() {
    const nextOpen = !commentsOpen;

    setCommentsOpen(nextOpen);

    if (nextOpen && comments.length === 0) {
      await loadComments();
    }
  }

  async function handleCommentSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const trimmedContent = commentContent.trim();

    if (!trimmedContent || commentPublishing) {
      return;
    }

    setCommentPublishing(true);
    setError("");

    try {
      const response = await fetch(
        `/api/posts/${encodeURIComponent(
          postId,
        )}/comments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: trimmedContent,
            parentCommentId: replyingTo?.id ?? null,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ??
            "Unable to add your comment.",
        );
      }

      if (!data.comment) {
        throw new Error(
          "The comment response was invalid.",
        );
      }

      setComments((current) => [
        ...current,
        data.comment as Comment,
      ]);
      setCommentContent("");
      setReplyingTo(null);
      setCommentsOpen(true);
      setCommentCount((current) => current + 1);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to add your comment.",
      );
    } finally {
      setCommentPublishing(false);
    }
  }

  async function savePostEdit() {
    const trimmedContent = editContent.trim();

    if (!trimmedContent || editLoading || !isOwner) {
      return;
    }

    setEditLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/posts/${encodeURIComponent(postId)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: trimmedContent,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ??
            "Unable to update the post.",
        );
      }

      setEditing(false);
      setEditContent(trimmedContent);

      onPostUpdated?.(postId, trimmedContent);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to update the post.",
      );
    } finally {
      setEditLoading(false);
    }
  }

  async function deletePost() {
    if (deleteLoading || !isOwner) {
      return;
    }

    const confirmed = window.confirm(
      "Delete this post? This cannot be undone.",
    );

    if (!confirmed) {
      return;
    }

    setDeleteLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/posts/${encodeURIComponent(postId)}`,
        {
          method: "DELETE",
        },
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.error ??
            "Unable to delete the post.",
        );
      }

      onPostDeleted?.(postId);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to delete the post.",
      );
    } finally {
      setDeleteLoading(false);
    }
  }

  const visibleReactionSummary = REACTIONS.filter(
    (reaction) => reactionCounts[reaction.type] > 0,
  );

  return (
    <div className="mt-5 border-t border-[var(--border)] pt-4">
      {totalReactionCount > 0 ||
      repostCount > 0 ||
      commentCount > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-[var(--muted)]">
          {totalReactionCount > 0 ? (
            <div className="flex items-center gap-1">
              {visibleReactionSummary
                .slice(0, 3)
                .map((reaction) => (
                  <span
                    key={reaction.type}
                    title={reaction.label}
                    aria-label={`${reaction.label}: ${reactionCounts[reaction.type]}`}
                  >
                    {reaction.emoji}
                  </span>
                ))}

              <span>{totalReactionCount}</span>
            </div>
          ) : null}

          {commentCount > 0 ? (
            <button
              type="button"
              onClick={() => void toggleComments()}
              className="transition hover:text-[var(--foreground)]"
            >
              {commentCount}{" "}
              {commentCount === 1
                ? "comment"
                : "comments"}
            </button>
          ) : null}

          {repostCount > 0 ? (
            <span>
              {repostCount}{" "}
              {repostCount === 1
                ? "repost"
                : "reposts"}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={() =>
              setReactionPickerOpen((current) => !current)
            }
            disabled={reactionLoading}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition ${
              myReaction
                ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                : "text-[var(--muted)] hover:bg-[var(--background)] hover:text-[var(--foreground)]"
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {reactionLoading ? (
              <Loader2
                size={15}
                className="animate-spin"
              />
            ) : selectedReaction ? (
              <span>{selectedReaction.emoji}</span>
            ) : (
              <Heart size={15} />
            )}

            {selectedReaction?.label ?? "React"}

            <ChevronDown size={13} />
          </button>

          {reactionPickerOpen ? (
            <div className="absolute bottom-full left-0 z-20 mb-2 flex max-w-[calc(100vw-2rem)] flex-wrap gap-1 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-lg">
              {REACTIONS.map((reaction) => (
                <button
                  key={reaction.type}
                  type="button"
                  onClick={() =>
                    void chooseReaction(
                      reaction.type,
                    )
                  }
                  title={reaction.label}
                  aria-label={reaction.label}
                  className={`flex h-9 w-9 items-center justify-center rounded-xl text-lg transition hover:bg-[var(--background)] ${
                    myReaction === reaction.type
                      ? "bg-[var(--accent)]/10"
                      : ""
                  }`}
                >
                  {reaction.emoji}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => void toggleComments()}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition ${
            commentsOpen
              ? "bg-[var(--background)] text-[var(--foreground)]"
              : "text-[var(--muted)] hover:bg-[var(--background)] hover:text-[var(--foreground)]"
          }`}
        >
          <MessageCircle size={15} />
          Comment
        </button>

        <button
          type="button"
          onClick={() => void toggleRepost()}
          disabled={repostLoading}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition ${
            hasReposted
              ? "bg-[var(--accent)]/10 text-[var(--accent)]"
              : "text-[var(--muted)] hover:bg-[var(--background)] hover:text-[var(--foreground)]"
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {repostLoading ? (
            <Loader2
              size={15}
              className="animate-spin"
            />
          ) : (
            <Repeat2 size={15} />
          )}

          {hasReposted ? "Reposted" : "Repost"}
        </button>

        {isOwner ? (
          <details className="relative ml-auto">
            <summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--background)] hover:text-[var(--foreground)]">
              <MoreHorizontal size={17} />
            </summary>

            <div className="absolute right-0 top-full z-20 mt-2 w-44 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-lg">
              <button
                type="button"
                onClick={() => {
                  setEditing(true);
                }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-[var(--background)]"
              >
                <Edit3 size={15} />
                Edit post
              </button>

              <button
                type="button"
                onClick={() => void deletePost()}
                disabled={deleteLoading}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-[#8d2f2f] transition hover:bg-[#fff7f7] disabled:opacity-50"
              >
                {deleteLoading ? (
                  <Loader2
                    size={15}
                    className="animate-spin"
                  />
                ) : (
                  <Trash2 size={15} />
                )}
                Delete post
              </button>
            </div>
          </details>
        ) : null}
      </div>

      {editing && isOwner ? (
        <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4">
          <textarea
            value={editContent}
            onChange={(event) =>
              setEditContent(event.target.value)
            }
            maxLength={2000}
            rows={5}
            className="w-full resize-none border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm leading-6 outline-none transition focus:border-[var(--accent)]"
          />

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setEditContent(initialContent);
              }}
              disabled={editLoading}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-[var(--muted)] transition hover:bg-[var(--surface)]"
            >
              <X size={15} />
              Cancel
            </button>

            <button
              type="button"
              onClick={() => void savePostEdit()}
              disabled={
                editLoading || !editContent.trim()
              }
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {editLoading ? (
                <Loader2
                  size={15}
                  className="animate-spin"
                />
              ) : (
                <Check size={15} />
              )}
              Save
            </button>
          </div>
        </div>
      ) : null}

      {commentsOpen ? (
        <section className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">
                Comments
              </h3>

              <p className="mt-1 text-xs text-[var(--muted)]">
                Join the conversation.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadComments()}
              disabled={commentsLoading}
              className="text-xs font-semibold text-[var(--accent)] disabled:opacity-50"
            >
              Refresh
            </button>
          </div>

          {commentsLoading ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-[var(--muted)]">
              <Loader2
                size={15}
                className="animate-spin"
              />
              Loading comments…
            </div>
          ) : comments.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--muted)]">
              No comments yet. Be the first to respond.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {comments.map((comment) => {
                const commentProfile =
                  getCommentProfile(comment);

                const isReply =
                  comment.parent_comment_id !== null;

                return (
                  <article
                    key={comment.id}
                    className={`rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 ${
                      isReply ? "ml-6" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {commentProfile?.display_name ??
                            "Agoré user"}
                        </p>

                        <p className="mt-0.5 text-xs text-[var(--muted)]">
                          @
                          {commentProfile?.username ??
                            "unknown"}{" "}
                          ·{" "}
                          {formatCommentDate(
                            comment.created_at,
                          )}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setReplyingTo(comment)
                        }
                        className="shrink-0 rounded-full px-2.5 py-1.5 text-xs font-semibold text-[var(--accent)] transition hover:bg-[var(--background)]"
                      >
                        Reply
                      </button>
                    </div>

                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6">
                      {comment.content}
                    </p>
                  </article>
                );
              })}
            </div>
          )}

          <form
            onSubmit={handleCommentSubmit}
            className="mt-4"
          >
            {replyingTo ? (
              <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                <p className="truncate text-xs text-[var(--muted)]">
                  Replying to{" "}
                  <span className="font-semibold text-[var(--foreground)]">
                    @
                    {getCommentProfile(replyingTo)
                      ?.username ?? "user"}
                  </span>
                </p>

                <button
                  type="button"
                  onClick={() => setReplyingTo(null)}
                  className="shrink-0 text-[var(--muted)] transition hover:text-[var(--foreground)]"
                >
                  <X size={15} />
                </button>
              </div>
            ) : null}

            <div className="flex items-end gap-2">
              <textarea
                value={commentContent}
                onChange={(event) =>
                  setCommentContent(event.target.value)
                }
                maxLength={1000}
                rows={2}
                placeholder={
                  replyingTo
                    ? "Write a reply…"
                    : "Write a comment…"
                }
                className="min-w-0 flex-1 resize-none rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm leading-6 outline-none transition focus:border-[var(--accent)]"
              />

              <button
                type="submit"
                disabled={
                  commentPublishing ||
                  !commentContent.trim()
                }
                className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] px-4 text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={
                  replyingTo
                    ? "Send reply"
                    : "Send comment"
                }
              >
                {commentPublishing ? (
                  <Loader2
                    size={16}
                    className="animate-spin"
                  />
                ) : (
                  <Send size={16} />
                )}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {error ? (
        <div className="mt-3 flex items-start justify-between gap-3 rounded-xl border border-[#ead1d1] bg-[#fff7f7] px-3 py-2.5">
          <p className="text-xs font-medium text-[#8d2f2f]">
            {error}
          </p>

          <button
            type="button"
            onClick={() =>
              void loadInteractionState()
            }
            className="shrink-0 text-xs font-semibold text-[#8d2f2f]"
          >
            Retry
          </button>
        </div>
      ) : null}
    </div>
  );
}