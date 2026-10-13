"use client";

import {
  FormEvent,
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Check,
  ChevronDown,
  Edit3,
  Heart,
  ImagePlus,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Repeat2,
  Send,
  Trash2,
  X,
} from "lucide-react";

import AgoreAvatar from "@/components/agore-avatar";
import UserIdentity from "@/components/user-identity";
import { createClient } from "@/lib/supabase/browser";

type ReactionType =
  | "like"
  | "love"
  | "laugh"
  | "care"
  | "wow"
  | "sad"
  | "angry";

export type PostInteractionSummary = {
  viewerId: string;
  reactionCounts: Record<ReactionType, number>;
  myReaction: ReactionType | null;
  repostCount: number;
  hasReposted: boolean;
  commentCount: number;
};

type PostInteractionSummaryRow = {
  post_id: string;
  like_count: number | string;
  love_count: number | string;
  laugh_count: number | string;
  care_count: number | string;
  wow_count: number | string;
  sad_count: number | string;
  angry_count: number | string;
  my_reaction: string | null;
  repost_count: number | string;
  has_reposted: boolean;
  comment_count: number | string;
};

type ReactionRow = {
  reaction_type: ReactionType;
  user_id: string;
};

type CommentProfile =
  | {
      display_name: string;
      username: string;
      avatar_path: string | null;
    }
  | Array<{
      display_name: string;
      username: string;
      avatar_path: string | null;
    }>
  | null;

type CommentMedia = {
  id: string;
  comment_id: string;
  author_id: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  sort_order: number;
  created_at: string;
};

type SelectedCommentImage = {
  file: File;
  previewUrl: string;
};

type Comment = {
  id: string;
  post_id: string;
  author_id: string;
  parent_comment_id: string | null;
  content: string;
  created_at: string;
  updated_at: string;
  profiles: CommentProfile;
  comment_media?: CommentMedia[];
};

type CommentCursor = {
  createdAt: string;
  id: string;
};

type CommentsResponse = {
  comments?: Comment[];
  commentCount?: number;
  hasMore?: boolean;
  nextCursor?: CommentCursor | null;
  error?: string;
};

type PostInteractionsProps = {
  postId: string;
  initialContent: string;
  isOwner: boolean;
  commentsOpenByDefault?: boolean;
  initialInteractionSummary?: PostInteractionSummary | null;
  onPostUpdated?: (
    postId: string,
    content: string,
  ) => void;
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
const MAX_COMMENT_IMAGES = 4;
const MAX_COMMENT_IMAGE_SIZE = 10 * 1024 * 1024;
const COMMENT_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
] as const;

function getCommentImageExtension(mimeType: string) {
  switch (mimeType.toLowerCase()) {
    case "image/jpeg": return "jpg";
    case "image/png": return "png";
    case "image/webp": return "webp";
    case "image/gif": return "gif";
    case "image/avif": return "avif";
    default: return null;
  }
}

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

function isEdited(comment: Comment) {
  return comment.updated_at !== comment.created_at;
}

function sortComments(comments: Comment[]) {
  return [...comments].sort((a, b) => {
    const timeDifference =
      new Date(a.created_at).getTime() -
      new Date(b.created_at).getTime();

    return timeDifference || a.id.localeCompare(b.id);
  });
}

function mergeComments(
  current: Comment[],
  incoming: Comment[],
) {
  const byId = new Map<string, Comment>();

  for (const comment of current) {
    byId.set(comment.id, comment);
  }

  for (const comment of incoming) {
    byId.set(comment.id, comment);
  }

  return sortComments(Array.from(byId.values()));
}

export default function PostInteractions({
  postId,
  initialContent,
  isOwner,
  commentsOpenByDefault = false,
  initialInteractionSummary,
  onPostUpdated,
  onPostDeleted,
}: PostInteractionsProps) {
  const [viewerId, setViewerId] = useState<string | null>(
    initialInteractionSummary?.viewerId ?? null,
  );

  const [reactionCounts, setReactionCounts] = useState<
    Record<ReactionType, number>
  >({
    like: initialInteractionSummary?.reactionCounts.like ?? 0,
    love: initialInteractionSummary?.reactionCounts.love ?? 0,
    laugh: initialInteractionSummary?.reactionCounts.laugh ?? 0,
    care: initialInteractionSummary?.reactionCounts.care ?? 0,
    wow: initialInteractionSummary?.reactionCounts.wow ?? 0,
    sad: initialInteractionSummary?.reactionCounts.sad ?? 0,
    angry: initialInteractionSummary?.reactionCounts.angry ?? 0,
  });

  const [myReaction, setMyReaction] = useState<ReactionType | null>(
    initialInteractionSummary?.myReaction ?? null,
  );

  const [repostCount, setRepostCount] = useState(
    initialInteractionSummary?.repostCount ?? 0,
  );
  const [hasReposted, setHasReposted] = useState(
    initialInteractionSummary?.hasReposted ?? false,
  );
  const [commentCount, setCommentCount] = useState(
    initialInteractionSummary?.commentCount ?? 0,
  );

  const [reactionPickerOpen, setReactionPickerOpen] =
    useState(false);

  const [commentsOpen, setCommentsOpen] =
    useState(commentsOpenByDefault);

  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsLoadingMore, setCommentsLoadingMore] =
    useState(false);
  const [hasMoreComments, setHasMoreComments] = useState(false);
  const [commentCursor, setCommentCursor] =
    useState<CommentCursor | null>(null);

  const loadingMoreRef = useRef(false);

  const [commentPublishing, setCommentPublishing] =
    useState(false);
  const [commentContent, setCommentContent] = useState("");
  const [commentImages, setCommentImages] = useState<SelectedCommentImage[]>([]);
  const [commentMediaUrls, setCommentMediaUrls] = useState<Record<string, string>>({});
  const commentImageInputRef = useRef<HTMLInputElement | null>(null);
  const selectedCommentImagesRef = useRef<SelectedCommentImage[]>([]);
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);

  const [commentEditingId, setCommentEditingId] =
    useState<string | null>(null);
  const [commentEditContent, setCommentEditContent] =
    useState("");
  const [commentEditLoading, setCommentEditLoading] =
    useState(false);
  const [commentDeleteLoadingId, setCommentDeleteLoadingId] =
    useState<string | null>(null);
  const [commentMenuOpenId, setCommentMenuOpenId] =
    useState<string | null>(null);

  const [reactionLoading, setReactionLoading] = useState(false);
  const [repostLoading, setRepostLoading] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(initialContent);
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

  const visibleReactionSummary = REACTIONS.filter(
    (reaction) => reactionCounts[reaction.type] > 0,
  );

  const rootComments = useMemo(
    () =>
      comments.filter(
        (comment) => comment.parent_comment_id === null,
      ),
    [comments],
  );

  const repliesByParent = useMemo(() => {
    const grouped = new Map<string, Comment[]>();

    for (const comment of comments) {
      if (!comment.parent_comment_id) {
        continue;
      }

      const existing =
        grouped.get(comment.parent_comment_id) ?? [];

      existing.push(comment);
      grouped.set(comment.parent_comment_id, existing);
    }

    return grouped;
  }, [comments]);

  const loadInteractionState = useCallback(async () => {
    setError("");

    try {
      const {
        data: { session },
        error: authError,
      } = await supabase.auth.getSession();

      if (authError) {
        throw authError;
      }

      const user = session?.user ?? null;
      setViewerId(user?.id ?? null);

      if (!user) {
        setReactionCounts({
          like: 0, love: 0, laugh: 0, care: 0, wow: 0, sad: 0, angry: 0,
        });
        setMyReaction(null);
        setRepostCount(0);
        setHasReposted(false);
        setCommentCount(0);
        return;
      }

      const { data, error } = await supabase.rpc(
        "agore_post_interaction_summaries",
        { p_post_ids: [postId] },
      );

      if (error) {
        throw error;
      }

      const rows = (data ?? []) as unknown as PostInteractionSummaryRow[];
      const summary = rows.find((row) => row.post_id === postId);

      if (!summary) {
        setReactionCounts({
          like: 0, love: 0, laugh: 0, care: 0, wow: 0, sad: 0, angry: 0,
        });
        setMyReaction(null);
        setRepostCount(0);
        setHasReposted(false);
        setCommentCount(0);
        return;
      }

      setReactionCounts({
        like: Number(summary.like_count ?? 0),
        love: Number(summary.love_count ?? 0),
        laugh: Number(summary.laugh_count ?? 0),
        care: Number(summary.care_count ?? 0),
        wow: Number(summary.wow_count ?? 0),
        sad: Number(summary.sad_count ?? 0),
        angry: Number(summary.angry_count ?? 0),
      });
      setMyReaction(
        REACTIONS.some((reaction) => reaction.type === summary.my_reaction)
          ? (summary.my_reaction as ReactionType)
          : null,
      );
      setRepostCount(Number(summary.repost_count ?? 0));
      setHasReposted(Boolean(summary.has_reposted));
      setCommentCount(Number(summary.comment_count ?? 0));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load post interactions.",
      );
    }
  }, [postId]);

  useEffect(() => {
    if (!initialInteractionSummary) {
      void loadInteractionState();
      return;
    }

    setViewerId(initialInteractionSummary.viewerId);
    setReactionCounts(initialInteractionSummary.reactionCounts);
    setMyReaction(initialInteractionSummary.myReaction);
    setRepostCount(initialInteractionSummary.repostCount);
    setHasReposted(initialInteractionSummary.hasReposted);
    setCommentCount(initialInteractionSummary.commentCount);
    setError("");
  }, [loadInteractionState, initialInteractionSummary]);

  useEffect(() => {
    let cancelled = false;

    async function loadCommentImageUrls() {
      const availablePaths = new Set(Object.keys(commentMediaUrls));
      const paths = Array.from(
        new Set(
          comments.flatMap((comment) =>
            (comment.comment_media ?? []).map((media) => media.storage_path),
          ),
        ),
      ).filter((imagePath) => !availablePaths.has(imagePath));

      if (paths.length === 0) return;

      const nextUrls: Record<string, string> = {};
      for (let index = 0; index < paths.length; index += 50) {
        const batch = paths.slice(index, index + 50);
        const { data, error: urlError } = await supabase.storage
          .from("comment-media")
          .createSignedUrls(batch, 60 * 60);

        if (urlError) {
          console.error("Failed to sign Agore comment image URLs:", urlError);
          continue;
        }

        for (const item of data ?? []) {
          if (item.path && item.signedUrl) {
            nextUrls[item.path] = item.signedUrl;
          }
        }
      }

      if (!cancelled && Object.keys(nextUrls).length > 0) {
        setCommentMediaUrls((current) => ({ ...current, ...nextUrls }));
      }
    }

    void loadCommentImageUrls();

    return () => {
      cancelled = true;
    };
  }, [comments, commentMediaUrls]);

  useEffect(() => {
    return () => {
      for (const image of selectedCommentImagesRef.current) {
        URL.revokeObjectURL(image.previewUrl);
      }
    };
  }, []);

  useEffect(() => {
    setEditContent(initialContent);
  }, [initialContent]);

  const loadComments = useCallback(
    async ({ append = false }: { append?: boolean } = {}) => {
      if (append && (!commentCursor || loadingMoreRef.current)) {
        return;
      }

      if (append) {
        loadingMoreRef.current = true;
        setCommentsLoadingMore(true);
      } else {
        setCommentsLoading(true);
      }

      setError("");

      try {
        const params = new URLSearchParams({
          limit: "50",
        });

        if (append && commentCursor) {
          params.set("afterCreatedAt", commentCursor.createdAt);
          params.set("afterId", commentCursor.id);
        }

        const response = await fetch(
          `/api/posts/${encodeURIComponent(postId)}/comments?${params.toString()}`,
          { cache: "no-store" },
        );

        const data = (await response.json()) as CommentsResponse;

        if (!response.ok) {
          throw new Error(data.error ?? "Unable to load comments.");
        }

        const nextComments = Array.isArray(data.comments)
          ? data.comments
          : [];

        setComments((current) =>
          append
            ? mergeComments(current, nextComments)
            : mergeComments([], nextComments),
        );

        setCommentCount(
          typeof data.commentCount === "number"
            ? data.commentCount
            : nextComments.length,
        );

        setCommentCursor(data.nextCursor ?? null);
        setHasMoreComments(data.hasMore === true);
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load comments.",
        );
      } finally {
        if (append) {
          loadingMoreRef.current = false;
          setCommentsLoadingMore(false);
        } else {
          setCommentsLoading(false);
        }
      }
    },
    [commentCursor, postId],
  );

  useEffect(() => {
    if (commentsOpenByDefault && comments.length === 0) {
      void loadComments();
    }
  }, [commentsOpenByDefault, comments.length, loadComments]);

  async function chooseReaction(reactionType: ReactionType) {
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
          `/api/posts/${encodeURIComponent(postId)}/reaction`,
          { method: "DELETE" },
        );

        const data = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            data?.error ?? "Unable to remove your reaction.",
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
        `/api/posts/${encodeURIComponent(postId)}/reaction`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reactionType }),
        },
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.error ?? "Unable to save your reaction.",
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
        `/api/posts/${encodeURIComponent(postId)}/repost`,
        { method },
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

  function toggleComments() {
    const nextOpen = !commentsOpen;
    setCommentsOpen(nextOpen);

    if (nextOpen && comments.length === 0) {
      void loadComments();
    }
  }

  function handleCommentImageChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;

    setError("");

    if (commentImages.length + files.length > MAX_COMMENT_IMAGES) {
      setError(`You can attach up to ${MAX_COMMENT_IMAGES} images to a comment or reply.`);
      return;
    }

    const unsupported = files.find(
      (file) => !(COMMENT_IMAGE_MIME_TYPES as readonly string[]).includes(file.type.toLowerCase()),
    );
    if (unsupported) {
      setError("Choose JPEG, PNG, WebP, GIF, or AVIF images.");
      return;
    }

    const oversized = files.find(
      (file) => file.size <= 0 || file.size > MAX_COMMENT_IMAGE_SIZE,
    );
    if (oversized) {
      setError("Each comment image must be between 1 byte and 10 MB.");
      return;
    }

    const nextImages = [
      ...commentImages,
      ...files.map((file) => ({
        file,
        previewUrl: URL.createObjectURL(file),
      })),
    ];
    selectedCommentImagesRef.current = nextImages;
    setCommentImages(nextImages);
  }

  function removeCommentImage(index: number) {
    const removed = commentImages[index];
    if (!removed) return;
    URL.revokeObjectURL(removed.previewUrl);
    const nextImages = commentImages.filter((_, imageIndex) => imageIndex !== index);
    selectedCommentImagesRef.current = nextImages;
    setCommentImages(nextImages);
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

    const uploadedPaths: string[] = [];

    try {
      const uploadedImages: Array<{
        storage_path: string;
        mime_type: string;
        size_bytes: number;
        width: number | null;
        height: number | null;
      }> = [];

      if (commentImages.length > 0) {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          throw new Error("Sign in again before attaching images.");
        }

        for (const selected of commentImages) {
          const mimeType = selected.file.type.toLowerCase();
          const extension = getCommentImageExtension(mimeType);
          if (!extension) {
            throw new Error("One of the selected image types is not supported.");
          }

          const storagePath = `${user.id}/${crypto.randomUUID()}.${extension}`;
          const { error: uploadError } = await supabase.storage
            .from("comment-media")
            .upload(storagePath, selected.file, {
              contentType: mimeType,
              cacheControl: "3600",
              upsert: false,
            });

          if (uploadError) {
            throw new Error(uploadError.message || "Unable to upload a comment image.");
          }

          uploadedPaths.push(storagePath);
          uploadedImages.push({
            storage_path: storagePath,
            mime_type: mimeType,
            size_bytes: selected.file.size,
            width: null,
            height: null,
          });
        }
      }

      const response = await fetch(
        `/api/posts/${encodeURIComponent(postId)}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: trimmedContent,
            parentCommentId: replyingTo?.id ?? null,
            ...(uploadedImages.length > 0 ? { images: uploadedImages } : {}),
          }),
        },
      );

      const data = (await response.json().catch(() => null)) as
        | { comment?: Comment; error?: string }
        | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Unable to add your comment.");
      }

      if (!data?.comment) {
        throw new Error("The comment response was invalid.");
      }

      setComments((current) => mergeComments(current, [data.comment as Comment]));
      setCommentContent("");
      setReplyingTo(null);
      setCommentsOpen(true);
      setCommentCount((current) => current + 1);

      for (const image of selectedCommentImagesRef.current) {
        URL.revokeObjectURL(image.previewUrl);
      }
      selectedCommentImagesRef.current = [];
      setCommentImages([]);
    } catch (requestError) {
      if (uploadedPaths.length > 0) {
        const { error: cleanupError } = await supabase.storage
          .from("comment-media")
          .remove(uploadedPaths);

        if (cleanupError) {
          console.error("Failed to clean up rejected Agore comment images:", cleanupError);
        }
      }

      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to add your comment.",
      );
    } finally {
      setCommentPublishing(false);
    }
  }

  function startCommentEdit(comment: Comment) {
    setCommentMenuOpenId(null);
    setCommentEditingId(comment.id);
    setCommentEditContent(comment.content);
    setError("");
  }

  function cancelCommentEdit() {
    setCommentEditingId(null);
    setCommentEditContent("");
  }

  async function saveCommentEdit() {
    const trimmedContent = commentEditContent.trim();

    if (
      !trimmedContent ||
      commentEditLoading ||
      !commentEditingId
    ) {
      return;
    }

    setCommentEditLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/comments/${encodeURIComponent(commentEditingId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: trimmedContent }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ?? "Unable to update the comment.",
        );
      }

      if (!data.comment) {
        throw new Error("The comment response was invalid.");
      }

      setComments((current) =>
        mergeComments(
          current.filter((comment) => comment.id !== commentEditingId),
          [data.comment as Comment],
        ),
      );

      setCommentEditingId(null);
      setCommentEditContent("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to update the comment.",
      );
    } finally {
      setCommentEditLoading(false);
    }
  }

  async function deleteComment(comment: Comment) {
    if (
      commentDeleteLoadingId ||
      comment.author_id !== viewerId
    ) {
      return;
    }

    const confirmationMessage =
      comment.parent_comment_id === null
        ? "Delete this comment and all replies to it? This cannot be undone."
        : "Delete this reply? This cannot be undone.";

    if (!window.confirm(confirmationMessage)) {
      return;
    }

    setCommentDeleteLoadingId(comment.id);
    setCommentMenuOpenId(null);
    setError("");

    try {
      const response = await fetch(
        `/api/comments/${encodeURIComponent(comment.id)}`,
        { method: "DELETE" },
      );

      const data = (await response.json().catch(() => null)) as
        | {
            error?: string;
            deletedCommentIds?: unknown;
            commentCount?: number | null;
          }
        | null;

      if (!response.ok) {
        throw new Error(
          data?.error ?? "Unable to delete the comment.",
        );
      }

      const removedIds = new Set<string>(
        Array.isArray(data?.deletedCommentIds)
          ? data.deletedCommentIds.filter(
              (id): id is string => typeof id === "string",
            )
          : [],
      );

      removedIds.add(comment.id);

      const remainingComments = comments.filter(
        (item) => !removedIds.has(item.id),
      );

      setComments(remainingComments);

      if (typeof data?.commentCount === "number") {
        setCommentCount(data.commentCount);
      } else {
        setCommentCount((current) =>
          Math.max(0, current - removedIds.size),
        );
      }

      if (replyingTo && removedIds.has(replyingTo.id)) {
        setReplyingTo(null);
      }

      if (
        commentEditingId &&
        removedIds.has(commentEditingId)
      ) {
        cancelCommentEdit();
      }

      if (
        commentMenuOpenId &&
        removedIds.has(commentMenuOpenId)
      ) {
        setCommentMenuOpenId(null);
      }

      // If deletion empties the currently loaded page but later pages
      // still exist, fetch the next page rather than showing a false-empty
      // thread.
      if (
        remainingComments.length === 0 &&
        hasMoreComments &&
        commentCursor
      ) {
        await loadComments({ append: true });
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to delete the comment.",
      );
    } finally {
      setCommentDeleteLoadingId(null);
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
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: trimmedContent }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ?? "Unable to update the post.",
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

    if (
      !window.confirm(
        "Delete this post? This cannot be undone.",
      )
    ) {
      return;
    }

    setDeleteLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/posts/${encodeURIComponent(postId)}`,
        { method: "DELETE" },
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.error ?? "Unable to delete the post.",
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

  function renderComment(
    comment: Comment,
    isReply = false,
    replyCount = 0,
  ) {
    const profile = getCommentProfile(comment);
    const isCommentOwner = comment.author_id === viewerId;
    const isCommentEditing = commentEditingId === comment.id;

    return (
      <article
        key={comment.id}
        className={`rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3.5 ${
          isReply ? "ml-5 sm:ml-8" : ""
        }`}
      >
        <div className="flex items-start gap-3">
          <AgoreAvatar
            avatarPath={profile?.avatar_path ?? null}
            name={profile?.display_name ?? "Agoré user"}
            className="h-9 w-9 shrink-0"
            textClassName="text-xs"
          />

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <UserIdentity
                  userId={comment.author_id}
                  displayName={profile?.display_name ?? "Agoré user"}
                  className="w-full"
                  nameClassName="min-w-0 truncate text-sm font-semibold"
                  badgeSize={15}
                />

                <p className="mt-0.5 truncate text-[11px] text-[var(--muted)]">
                  @{profile?.username ?? "unknown"} ·{" "}
                  {formatCommentDate(comment.created_at)}
                  {isEdited(comment) ? " · Edited" : ""}
                </p>
              </div>

              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    setCommentMenuOpenId((current) =>
                      current === comment.id ? null : comment.id,
                    )
                  }
                  aria-label={isReply ? "Reply actions" : "Comment actions"}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--background)] hover:text-[var(--foreground)]"
                >
                  <MoreHorizontal size={16} />
                </button>

                {commentMenuOpenId === comment.id ? (
                  <>
                    <button
                      type="button"
                      aria-label="Close comment actions"
                      className="fixed inset-0 z-10 cursor-default"
                      onClick={() => setCommentMenuOpenId(null)}
                    />

                    <div className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-[0_12px_35px_rgba(0,0,0,0.12)]">
                      {isCommentOwner ? (
                        <>
                          <button
                            type="button"
                            onClick={() => startCommentEdit(comment)}
                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-[var(--background)]"
                          >
                            <Edit3 size={15} />
                            Edit comment
                          </button>

                          <button
                            type="button"
                            onClick={() => void deleteComment(comment)}
                            disabled={commentDeleteLoadingId === comment.id}
                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-[var(--danger)] transition hover:bg-[var(--danger-soft)] disabled:opacity-50"
                          >
                            {commentDeleteLoadingId === comment.id ? (
                              <Loader2 size={15} className="animate-spin" />
                            ) : (
                              <Trash2 size={15} />
                            )}
                            Delete comment
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setCommentMenuOpenId(null)}
                          className="flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm text-[var(--muted)]"
                        >
                          Comment actions
                        </button>
                      )}
                    </div>
                  </>
                ) : null}
              </div>
            </div>

            {isCommentEditing ? (
              <div className="mt-3">
                <textarea
                  value={commentEditContent}
                  onChange={(event) =>
                    setCommentEditContent(event.target.value)
                  }
                  maxLength={1000}
                  rows={4}
                  className="w-full resize-none rounded-2xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm leading-6 outline-none transition focus:border-[var(--accent)]"
                />

                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-[11px] tabular-nums text-[var(--muted)]">
                    {commentEditContent.length}/1000
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={cancelCommentEdit}
                      disabled={commentEditLoading}
                      className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-[var(--muted)] transition hover:bg-[var(--background)] disabled:opacity-50"
                    >
                      <X size={14} />
                      Cancel
                    </button>

                    <button
                      type="button"
                      onClick={() => void saveCommentEdit()}
                      disabled={
                        commentEditLoading ||
                        !commentEditContent.trim()
                      }
                      className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {commentEditLoading ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Check size={14} />
                      )}
                      Save
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6">
                  {comment.content}
                </p>

                {(comment.comment_media ?? []).length > 0 ? (
                  <div className="mt-3 grid max-w-md grid-cols-2 gap-2">
                    {[...(comment.comment_media ?? [])]
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map((media) => {
                        const url = commentMediaUrls[media.storage_path];
                        return url ? (
                          <a
                            key={media.id}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="Open attached comment image"
                            className="block overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                          >
                            <img
                              src={url}
                              alt="Image attached to comment"
                              width={media.width ?? undefined}
                              height={media.height ?? undefined}
                              loading="lazy"
                              decoding="async"
                              className="block max-h-72 w-full object-contain"
                            />
                          </a>
                        ) : (
                          <div
                            key={media.id}
                            role="status"
                            className="flex aspect-square items-center justify-center rounded-xl bg-[var(--surface)] text-xs text-[var(--muted)]"
                          >
                            Loading image…
                          </div>
                        );
                      })}
                  </div>
                ) : null}

                {!isReply ? (
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setReplyingTo(comment);
                        setCommentsOpen(true);
                        setError("");
                      }}
                      className="rounded-full px-2.5 py-1.5 text-xs font-semibold text-[var(--accent)] transition hover:bg-[var(--background)]"
                    >
                      Reply
                    </button>

                    {replyCount > 0 ? (
                      <span className="text-[11px] text-[var(--muted)]">
                        {replyCount}
                        {hasMoreComments ? " loaded replies" : " replies"}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </article>
    );
  }

  return (
    <div className="mt-5">
      {totalReactionCount > 0 ||
      repostCount > 0 ||
      commentCount > 0 ? (
        <div className="mb-3 flex min-h-6 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2">
            {totalReactionCount > 0 ? (
              <div className="flex items-center gap-1.5">
                <div className="flex -space-x-1">
                  {visibleReactionSummary.slice(0, 3).map((reaction) => (
                    <span
                      key={reaction.type}
                      title={reaction.label}
                      aria-label={`${reaction.label}: ${reactionCounts[reaction.type]}`}
                      className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--surface)] bg-[var(--background)] text-[11px]"
                    >
                      {reaction.emoji}
                    </span>
                  ))}
                </div>

                <span className="text-xs text-[var(--muted)]">
                  {totalReactionCount}
                </span>
              </div>
            ) : null}

            {repostCount > 0 ? (
              <button
                type="button"
                onClick={() => void toggleRepost()}
                className="text-xs text-[var(--muted)] transition hover:text-[var(--foreground)]"
              >
                {repostCount} {repostCount === 1 ? "repost" : "reposts"}
              </button>
            ) : null}
          </div>

          {commentCount > 0 ? (
            <button
              type="button"
              onClick={toggleComments}
              className="shrink-0 text-xs text-[var(--muted)] transition hover:text-[var(--foreground)]"
            >
              {commentCount} {commentCount === 1 ? "comment" : "comments"}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="relative flex items-center gap-1 border-t border-[var(--border)] pt-3">
        <div className="relative">
          <button
            type="button"
            onClick={() =>
              setReactionPickerOpen((current) => !current)
            }
            disabled={reactionLoading}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition ${
              selectedReaction
                ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                : "text-[var(--muted)] hover:bg-[var(--background)] hover:text-[var(--foreground)]"
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {reactionLoading ? (
              <Loader2 size={15} className="animate-spin" />
            ) : selectedReaction ? (
              <span>{selectedReaction.emoji}</span>
            ) : (
              <Heart size={15} />
            )}

            <span className="hidden xs:inline">
              {selectedReaction?.label ?? "React"}
            </span>

            <ChevronDown size={13} />
          </button>

          {reactionPickerOpen ? (
            <>
              <button
                type="button"
                aria-label="Close reaction picker"
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setReactionPickerOpen(false)}
              />

              <div className="absolute bottom-full left-0 z-20 mb-2 flex flex-wrap gap-1 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-[0_12px_35px_rgba(0,0,0,0.12)]">
                {REACTIONS.map((reaction) => (
                  <button
                    key={reaction.type}
                    type="button"
                    onClick={() => void chooseReaction(reaction.type)}
                    title={reaction.label}
                    aria-label={reaction.label}
                    className={`flex h-9 w-9 items-center justify-center rounded-xl text-lg transition hover:scale-110 hover:bg-[var(--background)] ${
                      myReaction === reaction.type
                        ? "bg-[var(--accent)]/10"
                        : ""
                    }`}
                  >
                    {reaction.emoji}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>

        <button
          type="button"
          onClick={toggleComments}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition ${
            commentsOpen
              ? "bg-[var(--background)] text-[var(--foreground)]"
              : "text-[var(--muted)] hover:bg-[var(--background)] hover:text-[var(--foreground)]"
          }`}
        >
          <MessageCircle size={15} />
          <span>Comment</span>
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
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Repeat2 size={15} />
          )}

          <span className="hidden sm:inline">
            {hasReposted ? "Reposted" : "Repost"}
          </span>
        </button>

        {isOwner ? (
          <details className="relative ml-auto">
            <summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--background)] hover:text-[var(--foreground)]">
              <MoreHorizontal size={17} />
            </summary>

            <div className="absolute right-0 top-full z-30 mt-2 w-44 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-[0_12px_35px_rgba(0,0,0,0.12)]">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-[var(--background)]"
              >
                <Edit3 size={15} />
                Edit post
              </button>

              <button
                type="button"
                onClick={() => void deletePost()}
                disabled={deleteLoading}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-[var(--danger)] transition hover:bg-[var(--danger-soft)] disabled:opacity-50"
              >
                {deleteLoading ? (
                  <Loader2 size={15} className="animate-spin" />
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
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Edit post</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Update what you shared.
              </p>
            </div>

            <span className="text-xs tabular-nums text-[var(--muted)]">
              {editContent.length}/2000
            </span>
          </div>

          <textarea
            value={editContent}
            onChange={(event) => setEditContent(event.target.value)}
            maxLength={2000}
            rows={5}
            className="w-full resize-none rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm leading-6 outline-none transition focus:border-[var(--accent)]"
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
              disabled={editLoading || !editContent.trim()}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {editLoading ? (
                <Loader2 size={15} className="animate-spin" />
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
              <p className="text-sm font-semibold">Conversation</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Reply to the post or continue an existing thread.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadComments()}
              disabled={commentsLoading}
              className="rounded-full px-2.5 py-1.5 text-xs font-semibold text-[var(--accent)] transition hover:bg-[var(--surface)] disabled:opacity-50"
            >
              Refresh
            </button>
          </div>

          {commentsLoading ? (
            <div className="mt-4 flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-4 text-sm text-[var(--muted)]">
              <Loader2 size={15} className="animate-spin" />
              Loading conversation…
            </div>
          ) : comments.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-4 py-5">
              <p className="text-sm font-medium">No comments yet.</p>
              <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                Start the conversation with your own response.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {rootComments.map((comment) => {
                const replies =
                  repliesByParent.get(comment.id) ?? [];

                return (
                  <div key={comment.id} className="space-y-2">
                    {renderComment(
                      comment,
                      false,
                      replies.length,
                    )}

                    {replies.map((reply) =>
                      renderComment(reply, true),
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {hasMoreComments ? (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => void loadComments({ append: true })}
                disabled={commentsLoadingMore}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-xs font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {commentsLoadingMore ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Loading more…
                  </>
                ) : (
                  "Load more comments"
                )}
              </button>
            </div>
          ) : null}

          <form onSubmit={handleCommentSubmit} className="mt-4">
            {replyingTo ? (
              <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                <p className="truncate text-xs text-[var(--muted)]">
                  Replying to{" "}
                  <span className="font-semibold text-[var(--foreground)]">
                    @{getCommentProfile(replyingTo)?.username ?? "user"}
                  </span>
                </p>

                <button
                  type="button"
                  onClick={() => setReplyingTo(null)}
                  className="shrink-0 text-[var(--muted)] transition hover:text-[var(--foreground)]"
                  aria-label="Cancel reply"
                >
                  <X size={15} />
                </button>
              </div>
            ) : null}

            {commentImages.length > 0 ? (
              <div className="mb-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
                {commentImages.map((image, index) => (
                  <div
                    key={image.previewUrl}
                    className="relative aspect-square overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]"
                  >
                    <img
                      src={image.previewUrl}
                      alt={`Selected comment image ${index + 1}`}
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeCommentImage(index)}
                      disabled={commentPublishing}
                      aria-label={`Remove selected image ${index + 1}`}
                      className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/75 text-white disabled:opacity-50"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="flex items-end gap-2">
              <input
                ref={commentImageInputRef}
                type="file"
                accept={COMMENT_IMAGE_MIME_TYPES.join(",")}
                multiple
                disabled={commentPublishing || commentImages.length >= MAX_COMMENT_IMAGES}
                onChange={handleCommentImageChange}
                className="hidden"
                aria-label="Choose comment images"
              />
              <button
                type="button"
                onClick={() => commentImageInputRef.current?.click()}
                disabled={commentPublishing || commentImages.length >= MAX_COMMENT_IMAGES}
                aria-label="Attach images to comment"
                title="Attach images"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <ImagePlus size={17} />
              </button>
              <textarea
                value={commentContent}
                onChange={(event) =>
                  setCommentContent(event.target.value)
                }
                maxLength={1000}
                rows={2}
                placeholder={
                  replyingTo ? "Write a reply…" : "Write a comment…"
                }
                className="min-w-0 flex-1 resize-none rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm leading-6 outline-none transition focus:border-[var(--accent)]"
              />

              <button
                type="submit"
                disabled={
                  commentPublishing ||
                  !commentContent.trim()
                }
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={replyingTo ? "Send reply" : "Send comment"}
              >
                {commentPublishing ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Send size={16} />
                )}
              </button>
            </div>

            <div className="mt-2 flex justify-end">
              <span className="text-[11px] tabular-nums text-[var(--muted)]">
                {commentContent.length}/1000
                {commentImages.length > 0 ? ` · ${commentImages.length}/${MAX_COMMENT_IMAGES} images` : ""}
              </span>
            </div>
          </form>
        </section>
      ) : null}

      {error ? (
        <div className="mt-3 flex items-start justify-between gap-3 rounded-xl border border-[var(--danger)]/20 bg-[var(--danger-soft)] px-3 py-2.5">
          <p className="text-xs font-medium text-[var(--danger)]">
            {error}
          </p>

          <button
            type="button"
            onClick={() => {
              void loadInteractionState();

              if (commentsOpen) {
                void loadComments();
              }
            }}
            className="shrink-0 text-xs font-semibold text-[var(--danger)]"
          >
            Retry
          </button>
        </div>
      ) : null}
    </div>
  );
}