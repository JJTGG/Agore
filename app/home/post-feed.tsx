"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useState,
} from "react";
import Link from "next/link";
import {
  Archive,
  File,
  FileArchive,
  FileCode2,
  FileImage,
  FileText,
  Film,
  Image as ImageIcon,
  Loader2,
  MoreHorizontal,
  Paperclip,
  RefreshCw,
  Repeat2,
  Share2,
  Sparkles,
  X,
} from "lucide-react";

import AgoreAvatar from "@/components/agore-avatar";
import PostMedia, {
  type PostMediaItem,
} from "@/components/post-media";
import { createClient } from "@/lib/supabase/browser";
import PostInteractions from "@/app/post-interactions";

type Profile = {
  display_name: string;
  username: string;
  avatar_path: string | null;
};

type FeedContext =
  | {
      type: "original";
    }
  | {
      type: "repost";
      id: string;
      user_id: string;
      created_at: string;
      profiles: Profile | null;
    };

type Post = {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  post_media: PostMediaItem[];
  profiles: Profile | null;
  feed_at?: string;
  feed_context?: FeedContext;
};

type PostsResponse = {
  posts: Post[];
};

type ErrorResponse = {
  error?: string;
};

type CreatedPostResponse = {
  post?: Post;
  error?: string;
};

type AttachedMediaResponse = {
  media?: PostMediaItem[];
  error?: string;
};

type PostFeedMode = "combined" | "home" | "create";

type HomeFeedTab = "for-you" | "following" | "likes";

type PostFeedProps = {
  mode?: PostFeedMode;
};

const HOME_FEED_TABS: Array<{
  value: HomeFeedTab;
  label: string;
}> = [
  { value: "for-you", label: "For you" },
  { value: "following", label: "Following" },
  { value: "likes", label: "Likes" },
];

const supabase = createClient();

const MAX_MEDIA_FILES = 10;
const MAX_MEDIA_SIZE = 15 * 1024 * 1024;

function formatPostDate(value: string) {
  const date = new Date(value);

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileKind(file: File) {
  const mimeType = file.type.toLowerCase();

  if (mimeType.startsWith("image/")) {
    return "image";
  }

  if (mimeType.startsWith("video/")) {
    return "video";
  }

  if (mimeType.startsWith("audio/")) {
    return "audio";
  }

  if (
    mimeType.includes("zip") ||
    mimeType.includes("archive") ||
    mimeType.includes("compressed")
  ) {
    return "archive";
  }

  if (
    mimeType.includes("pdf") ||
    mimeType.startsWith("text/") ||
    mimeType.includes("document") ||
    mimeType.includes("spreadsheet") ||
    mimeType.includes("presentation")
  ) {
    return "document";
  }

  return "file";
}

function getFileIcon(file: File) {
  const kind = getFileKind(file);

  if (kind === "image") {
    return FileImage;
  }

  if (kind === "video") {
    return Film;
  }

  if (kind === "audio") {
    return Archive;
  }

  if (kind === "archive") {
    return FileArchive;
  }

  if (kind === "document") {
    return FileText;
  }

  if (
    file.type.includes("json") ||
    file.type.includes("javascript") ||
    file.type.includes("typescript") ||
    file.type.includes("xml")
  ) {
    return FileCode2;
  }

  return File;
}

function sanitizeFileName(name: string) {
  const cleaned = name
    .normalize("NFKD")
    .replace(
      /[^A-Za-z0-9._'()+?;,:@&=$!*\-\s]/g,
      "_",
    )
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.slice(0, 120) || "attachment";
}

export default function PostFeed({
  mode = "combined",
}: PostFeedProps) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [activeFeed, setActiveFeed] =
    useState<HomeFeedTab>("for-you");

  const [content, setContent] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const [viewerId, setViewerId] = useState<string | null>(null);
  const [viewerName, setViewerName] = useState("");
  const [viewerAvatarPath, setViewerAvatarPath] =
    useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(
    null,
  );

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [openPostMenuId, setOpenPostMenuId] = useState<string | null>(
    null,
  );
  const [actionPostId, setActionPostId] = useState<string | null>(null);

  const loadViewer = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    setViewerId(user?.id ?? null);

    if (!user) {
      setViewerName("");
      setViewerAvatarPath(null);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, avatar_path")
      .eq("id", user.id)
      .maybeSingle();

    setViewerName(profile?.display_name ?? "");
    setViewerAvatarPath(profile?.avatar_path ?? null);
  }, []);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/posts?limit=20&feed=${activeFeed}`,
        {
          method: "GET",
          cache: "no-store",
        },
      );

      const data = (await response.json()) as
        | PostsResponse
        | ErrorResponse;

      if (!response.ok) {
        throw new Error(
          "error" in data && data.error
            ? data.error
            : "Unable to load posts.",
        );
      }

      setPosts(
        "posts" in data && Array.isArray(data.posts)
          ? data.posts.map((post) => ({
              ...post,
              post_media: Array.isArray(post.post_media)
                ? post.post_media
                : [],
              feed_at: post.feed_at ?? post.created_at,
              feed_context:
                post.feed_context ?? {
                  type: "original" as const,
                },
            }))
          : [],
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load posts.",
      );
    } finally {
      setLoading(false);
    }
  }, [activeFeed]);

  useEffect(() => {
    void loadViewer();
  }, [loadViewer]);

  useEffect(() => {
    if (mode !== "create") {
      void loadPosts();
    }
  }, [loadPosts, mode]);

  function handleMediaChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const files = Array.from(event.target.files ?? []);

    event.target.value = "";

    if (files.length === 0) {
      return;
    }

    setError("");
    setNotice("");

    if (
      selectedFiles.length + files.length >
      MAX_MEDIA_FILES
    ) {
      setError(
        `A post can contain up to ${MAX_MEDIA_FILES} attachments.`,
      );
      return;
    }

    const oversizedFile = files.find(
      (file) => file.size > MAX_MEDIA_SIZE,
    );

    if (oversizedFile) {
      setError(
        `"${oversizedFile.name}" is larger than 15 MB.`,
      );
      return;
    }

    const emptyFile = files.find(
      (file) => file.size <= 0,
    );

    if (emptyFile) {
      setError(
        `"${emptyFile.name}" is empty.`,
      );
      return;
    }

    setSelectedFiles((current) => [
      ...current,
      ...files,
    ]);
  }

  function removeSelectedFile(index: number) {
    if (publishing) {
      return;
    }

    setSelectedFiles((current) =>
      current.filter(
        (_, fileIndex) => fileIndex !== index,
      ),
    );
  }

  async function uploadAndAttachMedia(
    postId: string,
    files: File[],
  ) {
    const uploadedPaths: string[] = [];

    const uploadedItems: Array<{
      storage_path: string;
      mime_type: string;
      size_bytes: number;
      width: number | null;
      height: number | null;
      sort_order: number;
    }> = [];

    try {
      for (
        let index = 0;
        index < files.length;
        index += 1
      ) {
        const file = files[index];

        setUploadingIndex(index);

        const safeName = sanitizeFileName(file.name);

        const storagePath =
          `${postId}/${crypto.randomUUID()}-${safeName}`;

        const { error: uploadError } =
          await supabase.storage
            .from("post-media")
            .upload(storagePath, file, {
              contentType:
                file.type ||
                "application/octet-stream",
              cacheControl: "3600",
              upsert: false,
            });

        if (uploadError) {
          throw uploadError;
        }

        uploadedPaths.push(storagePath);

        uploadedItems.push({
          storage_path: storagePath,
          mime_type:
            file.type ||
            "application/octet-stream",
          size_bytes: file.size,
          width: null,
          height: null,
          sort_order: index,
        });
      }

      const response = await fetch(
        `/api/posts/${encodeURIComponent(postId)}/media`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            media: uploadedItems,
          }),
        },
      );

      const data =
        (await response.json()) as AttachedMediaResponse;

      if (!response.ok) {
        throw new Error(
          data.error ??
            "Unable to attach your media.",
        );
      }

      if (!Array.isArray(data.media)) {
        throw new Error(
          "The media response was invalid.",
        );
      }

      return data.media;
    } catch (uploadError) {
      if (uploadedPaths.length > 0) {
        await supabase.storage
          .from("post-media")
          .remove(uploadedPaths);
      }

      throw uploadError;
    } finally {
      setUploadingIndex(null);
    }
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const trimmedContent = content.trim();

    if (!trimmedContent || publishing) {
      return;
    }

    setPublishing(true);
    setError("");
    setNotice("");
    setOpenPostMenuId(null);

    try {
      const response = await fetch("/api/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: trimmedContent,
        }),
      });

      const data =
        (await response.json()) as CreatedPostResponse;

      if (!response.ok) {
        throw new Error(
          data.error ??
            "Unable to publish your post.",
        );
      }

      if (!data.post) {
        throw new Error(
          "The post response was invalid.",
        );
      }

      let finalPost: Post = {
        ...data.post,
        post_media: Array.isArray(
          data.post.post_media,
        )
          ? data.post.post_media
          : [],
        feed_at: data.post.created_at,
        feed_context: {
          type: "original",
        },
      };

      if (selectedFiles.length > 0) {
        try {
          const media =
            await uploadAndAttachMedia(
              data.post.id,
              selectedFiles,
            );

          finalPost = {
            ...finalPost,
            post_media: media,
          };
        } catch (mediaError) {
          await fetch(
            `/api/posts/${encodeURIComponent(
              data.post.id,
            )}`,
            {
              method: "DELETE",
            },
          ).catch(() => undefined);

          throw new Error(
            mediaError instanceof Error
              ? `Your attachments could not be uploaded. ${mediaError.message}`
              : "Your attachments could not be uploaded.",
          );
        }
      }

      setPosts((currentPosts) => [
        finalPost,
        ...currentPosts,
      ]);

      setContent("");
      setSelectedFiles([]);

      setNotice(
        selectedFiles.length > 0
          ? "Your post and attachments are live."
          : "Your post is live.",
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to publish your post.",
      );
    } finally {
      setPublishing(false);
    }
  }

  async function sharePost(post: Post) {
    setOpenPostMenuId(null);
    setActionPostId(post.id);
    setError("");
    setNotice("");

    const shareUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/post/${encodeURIComponent(
            post.id,
          )}`
        : "";

    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.share
      ) {
        await navigator.share({
          title: `${
            post.profiles?.display_name ??
            "Agoré user"
          } on Agoré`,
          text: post.content.slice(0, 140),
          url: shareUrl,
        });

        setNotice("Post shared.");
      } else if (
        typeof navigator !== "undefined" &&
        navigator.clipboard
      ) {
        await navigator.clipboard.writeText(
          shareUrl,
        );

        setNotice("Post link copied.");
      } else {
        setNotice(
          "Post link is ready to share.",
        );
      }
    } catch (shareError) {
      if (
        shareError instanceof DOMException &&
        shareError.name === "AbortError"
      ) {
        return;
      }

      setError("Unable to share this post.");
    } finally {
      setActionPostId(null);
    }
  }

  async function reportPost(post: Post) {
    setOpenPostMenuId(null);

    const confirmed = window.confirm(
      "Report this post to Agoré moderation?",
    );

    if (!confirmed) {
      return;
    }

    setActionPostId(post.id);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/posts/${encodeURIComponent(
          post.id,
        )}/report`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            reason: "user_report",
          }),
        },
      );

      const data =
        (await response.json()) as ErrorResponse;

      if (!response.ok) {
        throw new Error(
          data.error ??
            "Unable to submit the report.",
        );
      }

      setNotice(
        "Thanks. The post has been reported.",
      );
    } catch (reportError) {
      console.error(
        "Failed to report Agore post:",
        reportError,
      );

      setError(
        reportError instanceof Error
          ? reportError.message
          : "Unable to submit the report.",
      );
    } finally {
      setActionPostId(null);
    }
  }

  function handlePostUpdated(
    postId: string,
    updatedContent: string,
  ) {
    setPosts((currentPosts) =>
      currentPosts.map((post) =>
        post.id === postId
          ? {
              ...post,
              content: updatedContent,
              updated_at:
                new Date().toISOString(),
            }
          : post,
      ),
    );
  }

  function handlePostDeleted(postId: string) {
    setPosts((currentPosts) =>
      currentPosts.filter(
        (post) => post.id !== postId,
      ),
    );
  }

  return (
    <div className="space-y-7">
      {mode !== "home" ? (
        <section className="relative overflow-hidden rounded-[2rem] border border-[var(--border)] bg-[var(--surface)]">
          <div className="absolute inset-y-0 left-0 w-1 bg-[var(--accent)]" />

          <div className="absolute right-[-45px] top-[-45px] h-32 w-32 rounded-full border-[16px] border-[var(--accent-soft)]" />

          <div className="relative px-5 py-5 sm:px-7 sm:py-6">
            <div className="flex items-start justify-between gap-5">
              <div>
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />

                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
                    Your turn
                  </p>
                </div>

                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
                  What’s worth saying?
                </h2>

                <p className="mt-2 max-w-lg text-sm leading-6 text-[var(--muted)]">
                  Drop a thought, question, observation, or something you want
                  people to see.
                </p>
              </div>

              <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)] sm:flex">
                <Sparkles size={18} />
              </span>
            </div>

            <form
              onSubmit={handleSubmit}
              className="mt-6"
            >
              <div className="flex items-start gap-3">
                <AgoreAvatar
                  avatarPath={viewerAvatarPath}
                  name={viewerName}
                  className="h-10 w-10"
                  textClassName="text-xs"
                />

                <div className="min-w-0 flex-1">
                  <textarea
                    value={content}
                    onChange={(event) =>
                      setContent(event.target.value)
                    }
                    maxLength={2000}
                    rows={4}
                    disabled={publishing}
                    placeholder={
                      viewerName
                        ? `Say something, ${
                            viewerName.split(" ")[0]
                          }…`
                        : "Say something…"
                    }
                    className="w-full resize-none rounded-[1.35rem] border border-[var(--border)] bg-[var(--background)] px-4 py-4 text-[15px] leading-7 outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-70"
                  />

                  {selectedFiles.length > 0 ? (
                    <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--background)] p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold">
                            Attachments
                          </p>

                          <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                            {selectedFiles.length}{" "}
                            {selectedFiles.length === 1
                              ? "file"
                              : "files"}{" "}
                            selected
                          </p>
                        </div>

                        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                          Max 15 MB each
                        </span>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        {selectedFiles.map((file, index) => {
                          const Icon = getFileIcon(file);

                          return (
                            <div
                              key={`${file.name}-${file.size}-${index}`}
                              className="flex min-w-0 items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5"
                            >
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                                <Icon size={16} />
                              </span>

                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-semibold">
                                  {file.name}
                                </p>

                                <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                                  {formatFileSize(file.size)}
                                </p>
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  removeSelectedFile(index)
                                }
                                disabled={publishing}
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--background)] hover:text-[var(--foreground)] disabled:opacity-40"
                                aria-label={`Remove ${file.name}`}
                              >
                                <X size={14} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <label
                        htmlFor="agore-post-media"
                        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-[var(--background)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)] ${
                          publishing
                            ? "pointer-events-none opacity-50"
                            : ""
                        }`}
                      >
                        <Paperclip size={13} />
                        Add media
                      </label>

                      <input
                        id="agore-post-media"
                        type="file"
                        multiple
                        accept="*/*"
                        className="sr-only"
                        onChange={handleMediaChange}
                        disabled={publishing}
                      />

                      <span className="hidden items-center gap-1.5 rounded-full bg-[var(--background)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] sm:inline-flex">
                        <ImageIcon size={13} />
                        Images, video, audio, documents & more
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs tabular-nums text-[var(--muted)]">
                        {content.length}/2000
                      </span>

                      <button
                        type="submit"
                        disabled={!content.trim() || publishing}
                        className="rounded-full bg-[var(--foreground)] px-5 py-2.5 text-sm font-semibold text-[var(--background)] transition hover:bg-[var(--accent)] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {publishing
                          ? uploadingIndex !== null
                            ? `Uploading ${
                                uploadingIndex + 1
                              }/${selectedFiles.length}…`
                            : "Publishing…"
                          : "Put it out there"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </section>
      ) : null}

      {error ? (
        <section className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--danger)]/20 bg-[var(--danger-soft)] px-4 py-3 text-sm">
          <p>{error}</p>

          <button
            type="button"
            onClick={() => setError("")}
            className="shrink-0 rounded-full p-1 text-[var(--danger)] transition hover:bg-[var(--danger)]/10"
            aria-label="Dismiss error"
          >
            <X size={15} />
          </button>
        </section>
      ) : null}

      {notice ? (
        <section className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--success)]/20 bg-[var(--success-soft)] px-4 py-3 text-sm">
          <p>{notice}</p>

          <button
            type="button"
            onClick={() => setNotice("")}
            className="shrink-0 rounded-full p-1 text-[var(--success)] transition hover:bg-[var(--success)]/10"
            aria-label="Dismiss notice"
          >
            <X size={15} />
          </button>
        </section>
      ) : null}

      {mode !== "create" ? (
        <section>
          <div className="mb-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h1 className="text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
                  Home
                </h1>

                <p className="mt-2 text-sm text-[var(--muted)]">
                  Your world, in motion.
                </p>
              </div>

              <button
                type="button"
                onClick={() => void loadPosts()}
                disabled={loading}
                aria-label="Refresh feed"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw
                  size={16}
                  className={loading ? "animate-spin" : ""}
                />
              </button>
            </div>

            <div className="sticky top-[72px] z-30 mt-4 border-b border-[var(--border)] bg-[color:var(--background)]/95 backdrop-blur">
              <div
                className="grid grid-cols-3"
                role="tablist"
                aria-label="Home feed sections"
              >
                {HOME_FEED_TABS.map((tab) => {
                  const selected = activeFeed === tab.value;

                  return (
                    <button
                      key={tab.value}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => setActiveFeed(tab.value)}
                      className={`relative min-h-12 px-2 text-sm font-medium transition ${
                        selected
                          ? "text-[var(--foreground)]"
                          : "text-[var(--muted)] hover:text-[var(--foreground)]"
                      }`}
                    >
                      {tab.label}

                      {selected ? (
                        <span className="absolute inset-x-5 bottom-0 h-0.5 rounded-full bg-[var(--accent)]" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <p
              className="mt-3 text-xs text-[var(--muted)]"
              aria-live="polite"
            >
              {activeFeed === "for-you"
                ? "Discover conversations beyond your following list."
                : activeFeed === "following"
                  ? "Recent posts from people you follow."
                  : "Posts you've liked, collected in one place."}
            </p>
          </div>

          {loading ? (
            <div className="space-y-4">
              {[0, 1, 2].map((item) => (
                <article
                  key={item}
                  className="rounded-[1.75rem] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6"
                >
                  <div className="animate-pulse space-y-5">
                    <div className="flex gap-3">
                      <div className="h-11 w-11 rounded-full bg-[var(--surface-muted)]" />

                      <div className="space-y-2">
                        <div className="h-3 w-28 rounded-full bg-[var(--surface-muted)]" />
                        <div className="h-3 w-20 rounded-full bg-[var(--surface-muted)]" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="h-3 w-full rounded-full bg-[var(--surface-muted)]" />
                      <div className="h-3 w-5/6 rounded-full bg-[var(--surface-muted)]" />
                      <div className="h-3 w-2/3 rounded-full bg-[var(--surface-muted)]" />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : posts.length === 0 ? (
            <div className="overflow-hidden rounded-[1.75rem] border border-dashed border-[var(--border)] bg-[var(--surface)]">
              <div className="px-6 py-12 text-center sm:px-10">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                  <Sparkles size={24} />
                </span>

                <h3 className="mt-5 text-lg font-semibold tracking-[-0.02em]">
                  The conversation is waiting.
                </h3>

                <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--muted)]">
                  {activeFeed === "likes"
                    ? "Posts you like will appear here so you can revisit them."
                    : activeFeed === "following"
                      ? "Your following feed is quiet. Explore Agoré and follow people to bring their conversations here."
                      : "No visible posts have reached your feed yet. Explore Agoré to discover more people and conversations."}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {posts.map((post) => {
                const feedContext =
                  post.feed_context ?? {
                    type: "original" as const,
                  };

                const isRepost = feedContext.type === "repost";

                const isOwner =
                  viewerId !== null &&
                  viewerId === post.author_id;

                const authorName =
                  post.profiles?.display_name ?? "Agoré user";

                const authorUsername =
                  post.profiles?.username ?? "unknown";

                const postPath =
                  `/post/${encodeURIComponent(post.id)}`;

                const feedItemKey = isRepost
                  ? `repost-${feedContext.id}`
                  : `post-${post.id}`;

                const feedItemId = isRepost
                  ? `feed-repost-${feedContext.id}`
                  : `post-${post.id}`;

                const repostedByName = isRepost
                  ? feedContext.profiles?.display_name ??
                    "Agoré user"
                  : "";

                return (
                  <article
                    id={feedItemId}
                    key={feedItemKey}
                    className="group relative overflow-visible rounded-[1.75rem] border border-[var(--border)] bg-[var(--surface)] transition hover:border-[var(--accent)]/30"
                  >
                    {isRepost ? (
                      <div className="px-5 pt-4 sm:px-6 sm:pt-5">
                        <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                          <Repeat2
                            size={14}
                            className="shrink-0 text-[var(--accent)]"
                          />

                          <span>Reposted by</span>

                          {feedContext.profiles ? (
                            <Link
                              href={`/profile/${encodeURIComponent(
                                feedContext.user_id,
                              )}`}
                              className="truncate font-semibold text-[var(--foreground)] transition hover:text-[var(--accent)]"
                            >
                              {repostedByName}
                            </Link>
                          ) : (
                            <span className="truncate font-semibold text-[var(--foreground)]">
                              {repostedByName}
                            </span>
                          )}
                        </div>
                      </div>
                    ) : null}

                    <div
                      className={`px-5 sm:px-6 ${
                        isRepost ? "pt-3" : "pt-5"
                      }`}
                    >
                      <header className="flex items-start justify-between gap-4">
                        <Link
                          href={`/profile/${encodeURIComponent(
                            post.author_id,
                          )}`}
                          className="flex min-w-0 items-center gap-3"
                        >
                          <AgoreAvatar
                            avatarPath={post.profiles?.avatar_path}
                            name={authorName}
                            className="h-11 w-11 transition group-hover:scale-[1.02]"
                            textClassName="text-sm"
                          />

                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold">
                              {authorName}
                            </span>

                            <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">
                              @{authorUsername}
                            </span>
                          </span>
                        </Link>

                        <div className="relative flex shrink-0 items-center gap-2">
                          <time
                            dateTime={post.created_at}
                            className="hidden text-right text-xs text-[var(--muted)] sm:block"
                          >
                            {formatPostDate(post.created_at)}
                          </time>

                          {!isOwner ? (
                            <>
                              <button
                                type="button"
                                aria-label="Post actions"
                                aria-expanded={openPostMenuId === post.id}
                                onClick={() =>
                                  setOpenPostMenuId((current) =>
                                    current === post.id
                                      ? null
                                      : post.id,
                                  )
                                }
                                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--background)] hover:text-[var(--foreground)]"
                              >
                                {actionPostId === post.id ? (
                                  <Loader2
                                    size={16}
                                    className="animate-spin"
                                  />
                                ) : (
                                  <MoreHorizontal size={17} />
                                )}
                              </button>

                              {openPostMenuId === post.id ? (
                                <>
                                  <button
                                    type="button"
                                    aria-label="Close post actions"
                                    className="fixed inset-0 z-10 cursor-default"
                                    onClick={() =>
                                      setOpenPostMenuId(null)
                                    }
                                  />

                                  <div className="absolute right-0 top-full z-20 mt-2 w-48 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-[0_12px_35px_rgba(0,0,0,0.12)]">
                                    <button
                                      type="button"
                                      onClick={() => void sharePost(post)}
                                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-[var(--background)]"
                                    >
                                      <Share2 size={15} />
                                      Share post
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => void reportPost(post)}
                                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-[var(--danger)] transition hover:bg-[var(--danger-soft)]"
                                    >
                                      <FileText size={15} />
                                      Report post
                                    </button>
                                  </div>
                                </>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                      </header>

                      <Link
                        href={postPath}
                        aria-label={`Open post by ${authorName}`}
                        className="mt-5 block rounded-[1rem] outline-none transition focus-visible:ring-4 focus-visible:ring-[var(--accent-soft)]"
                      >
                        <p className="whitespace-pre-wrap text-[15px] leading-7 text-[var(--foreground)] transition group-hover:text-[var(--accent)] sm:text-base sm:leading-7">
                          {post.content}
                        </p>
                      </Link>

                      <PostMedia media={post.post_media} />
                    </div>

                    <div className="px-5 pb-2 sm:px-6">
                      <PostInteractions
                        postId={post.id}
                        initialContent={post.content}
                        isOwner={isOwner}
                        onPostUpdated={handlePostUpdated}
                        onPostDeleted={handlePostDeleted}
                      />
                    </div>

                    {post.updated_at !== post.created_at ? (
                      <div className="px-5 pb-4 sm:px-6">
                        <p className="text-[11px] text-[var(--muted)]">
                          Edited
                        </p>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}