
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  AudioLines,
  Clock3,
  Download,
  File,
  Film,
  Image as ImageIcon,
  Loader2,
  MoreHorizontal,
  Share2,
  X,
} from "lucide-react";

import AgoreAvatar from "@/components/agore-avatar";
import PostMedia, {
  type PostMediaItem,
} from "@/components/post-media";
import PostInteractions from "@/app/post-interactions";
import UserIdentity from "@/components/user-identity";
import { createClient } from "@/lib/supabase/browser";

type AccountType =
  | "personal"
  | "creator"
  | "business"
  | "organization"
  | "institution";

type VerificationKind =
  | "agore_official"
  | "official"
  | "paid"
  | null;

type PublicMediaItem = PostMediaItem & {
  signed_url?: string | null;
};

type Profile = {
  display_name: string;
  username: string;
  avatar_path: string | null;
  avatar_url?: string | null;
  account_type?: AccountType;
  verification_kind?: VerificationKind;
};

type Post = {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  post_media: PublicMediaItem[];
  profiles: Profile | null;
};

type PostResponse = {
  post?: Post;
  error?: string;
};

const supabase = createClient();

function formatPostDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getInitials(name: string | null | undefined) {
  const initials =
    name
      ?.split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") ?? "";

  return initials || "A";
}

function getFileName(storagePath: string) {
  const rawName = storagePath.split("/").pop() ?? "Attachment";
  return rawName.replace(/^[0-9a-f-]{36}-/i, "");
}

function PublicPostMedia({
  media,
}: {
  media: PublicMediaItem[];
}) {
  return (
    <div className="mt-5 space-y-3">
      {media.map((item) => {
        const url = item.signed_url;
        const mimeType = item.mime_type.toLowerCase();
        const fileName = getFileName(item.storage_path);

        if (!url) {
          return (
            <div
              key={item.id}
              className="rounded-2xl border border-[var(--border)] bg-[var(--background)] px-4 py-3"
            >
              <p className="text-sm font-medium">{fileName}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                This attachment is temporarily unavailable.
              </p>
            </div>
          );
        }

        if (mimeType.startsWith("image/")) {
          return (
            <a
              key={item.id}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="group block overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background)]"
            >
              <img
                src={url}
                alt={fileName}
                width={item.width ?? undefined}
                height={item.height ?? undefined}
                loading="lazy"
                className="max-h-[620px] w-full object-contain"
              />
              <div className="flex items-center gap-2 border-t border-[var(--border)] px-4 py-3">
                <ImageIcon size={15} className="text-[var(--accent)]" />
                <span className="truncate text-xs text-[var(--muted)]">
                  {fileName}
                </span>
              </div>
            </a>
          );
        }

        if (mimeType.startsWith("video/")) {
          return (
            <div
              key={item.id}
              className="overflow-hidden rounded-2xl border border-[var(--border)] bg-black"
            >
              <video
                src={url}
                controls
                preload="metadata"
                className="max-h-[620px] w-full"
              />
              <div className="flex items-center gap-2 bg-[var(--surface)] px-4 py-3">
                <Film size={15} className="text-[var(--accent)]" />
                <span className="truncate text-xs text-[var(--muted)]">
                  {fileName}
                </span>
              </div>
            </div>
          );
        }

        if (mimeType.startsWith("audio/")) {
          return (
            <div
              key={item.id}
              className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4"
            >
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <AudioLines size={17} className="text-[var(--accent)]" />
                <span className="truncate">{fileName}</span>
              </div>
              <audio src={url} controls preload="metadata" className="w-full" />
            </div>
          );
        }

        return (
          <a
            key={item.id}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 transition hover:border-[var(--accent)]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface)]">
              <File size={18} />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {fileName}
            </span>
            <Download size={16} className="shrink-0 text-[var(--accent)]" />
          </a>
        );
      })}
    </div>
  );
}

export default function PostPage() {
  const params = useParams<{ postId: string }>();
  const router = useRouter();
  const postId = params?.postId ?? "";

  const [post, setPost] = useState<Post | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState<
    "share" | "report" | null
  >(null);
  const [actionNotice, setActionNotice] = useState("");
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadPostPage() {
      setLoading(true);
      setError("");

      try {
        if (!postId) {
          throw new Error("This post could not be identified.");
        }

        const { data: authData } = await supabase.auth.getUser();
        const user = authData.user ?? null;

        let response = await fetch(
          user
            ? `/api/posts/${encodeURIComponent(postId)}`
            : `/api/public/posts/${encodeURIComponent(postId)}`,
          {
            method: "GET",
            cache: "no-store",
          },
        );

        let resolvedViewerId = user?.id ?? null;

        // If the server session is no longer valid, retry using the
        // deliberately public, read-only endpoint.
        if (user && response.status === 401) {
          resolvedViewerId = null;
          response = await fetch(
            `/api/public/posts/${encodeURIComponent(postId)}`,
            {
              method: "GET",
              cache: "no-store",
            },
          );
        }

        const data = (await response.json()) as PostResponse;

        if (!response.ok) {
          throw new Error(data.error ?? "Unable to load this post.");
        }

        if (!data.post) {
          throw new Error("The post response was invalid.");
        }

        if (!cancelled) {
          setViewerId(resolvedViewerId);
          setPost({
            ...data.post,
            post_media: Array.isArray(data.post.post_media)
              ? data.post.post_media
              : [],
          });
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Unable to load this post.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadPostPage();

    return () => {
      cancelled = true;
    };
  }, [postId]);

  async function sharePost() {
    if (!post || actionBusy) {
      return;
    }

    setActionMenuOpen(false);
    setActionBusy("share");
    setActionNotice("");
    setActionError("");

    const shareUrl =
      `${window.location.origin}/post/` +
      encodeURIComponent(post.id);

    try {
      if (typeof navigator.share === "function") {
        await navigator.share({
          title: `${post.profiles?.display_name ?? "Agoré user"} on Agoré`,
          text: post.content.slice(0, 140),
          url: shareUrl,
        });

        setActionNotice("Post shared.");
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        setActionNotice("Post link copied.");
      } else {
        setActionNotice(`Copy this link to share the post: ${shareUrl}`);
      }
    } catch (shareError) {
      if (
        shareError instanceof DOMException &&
        shareError.name === "AbortError"
      ) {
        return;
      }

      setActionError("Unable to share this post.");
    } finally {
      setActionBusy(null);
    }
  }

  async function reportPost() {
    if (!post || !viewerId || actionBusy || viewerId === post.author_id) {
      return;
    }

    setActionMenuOpen(false);

    if (!window.confirm("Report this post to Agoré moderation?")) {
      return;
    }

    setActionBusy("report");
    setActionNotice("");
    setActionError("");

    try {
      const response = await fetch(
        `/api/posts/${encodeURIComponent(post.id)}/report`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "user_report" }),
        },
      );

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to submit the report.");
      }

      setActionNotice("Thanks. The post has been reported.");
    } catch (reportError) {
      setActionError(
        reportError instanceof Error
          ? reportError.message
          : "Unable to submit the report.",
      );
    } finally {
      setActionBusy(null);
    }
  }

  function handlePostUpdated(
    updatedPostId: string,
    updatedContent: string,
  ) {
    setPost((currentPost) =>
      currentPost?.id === updatedPostId
        ? {
            ...currentPost,
            content: updatedContent,
            updated_at: new Date().toISOString(),
          }
        : currentPost,
    );
  }

  function handlePostDeleted() {
    router.replace("/home");
  }

  return (
    <main className="min-h-dvh bg-[var(--background)] text-[var(--foreground)]">
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--background)]/95 backdrop-blur">
        <div className="mx-auto flex min-h-[68px] max-w-4xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link
            href={viewerId ? "/home" : "/"}
            aria-label="Agoré home"
            className="flex shrink-0 items-center"
          >
            <img
              src="/agore-logo.svg"
              alt="Agoré"
              className="agore-brand-logo-primary h-7 w-auto"
            />
            <img
              src="/agore-logo-inverse.svg"
              alt="Agoré"
              className="agore-brand-logo-inverse h-7 w-auto"
            />
          </Link>

          {viewerId ? (
            <Link
              href="/home"
              className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Open Agoré
            </Link>
          ) : (
            <Link
              href="/auth"
              className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Sign in
            </Link>
          )}
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl px-4 pb-12 sm:px-6">
        <div className="py-5 sm:py-8">
          <div className="mb-5 flex items-center gap-3">
            <Link
              href={viewerId ? "/home" : "/"}
              aria-label="Back"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
            >
              <ArrowLeft size={19} />
            </Link>

            <div>
              <h1 className="text-lg font-semibold tracking-[-0.025em]">
                Shared post
              </h1>
              <p className="text-xs text-[var(--muted)]">
                A conversation on Agoré
              </p>
            </div>
          </div>

          {loading ? (
            <section
              aria-label="Loading post"
              className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-8"
            >
              <div className="flex items-center justify-center gap-3 text-sm text-[var(--muted)]">
                <Loader2 size={18} className="animate-spin" />
                Loading post…
              </div>
            </section>
          ) : error ? (
            <section
              role="alert"
              className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8"
            >
              <div className="flex items-start gap-3">
                <X size={20} className="mt-0.5 shrink-0 text-[var(--danger)]" />
                <div>
                  <h2 className="font-semibold">This post isn’t available</h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                    {error}
                  </p>
                  <Link
                    href={viewerId ? "/home" : "/"}
                    className="mt-4 inline-flex rounded-full bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white"
                  >
                    {viewerId ? "Return home" : "Explore Agoré"}
                  </Link>
                </div>
              </div>
            </section>
          ) : post ? (
            <>
              <article className="rounded-3xl border border-[var(--border)] bg-[var(--surface)]">
                <div className="px-5 pt-5 sm:px-7 sm:pt-7">
                  <header className="flex items-start gap-3">
                    {post.profiles?.avatar_url ? (
                      <img
                        src={post.profiles.avatar_url}
                        alt={`${post.profiles.display_name}'s profile photo`}
                        className="h-12 w-12 shrink-0 rounded-full object-cover"
                      />
                    ) : viewerId ? (
                      <AgoreAvatar
                        avatarPath={post.profiles?.avatar_path}
                        name={post.profiles?.display_name ?? "Agoré user"}
                        className="h-12 w-12"
                        textClassName="text-sm"
                      />
                    ) : (
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-sm font-bold text-[var(--accent)]">
                        {getInitials(post.profiles?.display_name)}
                      </span>
                    )}

                    <div className="min-w-0 flex-1 pt-0.5">
                      {viewerId ? (
                        <Link
                          href={`/profile/${encodeURIComponent(post.author_id)}`}
                          className="block min-w-0 transition hover:text-[var(--accent)]"
                        >
                          {post.profiles?.account_type !== undefined &&
                          post.profiles?.verification_kind !== undefined ? (
                            <UserIdentity
                              userId={post.author_id}
                              displayName={post.profiles.display_name}
                              accountType={post.profiles.account_type}
                              verificationKind={post.profiles.verification_kind}
                              className="w-full"
                              nameClassName="min-w-0 truncate text-sm font-semibold"
                              badgeSize={17}
                            />
                          ) : (
                            <UserIdentity
                              userId={post.author_id}
                              displayName={post.profiles?.display_name ?? "Agoré user"}
                              className="w-full"
                              nameClassName="min-w-0 truncate text-sm font-semibold"
                              badgeSize={17}
                            />
                          )}
                        </Link>
                      ) : post.profiles?.account_type !== undefined &&
                        post.profiles?.verification_kind !== undefined ? (
                        <UserIdentity
                          displayName={post.profiles.display_name}
                          accountType={post.profiles.account_type}
                          verificationKind={post.profiles.verification_kind}
                          className="w-full"
                          nameClassName="min-w-0 truncate text-sm font-semibold"
                          badgeSize={17}
                        />
                      ) : (
                        <p className="truncate text-sm font-semibold">
                          {post.profiles?.display_name ?? "Agoré user"}
                        </p>
                      )}

                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--muted)]">
                        <span>@{post.profiles?.username ?? "unknown"}</span>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1">
                          <Clock3 size={12} />
                          <time dateTime={post.created_at}>
                            {formatPostDate(post.created_at)}
                          </time>
                        </span>
                      </div>
                    </div>

                    <div className="relative shrink-0">
                      <button
                        type="button"
                        aria-label="More post actions"
                        aria-expanded={actionMenuOpen}
                        disabled={actionBusy !== null}
                        onClick={() =>
                          setActionMenuOpen((current) => !current)
                        }
                        className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--background)] hover:text-[var(--foreground)] disabled:opacity-50"
                      >
                        {actionBusy ? (
                          <Loader2 size={17} className="animate-spin" />
                        ) : (
                          <MoreHorizontal size={19} />
                        )}
                      </button>

                      {actionMenuOpen ? (
                        <>
                          <button
                            type="button"
                            aria-label="Close post actions"
                            className="fixed inset-0 z-10 cursor-default"
                            onClick={() => setActionMenuOpen(false)}
                          />

                          <div className="absolute right-0 top-full z-20 mt-2 w-48 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-xl">
                            <button
                              type="button"
                              onClick={() => void sharePost()}
                              className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-[var(--background)]"
                            >
                              <Share2 size={15} />
                              Share post
                            </button>

                            {viewerId && viewerId !== post.author_id ? (
                              <button
                                type="button"
                                onClick={() => void reportPost()}
                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-[var(--danger)] transition hover:bg-[var(--danger-soft)]"
                              >
                                <X size={15} />
                                Report post
                              </button>
                            ) : null}
                          </div>
                        </>
                      ) : null}
                    </div>
                  </header>

                  <div className="mt-6">
                    <p className="whitespace-pre-wrap break-words text-[17px] leading-8 tracking-[-0.01em] sm:text-lg">
                      {post.content}
                    </p>
                  </div>

                  {post.post_media.length > 0 ? (
                    <div className="mt-4">
                      {post.post_media.some(
                        (item) => item.signed_url !== undefined,
                      ) ? (
                        <PublicPostMedia media={post.post_media} />
                      ) : (
                        <PostMedia media={post.post_media} />
                      )}
                    </div>
                  ) : null}

                  {post.updated_at !== post.created_at ? (
                    <p className="mt-4 text-[11px] text-[var(--muted)]">
                      Edited
                    </p>
                  ) : null}

                  {actionNotice ? (
                    <div
                      role="status"
                      aria-live="polite"
                      className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-xs leading-5 text-[var(--muted)]"
                    >
                      {actionNotice}
                    </div>
                  ) : null}

                  {actionError ? (
                    <div
                      role="alert"
                      className="mt-4 rounded-xl border border-[var(--danger)]/20 bg-[var(--danger-soft)] px-3 py-2.5 text-xs leading-5 text-[var(--danger)]"
                    >
                      {actionError}
                    </div>
                  ) : null}
                </div>

                <div className="px-5 pb-5 sm:px-7 sm:pb-7">
                  {viewerId ? (
                    <PostInteractions
                      postId={post.id}
                      initialContent={post.content}
                      isOwner={viewerId === post.author_id}
                      commentsOpenByDefault
                      onPostUpdated={handlePostUpdated}
                      onPostDeleted={handlePostDeleted}
                    />
                  ) : (
                    <section className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--background)] p-5 sm:p-6">
                      <h2 className="text-lg font-semibold tracking-tight">
                        Join the conversation
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                        You can read this post without an account. Sign in or
                        create an account to react, comment, repost, and take
                        part in Agoré.
                      </p>
                      <Link
                        href="/auth"
                        className="mt-4 inline-flex rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                      >
                        Sign in or join Agoré
                      </Link>
                    </section>
                  )}
                </div>
              </article>

              <p className="mt-5 text-center text-xs text-[var(--muted)]">
                Agoré · A place to gather.
              </p>
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}
