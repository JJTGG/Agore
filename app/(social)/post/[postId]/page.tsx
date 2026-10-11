
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Clock3,
  Flag,
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

type Profile = {
  display_name: string;
  username: string;
  avatar_path: string | null;
};

type Post = {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  post_media: PostMediaItem[];
  profiles: Profile | null;
};

type PostResponse = {
  post?: Post;
  error?: string;
};

type ApiErrorResponse = {
  error?: string;
};

const supabase = createClient();

function formatPostDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
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

        const [authResult, response] = await Promise.all([
          supabase.auth.getUser(),
          fetch(`/api/posts/${encodeURIComponent(postId)}`, {
            method: "GET",
            cache: "no-store",
          }),
        ]);

        if (authResult.error) {
          throw authResult.error;
        }

        const data = (await response.json()) as PostResponse;

        if (!response.ok) {
          throw new Error(
            data.error ?? "Unable to load this post.",
          );
        }

        if (!data.post) {
          throw new Error("The post response was invalid.");
        }

        if (!cancelled) {
          setViewerId(authResult.data.user?.id ?? null);
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
          title: `${
            post.profiles?.display_name ?? "Agoré user"
          } on Agoré`,
          text: post.content.slice(0, 140),
          url: shareUrl,
        });

        setActionNotice("Post shared.");
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        setActionNotice("Post link copied.");
      } else {
        setActionNotice(
          `Copy this link to share the post: ${shareUrl}`,
        );
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
    if (!post || actionBusy || viewerId === post.author_id) {
      return;
    }

    setActionMenuOpen(false);

    const confirmed = window.confirm(
      "Report this post to Agoré moderation?",
    );

    if (!confirmed) {
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
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            reason: "user_report",
          }),
        },
      );

      const data =
        (await response.json().catch(() => ({}))) as ApiErrorResponse;

      if (!response.ok) {
        throw new Error(
          data.error ?? "Unable to submit the report.",
        );
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
    <main className="min-w-0 bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto w-full max-w-3xl px-0 pb-10">
        <div className="py-4 sm:py-6">
          <section className="min-w-0 w-full max-w-3xl">
            <div className="mb-4 flex items-center gap-3 border-b border-[var(--border)] pb-4">
              <Link
                href="/home"
                aria-label="Back to home"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
              >
                <ArrowLeft size={19} />
              </Link>

              <div className="min-w-0">
                <h1 className="text-lg font-semibold tracking-[-0.025em]">
                  Post
                </h1>
                <p className="text-xs text-[var(--muted)]">
                  The post and its conversation
                </p>
              </div>
            </div>

            {loading ? (
              <section
                aria-label="Loading post"
                className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7"
              >
                <div className="animate-pulse space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-full bg-[var(--surface-muted)]" />

                    <div className="space-y-2">
                      <div className="h-3 w-28 rounded-full bg-[var(--surface-muted)]" />
                      <div className="h-3 w-20 rounded-full bg-[var(--surface-muted)]" />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="h-4 w-full rounded-full bg-[var(--surface-muted)]" />
                    <div className="h-4 w-11/12 rounded-full bg-[var(--surface-muted)]" />
                    <div className="h-4 w-8/12 rounded-full bg-[var(--surface-muted)]" />
                  </div>

                  <div className="h-56 rounded-2xl bg-[var(--surface-muted)]" />
                </div>
              </section>
            ) : error ? (
              <section
                role="alert"
                className="rounded-[1.5rem] border border-[var(--danger)]/20 bg-[var(--danger-soft)] p-6 sm:p-8"
              >
                <div className="flex items-start gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--danger)]/10 text-[var(--danger)]">
                    <X size={18} />
                  </span>

                  <div>
                    <p className="text-sm font-semibold">
                      We couldn’t open this post.
                    </p>

                    <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                      {error}
                    </p>

                    <Link
                      href="/home"
                      className="mt-4 inline-flex rounded-full bg-[var(--foreground)] px-4 py-2.5 text-sm font-semibold text-[var(--background)] transition hover:bg-[var(--accent)] hover:text-white"
                    >
                      Return home
                    </Link>
                  </div>
                </div>
              </section>
            ) : post ? (
              <article className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface)]">
                <div className="px-5 pt-5 sm:px-7 sm:pt-7">
                  <header className="flex items-start gap-3">
                    <Link
                      href={`/profile/${encodeURIComponent(post.author_id)}`}
                      className="shrink-0"
                      aria-label={`Open ${
                        post.profiles?.display_name ?? "user"
                      }'s profile`}
                    >
                      <AgoreAvatar
                        avatarPath={post.profiles?.avatar_path}
                        name={post.profiles?.display_name ?? "Agoré user"}
                        className="h-12 w-12"
                        textClassName="text-sm"
                      />
                    </Link>

                    <div className="min-w-0 flex-1 pt-0.5">
                      <Link
                        href={`/profile/${encodeURIComponent(post.author_id)}`}
                        className="block min-w-0 transition hover:text-[var(--accent)]"
                      >
                        <UserIdentity
                          userId={post.author_id}
                          displayName={
                            post.profiles?.display_name ?? "Agoré user"
                          }
                          className="w-full"
                          nameClassName="min-w-0 truncate text-sm font-semibold"
                          badgeSize={17}
                        />
                      </Link>

                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--muted)]">
                        <span>
                          @{post.profiles?.username ?? "unknown"}
                        </span>

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

                          <div className="absolute right-0 top-full z-20 mt-2 w-48 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-[0_12px_35px_rgba(0,0,0,0.14)]">
                            <button
                              type="button"
                              onClick={() => void sharePost()}
                              className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-[var(--background)]"
                            >
                              <Share2 size={15} />
                              Share post
                            </button>

                            {viewerId !== post.author_id ? (
                              <button
                                type="button"
                                onClick={() => void reportPost()}
                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-[var(--danger)] transition hover:bg-[var(--danger-soft)]"
                              >
                                <Flag size={15} />
                                Report post
                              </button>
                            ) : null}
                          </div>
                        </>
                      ) : null}
                    </div>
                  </header>

                  <div className="mt-6">
                    <p className="whitespace-pre-wrap break-words text-[17px] leading-8 tracking-[-0.01em] text-[var(--foreground)] sm:text-lg sm:leading-8">
                      {post.content}
                    </p>
                  </div>

                  {post.post_media.length > 0 ? (
                    <div className="mt-4">
                      <PostMedia media={post.post_media} />
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
                      className="mt-4 break-words rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-xs leading-5 text-[var(--muted)]"
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
                  <PostInteractions
                    postId={post.id}
                    initialContent={post.content}
                    isOwner={
                      viewerId !== null &&
                      viewerId === post.author_id
                    }
                    commentsOpenByDefault
                    onPostUpdated={handlePostUpdated}
                    onPostDeleted={handlePostDeleted}
                  />
                </div>
              </article>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}
