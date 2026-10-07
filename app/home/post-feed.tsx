"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useState,
} from "react";
import Link from "next/link";
import {
  Image,
  MoreHorizontal,
  PenLine,
  RefreshCw,
  Sparkles,
} from "lucide-react";

import { createClient } from "@/lib/supabase/browser";
import PostInteractions from "@/app/post-interactions";

type Profile = {
  display_name: string;
  username: string;
  avatar_path?: string | null;
};

type Post = {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  profiles: Profile | null;
};

type PostsResponse = {
  posts: Post[];
};

type ErrorResponse = {
  error?: string;
};

const supabase = createClient();

function formatPostDate(value: string) {
  const date = new Date(value);

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getInitials(
  displayName: string | null | undefined,
) {
  const initials =
    displayName
      ?.split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(
        (part: string) =>
          part[0]?.toUpperCase() ?? "",
      )
      .join("") ?? "";

  return initials || "A";
}

export default function PostFeed() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [content, setContent] = useState("");
  const [viewerId, setViewerId] = useState<string | null>(
    null,
  );
  const [viewerName, setViewerName] = useState("");
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");

  const loadViewer = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    setViewerId(user?.id ?? null);

    if (!user) {
      setViewerName("");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();

    setViewerName(profile?.display_name ?? "");
  }, []);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        "/api/posts?limit=20",
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
        "posts" in data ? data.posts : [],
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
  }, []);

  useEffect(() => {
    void loadViewer();
    void loadPosts();
  }, [loadPosts, loadViewer]);

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

    try {
      const response = await fetch(
        "/api/posts",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: trimmedContent,
          }),
        },
      );

      const data = (await response.json()) as
        | { post: Post }
        | ErrorResponse;

      if (!response.ok) {
        throw new Error(
          "error" in data && data.error
            ? data.error
            : "Unable to publish your post.",
        );
      }

      if (!("post" in data)) {
        throw new Error(
          "The post response was invalid.",
        );
      }

      setPosts((currentPosts) => [
        data.post,
        ...currentPosts,
      ]);

      setContent("");
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

  function handlePostDeleted(
    postId: string,
  ) {
    setPosts((currentPosts) =>
      currentPosts.filter(
        (post) => post.id !== postId,
      ),
    );
  }

  const viewerInitials = getInitials(
    viewerName,
  );

  return (
    <div className="space-y-7">
      <section className="relative overflow-hidden rounded-[1.9rem] border border-[var(--border)] bg-[var(--surface)]">
        <div className="absolute inset-y-0 left-0 w-1 bg-[var(--accent)]" />

        <div className="px-5 py-5 sm:px-7 sm:py-6">
          <div className="flex items-start justify-between gap-5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
                Your turn
              </p>

              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
                What’s worth saying?
              </h2>

              <p className="mt-2 max-w-lg text-sm leading-6 text-[var(--muted)]">
                Drop a thought, question, observation, or
                something you want people to see.
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
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-xs font-bold text-[var(--accent)]">
                {viewerInitials}
              </span>

              <div className="min-w-0 flex-1">
                <textarea
                  value={content}
                  onChange={(event) =>
                    setContent(event.target.value)
                  }
                  maxLength={2000}
                  rows={4}
                  placeholder={
                    viewerName
                      ? `Say something, ${
                          viewerName.split(" ")[0]
                        }…`
                      : "Say something…"
                  }
                  className="w-full resize-none rounded-[1.35rem] border border-[var(--border)] bg-[var(--background)] px-4 py-4 text-[15px] leading-7 outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
                />

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--background)] px-3 py-1.5 text-xs font-medium text-[var(--muted)]">
                      <PenLine size={13} />
                      Thought
                    </span>

                    <span className="hidden items-center gap-1.5 rounded-full bg-[var(--background)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] sm:inline-flex">
                      <Image size={13} />
                      Media coming soon
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs tabular-nums text-[var(--muted)]">
                      {content.length}/2000
                    </span>

                    <button
                      type="submit"
                      disabled={
                        !content.trim() ||
                        publishing
                      }
                      className="rounded-full bg-[var(--foreground)] px-5 py-2.5 text-sm font-semibold text-[var(--background)] transition hover:bg-[var(--accent)] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {publishing
                        ? "Sending…"
                        : "Put it out there"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </form>
        </div>
      </section>

      {error ? (
        <section className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm">
          <p>{error}</p>

          <button
            type="button"
            onClick={() => void loadPosts()}
            className="shrink-0 font-semibold text-[var(--accent)]"
          >
            Retry
          </button>
        </section>
      ) : null}

      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />

              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--accent)]">
                Community
              </p>
            </div>

            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] sm:text-[1.75rem]">
              Latest from Agoré
            </h2>
          </div>

          <button
            type="button"
            onClick={() => void loadPosts()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2 text-sm font-medium text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw
              size={15}
              className={
                loading ? "animate-spin" : ""
              }
            />

            <span className="hidden sm:inline">
              Refresh
            </span>
          </button>
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
                There are no visible posts in your feed yet.
                Put the first thought out there and give
                Agoré somewhere to begin.
              </p>

              <button
                type="button"
                onClick={() => {
                  const composer =
                    document.querySelector(
                      "textarea",
                    ) as HTMLTextAreaElement | null;

                  composer?.focus();
                }}
                className="mt-6 rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Start the conversation
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => {
              const isOwner =
                viewerId !== null &&
                viewerId === post.author_id;

              const authorName =
                post.profiles?.display_name ??
                "Agoré user";

              const authorUsername =
                post.profiles?.username ??
                "unknown";

              return (
                <article
                  key={post.id}
                  className="group overflow-hidden rounded-[1.75rem] border border-[var(--border)] bg-[var(--surface)] transition hover:border-[var(--accent)]/30"
                >
                  <div className="px-5 pt-5 sm:px-6 sm:pt-6">
                    <header className="flex items-start justify-between gap-4">
                      <Link
                        href={`/profile/${encodeURIComponent(
                          post.author_id,
                        )}`}
                        className="flex min-w-0 items-center gap-3"
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-sm font-bold text-[var(--accent)] transition group-hover:scale-[1.02]">
                          {getInitials(
                            authorName,
                          )}
                        </span>

                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">
                            {authorName}
                          </span>

                          <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">
                            @{authorUsername}
                          </span>
                        </span>
                      </Link>

                      <div className="flex shrink-0 items-center gap-2">
                        <time
                          dateTime={post.created_at}
                          className="text-right text-xs text-[var(--muted)]"
                        >
                          {formatPostDate(
                            post.created_at,
                          )}
                        </time>

                        <button
                          type="button"
                          aria-label="Post options"
                          className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--background)] hover:text-[var(--foreground)]"
                        >
                          <MoreHorizontal
                            size={17}
                          />
                        </button>
                      </div>
                    </header>

                    <div className="mt-5">
                      <p className="whitespace-pre-wrap text-[15px] leading-7 text-[var(--foreground)] sm:text-base sm:leading-7">
                        {post.content}
                      </p>
                    </div>
                  </div>

                  <div className="px-5 pb-2 sm:px-6">
                    <PostInteractions
                      postId={post.id}
                      initialContent={post.content}
                      isOwner={isOwner}
                      onPostUpdated={
                        handlePostUpdated
                      }
                      onPostDeleted={
                        handlePostDeleted
                      }
                    />
                  </div>

                  {post.updated_at !==
                  post.created_at ? (
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
    </div>
  );
}