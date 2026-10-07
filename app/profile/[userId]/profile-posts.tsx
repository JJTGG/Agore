"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import AgoreAvatar from "@/components/agore-avatar";
import PostMedia, {
  type PostMediaItem,
} from "@/components/post-media";
import PostInteractions from "@/app/post-interactions";
import { createClient } from "@/lib/supabase/browser";

type ProfilePost = {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  post_media: PostMediaItem[];
  profiles: {
    display_name: string;
    username: string;
    avatar_path: string | null;
  } | null;
};

type ProfilePostsProps = {
  userId: string;
};

type PostsResponse = {
  posts?: ProfilePost[];
  error?: string;
};

const supabase = createClient();

function formatPostDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function ProfilePosts({
  userId,
}: ProfilePostsProps) {
  const [posts, setPosts] = useState<ProfilePost[]>([]);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadViewer = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    setViewerId(user?.id ?? null);
  }, []);

  const loadPosts = useCallback(async () => {
    if (!userId) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/users/${encodeURIComponent(userId)}/posts`,
        {
          method: "GET",
          cache: "no-store",
        },
      );

      const data = (await response.json()) as PostsResponse;

      if (!response.ok) {
        throw new Error(
          data.error ?? "Unable to load posts.",
        );
      }

      setPosts(
        Array.isArray(data.posts)
          ? data.posts.map((post) => ({
              ...post,
              post_media: Array.isArray(post.post_media)
                ? post.post_media
                : [],
            }))
          : [],
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load posts.",
      );
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadViewer();
    void loadPosts();
  }, [loadPosts, loadViewer]);

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
              updated_at: new Date().toISOString(),
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

  if (loading) {
    return (
      <section className="mt-6 rounded-[1.75rem] border border-[var(--border)] bg-[var(--surface)] p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-5 w-24 rounded-full bg-[var(--surface-muted)]" />

          <div className="h-20 w-full rounded-2xl bg-[var(--surface-muted)]" />

          <div className="h-20 w-full rounded-2xl bg-[var(--surface-muted)]" />
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="mt-6 rounded-[1.75rem] border border-[var(--border)] bg-[var(--surface)] p-6">
        <p className="text-sm font-medium text-[var(--danger)]">
          {error}
        </p>

        <button
          type="button"
          onClick={() => void loadPosts()}
          className="mt-4 rounded-full bg-[var(--foreground)] px-4 py-2 text-sm font-semibold text-[var(--background)] transition hover:bg-[var(--accent)] hover:text-white"
        >
          Retry
        </button>
      </section>
    );
  }

  return (
    <section className="mt-6">
      <div className="mb-4 px-1">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />

          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
            Profile activity
          </p>
        </div>

        <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">
          Posts
        </h2>

        <p className="mt-1 text-sm text-[var(--muted)]">
          Recent posts from this profile.
        </p>
      </div>

      {posts.length === 0 ? (
        <div className="rounded-[1.75rem] border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-10 text-center">
          <p className="text-sm font-medium text-[var(--foreground)]">
            No posts yet.
          </p>

          <p className="mt-1 text-sm text-[var(--muted)]">
            Conversation starts here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => {
            const isOwner =
              viewerId !== null &&
              viewerId === post.author_id;

            const displayName =
              post.profiles?.display_name ??
              "Agoré user";

            const username =
              post.profiles?.username ??
              "unknown";

            return (
              <article
                key={post.id}
                className="rounded-[1.75rem] border border-[var(--border)] bg-[var(--surface)] px-5 py-5 sm:px-6"
              >
                <div className="flex items-start gap-3">
                  <AgoreAvatar
                    avatarPath={
                      post.profiles?.avatar_path
                    }
                    name={displayName}
                    className="h-10 w-10"
                    textClassName="text-xs"
                  />

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {displayName}
                    </p>

                    <p className="truncate text-xs text-[var(--muted)]">
                      @{username} ·{" "}
                      {formatPostDate(post.created_at)}
                    </p>
                  </div>
                </div>

                <p className="mt-4 whitespace-pre-wrap text-[15px] leading-7 text-[var(--foreground)]">
                  {post.content}
                </p>

                <PostMedia
                  media={post.post_media}
                />

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

                {post.updated_at !== post.created_at ? (
                  <p className="mt-1 text-[11px] text-[var(--muted)]">
                    Edited
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}