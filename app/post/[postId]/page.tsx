"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Clock3,
  MessageCircle,
  Repeat2,
  Share2,
  X,
} from "lucide-react";

import AgoreAvatar from "@/components/agore-avatar";
import PostMedia, {
  type PostMediaItem,
} from "@/components/post-media";
import PostInteractions from "@/app/post-interactions";
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

const supabase = createClient();

function formatPostDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function PostPage() {
  const [post, setPost] = useState<Post | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const postId =
      window.location.pathname
        .split("/")
        .filter(Boolean)
        .at(-1) ?? "";

    if (!postId) {
      setError("This post could not be identified.");
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadPostPage() {
      setLoading(true);
      setError("");

      try {
        const [
          {
            data: { user },
          },
          response,
        ] = await Promise.all([
          supabase.auth.getUser(),
          fetch(
            `/api/posts/${encodeURIComponent(postId)}`,
            {
              method: "GET",
              cache: "no-store",
            },
          ),
        ]);

        const data =
          (await response.json()) as PostResponse;

        if (!response.ok) {
          throw new Error(
            data.error ??
              "Unable to load this post.",
          );
        }

        if (!data.post) {
          throw new Error(
            "The post response was invalid.",
          );
        }

        if (!cancelled) {
          setViewerId(user?.id ?? null);

          setPost({
            ...data.post,
            post_media:
              Array.isArray(
                data.post.post_media,
              )
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
  }, []);

  return (
    <main className="min-h-screen bg-[var(--background)]">
      <div className="mx-auto min-h-screen w-full max-w-3xl px-4 py-5 sm:px-6 sm:py-8">
        <header className="mb-5 flex items-center justify-between gap-4 sm:mb-7">
          <Link
            href="/home"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2 text-sm font-medium text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--foreground)]"
          >
            <ArrowLeft size={16} />
            <span>Back</span>
          </Link>

          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
            <MessageCircle
              size={14}
              className="text-[var(--accent)]"
            />
            Post
          </div>
        </header>

        {loading ? (
          <section className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7">
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

              <div className="h-56 rounded-[1.5rem] bg-[var(--surface-muted)]" />
            </div>
          </section>
        ) : error ? (
          <section className="rounded-[2rem] border border-[var(--danger)]/20 bg-[var(--danger-soft)] p-6 sm:p-8">
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
          <div className="space-y-5">
            <article className="overflow-hidden rounded-[2rem] border border-[var(--border)] bg-[var(--surface)]">
              <div className="px-5 pt-6 sm:px-8 sm:pt-8">
                <div className="mb-5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                  Original post
                </div>

                <header className="flex items-start gap-3">
                  <Link
                    href={`/profile/${encodeURIComponent(
                      post.author_id,
                    )}`}
                    className="shrink-0"
                    aria-label={`Open ${
                      post.profiles?.display_name ??
                      "user"
                    }'s profile`}
                  >
                    <AgoreAvatar
                      avatarPath={
                        post.profiles?.avatar_path
                      }
                      name={
                        post.profiles?.display_name ??
                        "Agoré user"
                      }
                      className="h-12 w-12"
                      textClassName="text-sm"
                    />
                  </Link>

                  <div className="min-w-0">
                    <Link
                      href={`/profile/${encodeURIComponent(
                        post.author_id,
                      )}`}
                      className="block truncate text-sm font-semibold transition hover:text-[var(--accent)]"
                    >
                      {post.profiles?.display_name ??
                        "Agoré user"}
                    </Link>

                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                      <span>
                        @
                        {post.profiles?.username ??
                          "unknown"}
                      </span>

                      <span aria-hidden="true">
                        ·
                      </span>

                      <span className="inline-flex items-center gap-1">
                        <Clock3 size={12} />
                        {formatPostDate(
                          post.created_at,
                        )}
                      </span>
                    </div>
                  </div>
                </header>

                <div className="mt-7">
                  <p className="whitespace-pre-wrap text-[17px] leading-8 tracking-[-0.01em] text-[var(--foreground)] sm:text-lg sm:leading-8">
                    {post.content}
                  </p>
                </div>

                <PostMedia
                  media={post.post_media}
                />

                <div className="mt-6 border-t border-[var(--border)] pt-5">
                  <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--muted)]">
                    <span className="inline-flex items-center gap-1.5">
                      <MessageCircle size={14} />
                      Conversation
                    </span>

                    <span className="inline-flex items-center gap-1.5">
                      <Repeat2 size={14} />
                      Repost
                    </span>

                    <span className="inline-flex items-center gap-1.5">
                      <Share2 size={14} />
                      Share
                    </span>
                  </div>
                </div>
              </div>

              <div className="px-5 pb-3 sm:px-8">
                <PostInteractions
                  postId={post.id}
                  initialContent={post.content}
                  isOwner={
                    viewerId !== null &&
                    viewerId === post.author_id
                  }
                  commentsOpenByDefault
                  onPostUpdated={(
                    postId,
                    updatedContent,
                  ) => {
                    setPost((currentPost) =>
                      currentPost?.id === postId
                        ? {
                            ...currentPost,
                            content:
                              updatedContent,
                            updated_at:
                              new Date().toISOString(),
                          }
                        : currentPost,
                    );
                  }}
                  onPostDeleted={() => {
                    window.location.href =
                      "/home";
                  }}
                />
              </div>

              {post.updated_at !==
              post.created_at ? (
                <div className="px-5 pb-6 sm:px-8">
                  <p className="text-[11px] text-[var(--muted)]">
                    Edited
                  </p>
                </div>
              ) : null}
            </article>

            <section className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
                  Conversation
                </p>

                <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">
                  The conversation lives here.
                </h2>

                <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">
                  Read the replies, respond to the post, or continue an
                  existing thread.
                </p>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}