"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Profile = {
  display_name: string;
  username: string;
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

function formatPostDate(value: string) {
  const date = new Date(value);

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function PostFeed() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");

  const loadPosts = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/posts?limit=20", {
        method: "GET",
        cache: "no-store",
      });

      const data = (await response.json()) as PostsResponse | ErrorResponse;

      if (!response.ok) {
        throw new Error(
          "error" in data && data.error
            ? data.error
            : "Unable to load posts.",
        );
      }

      setPosts("posts" in data ? data.posts : []);
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
    void loadPosts();
  }, [loadPosts]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedContent = content.trim();

    if (!trimmedContent || publishing) {
      return;
    }

    setPublishing(true);
    setError("");

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
        throw new Error("The post response was invalid.");
      }

      setPosts((currentPosts) => [data.post, ...currentPosts]);
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

  return (
    <div className="space-y-6">
      <section className="border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
              Create
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.025em]">
              Share something with Agoré.
            </h2>
          </div>

          <span className="text-sm tabular-nums text-[var(--muted)]">
            {content.length}/2000
          </span>
        </div>

        <form className="mt-5" onSubmit={handleSubmit}>
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            maxLength={2000}
            rows={5}
            placeholder="What’s on your mind?"
            className="w-full resize-none border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm leading-6 outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
          />

          <div className="mt-4 flex items-center justify-between gap-4">
            <p className="text-sm text-[var(--muted)]">
              Text posts are live first. Media comes next.
            </p>

            <button
              type="submit"
              disabled={!content.trim() || publishing}
              className="rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {publishing ? "Publishing…" : "Publish"}
            </button>
          </div>
        </form>
      </section>

      {error ? (
        <section className="border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--foreground)]">
          <div className="flex items-center justify-between gap-4">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => void loadPosts()}
              className="font-semibold text-[var(--accent)]"
            >
              Retry
            </button>
          </div>
        </section>
      ) : null}

      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
              Feed
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">
              Latest posts
            </h2>
          </div>

          <button
            type="button"
            onClick={() => void loadPosts()}
            disabled={loading}
            className="text-sm font-medium text-[var(--muted)] transition hover:text-[var(--foreground)] disabled:opacity-50"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="border border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-[var(--muted)]">
            Loading your feed…
          </div>
        ) : posts.length === 0 ? (
          <div className="border border-[var(--border)] bg-[var(--surface)] p-6">
            <p className="font-medium">Your feed is empty.</p>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Publish the first post and start the conversation.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <article
                key={post.id}
                className="border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6"
              >
                <header className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {post.profiles?.display_name ?? "Agoré user"}
                    </p>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      @{post.profiles?.username ?? "unknown"}
                    </p>
                  </div>

                  <time
                    dateTime={post.created_at}
                    className="shrink-0 text-right text-xs text-[var(--muted)]"
                  >
                    {formatPostDate(post.created_at)}
                  </time>
                </header>

                <p className="mt-5 whitespace-pre-wrap text-sm leading-7">
                  {post.content}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}