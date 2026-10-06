"use client";

import { useCallback, useEffect, useState } from "react";

type ProfilePost = {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  profiles: {
    display_name: string;
    username: string;
    avatar_path: string | null;
  } | null;
};

type ProfilePostsProps = {
  userId: string;
};

function formatPostDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function ProfilePosts({ userId }: ProfilePostsProps) {
  const [posts, setPosts] = useState<ProfilePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadPosts = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/users/${encodeURIComponent(userId)}/posts`,
        {
          cache: "no-store",
        },
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Unable to load posts.");
        setPosts([]);
        return;
      }

      setPosts(Array.isArray(data.posts) ? data.posts : []);
    } catch {
      setError("Unable to load posts.");
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  if (loading) {
    return (
      <section className="mt-6 rounded-3xl border border-[#deddd7] bg-white p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-5 w-24 rounded bg-[#e8e7e1]" />
          <div className="h-20 w-full rounded-2xl bg-[#e8e7e1]" />
          <div className="h-20 w-full rounded-2xl bg-[#e8e7e1]" />
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="mt-6 rounded-3xl border border-[#deddd7] bg-white p-6">
        <p className="text-sm font-medium text-[#8d2f2f]">{error}</p>

        <button
          type="button"
          onClick={() => void loadPosts()}
          className="mt-4 rounded-full bg-[#2148b8] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#183991]"
        >
          Retry
        </button>
      </section>
    );
  }

  return (
    <section className="mt-6">
      <div className="mb-3 px-1">
        <h2 className="text-lg font-semibold tracking-[-0.02em]">Posts</h2>
        <p className="mt-1 text-sm text-[#777b81]">
          Recent posts from this profile.
        </p>
      </div>

      {posts.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-[#d8d7d0] bg-white px-6 py-10 text-center">
          <p className="text-sm font-medium text-[#555a60]">
            No posts yet.
          </p>
          <p className="mt-1 text-sm text-[#85898f]">
            Conversation starts here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <article
              key={post.id}
              className="rounded-3xl border border-[#deddd7] bg-white px-5 py-5 sm:px-6"
            >
              <div className="flex items-center gap-3">
                <div
                  aria-hidden="true"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e5ebff] text-sm font-bold text-[#2148b8]"
                >
                  {post.profiles?.display_name?.charAt(0).toUpperCase() ??
                    "A"}
                </div>

                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {post.profiles?.display_name ?? "Agoré user"}
                  </p>
                  <p className="truncate text-xs text-[#7d8187]">
                    @{post.profiles?.username ?? "unknown"} ·{" "}
                    {formatPostDate(post.created_at)}
                  </p>
                </div>
              </div>

              <p className="mt-4 whitespace-pre-wrap text-[15px] leading-6 text-[#292d33]">
                {post.content}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}