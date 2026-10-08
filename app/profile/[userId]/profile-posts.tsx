"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  Image as ImageIcon,
  Loader2,
  Repeat2,
  MessageCircle,
  FileText,
} from "lucide-react";

import AgoreAvatar from "@/components/agore-avatar";
import PostMedia, {
  type PostMediaItem,
} from "@/components/post-media";
import PostInteractions from "@/app/post-interactions";
import ProfileMedia from "./profile-media";
import { createClient } from "@/lib/supabase/browser";

type ProfileAuthor = {
  display_name: string;
  username: string;
  avatar_path: string | null;
};

type ProfilePost = {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  post_media: PostMediaItem[];
  profiles: ProfileAuthor | null;
};

type RepostPost = ProfilePost & {
  repost_id: string;
  reposted_at: string;
  reposted_by: string;
};

type MediaPost = {
  id: string;
  content: string;
  created_at: string;
  post_media: PostMediaItem[];
};

type ProfilePostsProps = {
  userId: string;
};

type PostsResponse = {
  posts?: ProfilePost[];
  error?: string;
};

type RepostsResponse = {
  reposts?: RepostPost[];
  error?: string;
};

type MediaResponse = {
  media?: MediaPost[];
  total?: number;
  error?: string;
};

type ProfileTab =
  | "posts"
  | "media"
  | "reposts";

const supabase = createClient();

function formatPostDate(value: string) {
  return new Intl.DateTimeFormat(
    "en-GB",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    },
  ).format(new Date(value));
}

function normalizeMediaPosts(
  media: MediaPost[] | undefined,
): MediaPost[] {
  if (!Array.isArray(media)) {
    return [];
  }

  return media.map((post) => ({
    ...post,
    post_media: Array.isArray(
      post.post_media,
    )
      ? post.post_media
      : [],
  }));
}

function PostCard({
  post,
  viewerId,
  onPostUpdated,
  onPostDeleted,
}: {
  post: ProfilePost;
  viewerId: string | null;
  onPostUpdated: (
    postId: string,
    updatedContent: string,
  ) => void;
  onPostDeleted: (
    postId: string,
  ) => void;
}) {
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
    <article className="rounded-[1.75rem] border border-[var(--border)] bg-[var(--surface)] px-5 py-5 transition hover:border-[var(--accent)]/30 sm:px-6">
      <div className="flex items-start gap-3">
        <Link
          href={`/profile/${encodeURIComponent(
            post.author_id,
          )}`}
          className="shrink-0"
        >
          <AgoreAvatar
            avatarPath={
              post.profiles?.avatar_path
            }
            name={displayName}
            className="h-10 w-10 transition hover:scale-[1.03]"
            textClassName="text-xs"
          />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link
                href={`/profile/${encodeURIComponent(
                  post.author_id,
                )}`}
                className="block truncate text-sm font-semibold transition hover:text-[var(--accent)]"
              >
                {displayName}
              </Link>

              <p className="truncate text-xs text-[var(--muted)]">
                @{username}
              </p>
            </div>

            <time
              dateTime={
                post.created_at
              }
              className="shrink-0 text-right text-[11px] text-[var(--muted)]"
            >
              {formatPostDate(
                post.created_at,
              )}
            </time>
          </div>

          <Link
            href={`/post/${encodeURIComponent(
              post.id,
            )}`}
            className="mt-4 block rounded-xl outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-soft)]"
          >
            <p className="whitespace-pre-wrap text-[15px] leading-7 text-[var(--foreground)] transition hover:text-[var(--accent)]">
              {post.content}
            </p>
          </Link>

          <PostMedia
            media={post.post_media}
          />

          <PostInteractions
            postId={post.id}
            initialContent={post.content}
            isOwner={isOwner}
            onPostUpdated={
              onPostUpdated
            }
            onPostDeleted={
              onPostDeleted
            }
          />

          {post.updated_at !==
          post.created_at ? (
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              Edited
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function RepostCard({
  repost,
  viewerId,
  profileId,
  onPostUpdated,
  onPostDeleted,
}: {
  repost: RepostPost;
  viewerId: string | null;
  profileId: string;
  onPostUpdated: (
    postId: string,
    updatedContent: string,
  ) => void;
  onPostDeleted: (
    postId: string,
  ) => void;
}) {
  const displayName =
    repost.profiles?.display_name ??
    "Agoré user";

  const username =
    repost.profiles?.username ??
    "unknown";

  return (
    <article className="rounded-[1.75rem] border border-[var(--border)] bg-[var(--surface)] px-5 py-5 transition hover:border-[var(--accent)]/30 sm:px-6">
      <div className="mb-4 flex items-center gap-2 text-xs text-[var(--muted)]">
        <Repeat2
          size={14}
          className="shrink-0 text-[var(--accent)]"
        />

        <span>Reposted by</span>

        <Link
          href={`/profile/${encodeURIComponent(
            profileId,
          )}`}
          className="font-semibold text-[var(--foreground)] transition hover:text-[var(--accent)]"
        >
          this profile
        </Link>

        <span aria-hidden="true">
          ·
        </span>

        <time
          dateTime={
            repost.reposted_at
          }
        >
          {formatPostDate(
            repost.reposted_at,
          )}
        </time>
      </div>

      <div className="flex items-start gap-3">
        <Link
          href={`/profile/${encodeURIComponent(
            repost.author_id,
          )}`}
          className="shrink-0"
        >
          <AgoreAvatar
            avatarPath={
              repost.profiles?.avatar_path
            }
            name={displayName}
            className="h-10 w-10 transition hover:scale-[1.03]"
            textClassName="text-xs"
          />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="min-w-0">
            <Link
              href={`/profile/${encodeURIComponent(
                repost.author_id,
              )}`}
              className="block truncate text-sm font-semibold transition hover:text-[var(--accent)]"
            >
              {displayName}
            </Link>

            <p className="truncate text-xs text-[var(--muted)]">
              @{username}
            </p>
          </div>

          <Link
            href={`/post/${encodeURIComponent(
              repost.id,
            )}`}
            className="mt-4 block rounded-xl outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-soft)]"
          >
            <p className="whitespace-pre-wrap text-[15px] leading-7 text-[var(--foreground)] transition hover:text-[var(--accent)]">
              {repost.content}
            </p>
          </Link>

          <PostMedia
            media={repost.post_media}
          />

          <PostInteractions
            postId={repost.id}
            initialContent={
              repost.content
            }
            isOwner={
              viewerId !== null &&
              viewerId ===
                repost.author_id
            }
            onPostUpdated={
              onPostUpdated
            }
            onPostDeleted={
              onPostDeleted
            }
          />
        </div>
      </div>
    </article>
  );
}

export default function ProfilePosts({
  userId,
}: ProfilePostsProps) {
  const [posts, setPosts] =
    useState<ProfilePost[]>(
      [],
    );

  const [reposts, setReposts] =
    useState<RepostPost[]>(
      [],
    );

  const [mediaPosts, setMediaPosts] =
    useState<MediaPost[]>([]);

  const [mediaCount, setMediaCount] =
    useState(0);

  const [viewerId, setViewerId] =
    useState<string | null>(
      null,
    );

  const [activeTab, setActiveTab] =
    useState<ProfileTab>(
      "posts",
    );

  const [loading, setLoading] =
    useState(true);

  const [
    repostsLoading,
    setRepostsLoading,
  ] = useState(false);

  const [
    mediaLoading,
    setMediaLoading,
  ] = useState(false);

  const [error, setError] =
    useState("");

  const [
    mediaError,
    setMediaError,
  ] = useState("");

  const repostsLoadedForUser =
    useRef<string | null>(null);

  const mediaLoadedForUser =
    useRef<string | null>(null);

  const currentUserIdRef =
    useRef(userId);

  useEffect(() => {
    currentUserIdRef.current =
      userId;

    repostsLoadedForUser.current =
      null;

    mediaLoadedForUser.current =
      null;

    setPosts([]);
    setReposts([]);
    setMediaPosts([]);
    setMediaCount(0);

    setError("");
    setMediaError("");

    setRepostsLoading(false);
    setMediaLoading(false);
  }, [userId]);

  const loadViewer =
    useCallback(async () => {
      const {
        data: { user },
      } =
        await supabase.auth.getUser();

      setViewerId(
        user?.id ?? null,
      );
    }, []);

  const loadPosts =
    useCallback(async () => {
      if (!userId) {
        return;
      }

      const requestUserId =
        userId;

      setLoading(true);
      setError("");

      try {
        const response =
          await fetch(
            `/api/users/${encodeURIComponent(
              requestUserId,
            )}/posts?limit=50`,
            {
              method: "GET",
              cache: "no-store",
            },
          );

        const data =
          (await response.json()) as PostsResponse;

        if (
          currentUserIdRef.current !==
          requestUserId
        ) {
          return;
        }

        if (!response.ok) {
          throw new Error(
            data.error ??
              "Unable to load posts.",
          );
        }

        setPosts(
          Array.isArray(
            data.posts,
          )
            ? data.posts.map(
                (post) => ({
                  ...post,
                  post_media:
                    Array.isArray(
                      post.post_media,
                    )
                      ? post.post_media
                      : [],
                }),
              )
            : [],
        );
      } catch (requestError) {
        if (
          currentUserIdRef.current !==
          requestUserId
        ) {
          return;
        }

        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load posts.",
        );

        setPosts([]);
      } finally {
        if (
          currentUserIdRef.current ===
          requestUserId
        ) {
          setLoading(false);
        }
      }
    }, [userId]);

  const loadReposts =
    useCallback(async () => {
      if (
        !userId ||
        repostsLoadedForUser.current ===
          userId
      ) {
        return;
      }

      const requestUserId =
        userId;

      setRepostsLoading(
        true,
      );
      setError("");

      try {
        const response =
          await fetch(
            `/api/users/${encodeURIComponent(
              requestUserId,
            )}/reposts?limit=50`,
            {
              method: "GET",
              cache: "no-store",
            },
          );

        const data =
          (await response.json()) as RepostsResponse;

        if (
          currentUserIdRef.current !==
          requestUserId
        ) {
          return;
        }

        if (!response.ok) {
          throw new Error(
            data.error ??
              "Unable to load reposts.",
          );
        }

        setReposts(
          Array.isArray(
            data.reposts,
          )
            ? data.reposts.map(
                (repost) => ({
                  ...repost,
                  post_media:
                    Array.isArray(
                      repost.post_media,
                    )
                      ? repost.post_media
                      : [],
                }),
              )
            : [],
        );

        repostsLoadedForUser.current =
          requestUserId;
      } catch (requestError) {
        if (
          currentUserIdRef.current !==
          requestUserId
        ) {
          return;
        }

        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load reposts.",
        );

        setReposts([]);
      } finally {
        if (
          currentUserIdRef.current ===
          requestUserId
        ) {
          setRepostsLoading(
            false,
          );
        }
      }
    }, [userId]);

  const loadMedia =
    useCallback(async () => {
      if (
        !userId ||
        mediaLoadedForUser.current ===
          userId
      ) {
        return;
      }

      const requestUserId =
        userId;

      setMediaLoading(
        true,
      );
      setMediaError("");

      try {
        const response =
          await fetch(
            `/api/users/${encodeURIComponent(
              requestUserId,
            )}/media?limit=100`,
            {
              method: "GET",
              cache: "no-store",
            },
          );

        const data =
          (await response.json()) as MediaResponse;

        if (
          currentUserIdRef.current !==
          requestUserId
        ) {
          return;
        }

        if (!response.ok) {
          throw new Error(
            data.error ??
              "Unable to load profile media.",
          );
        }

        const normalizedMedia =
          normalizeMediaPosts(
            data.media,
          );

        setMediaPosts(
          normalizedMedia,
        );

        setMediaCount(
          typeof data.total ===
            "number"
            ? data.total
            : normalizedMedia.reduce(
                (total, post) =>
                  total +
                  post.post_media
                    .length,
                0,
              ),
        );

        mediaLoadedForUser.current =
          requestUserId;
      } catch (requestError) {
        if (
          currentUserIdRef.current !==
          requestUserId
        ) {
          return;
        }

        setMediaError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load profile media.",
        );

        setMediaPosts([]);
        setMediaCount(0);
      } finally {
        if (
          currentUserIdRef.current ===
          requestUserId
        ) {
          setMediaLoading(
            false,
          );
        }
      }
    }, [userId]);

  useEffect(() => {
    void loadViewer();
    void loadPosts();
  }, [
    loadPosts,
    loadViewer,
  ]);

  useEffect(() => {
    if (
      activeTab ===
      "reposts"
    ) {
      void loadReposts();
    }

    if (
      activeTab ===
      "media"
    ) {
      void loadMedia();
    }
  }, [
    activeTab,
    loadMedia,
    loadReposts,
  ]);

  function handlePostUpdated(
    postId: string,
    updatedContent: string,
  ) {
    const updatedAt =
      new Date().toISOString();

    setPosts(
      (currentPosts) =>
        currentPosts.map(
          (post) =>
            post.id === postId
              ? {
                  ...post,
                  content:
                    updatedContent,
                  updated_at:
                    updatedAt,
                }
              : post,
        ),
    );

    setReposts(
      (currentReposts) =>
        currentReposts.map(
          (post) =>
            post.id === postId
              ? {
                  ...post,
                  content:
                    updatedContent,
                  updated_at:
                    updatedAt,
                }
              : post,
        ),
    );

    setMediaPosts(
      (currentMediaPosts) =>
        currentMediaPosts.map(
          (post) =>
            post.id === postId
              ? {
                  ...post,
                  content:
                    updatedContent,
                }
              : post,
        ),
    );
  }

  function handlePostDeleted(
    postId: string,
  ) {
    setPosts(
      (currentPosts) =>
        currentPosts.filter(
          (post) =>
            post.id !== postId,
        ),
    );

    setReposts(
      (currentReposts) =>
        currentReposts.filter(
          (post) =>
            post.id !== postId,
        ),
    );

    setMediaPosts(
      (currentMediaPosts) =>
        currentMediaPosts.filter(
          (post) =>
            post.id !== postId,
        ),
    );

    mediaLoadedForUser.current =
      null;

    setMediaError("");
  }

  function selectTab(
    tab: ProfileTab,
  ) {
    setError("");
    setMediaError("");
    setActiveTab(tab);
  }

  if (loading) {
    return (
      <section className="mt-7">
        <div className="mb-4 h-5 w-32 animate-pulse rounded-full bg-[var(--surface-muted)]" />

        <div className="overflow-hidden rounded-[1.75rem] border border-[var(--border)] bg-[var(--surface)]">
          <div className="grid grid-cols-3 border-b border-[var(--border)]">
            {[0, 1, 2].map(
              (item) => (
                <div
                  key={item}
                  className="h-12 animate-pulse bg-[var(--surface-muted)]"
                />
              ),
            )}
          </div>

          <div className="space-y-4 p-5">
            <div className="h-24 animate-pulse rounded-2xl bg-[var(--surface-muted)]" />
            <div className="h-24 animate-pulse rounded-2xl bg-[var(--surface-muted)]" />
          </div>
        </div>
      </section>
    );
  }

  if (
    error &&
    posts.length === 0
  ) {
    return (
      <section className="mt-7 rounded-[1.75rem] border border-[var(--border)] bg-[var(--surface)] p-6">
        <p className="text-sm font-medium text-[var(--danger)]">
          {error}
        </p>

        <button
          type="button"
          onClick={() => {
            mediaLoadedForUser.current =
              null;

            repostsLoadedForUser.current =
              null;

            void loadPosts();

            setError("");
            setMediaError("");
          }}
          className="mt-4 rounded-full bg-[var(--foreground)] px-4 py-2 text-sm font-semibold text-[var(--background)] transition hover:bg-[var(--accent)] hover:text-white"
        >
          Retry
        </button>
      </section>
    );
  }

  return (
    <section className="mt-7">
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />

          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
            Profile activity
          </p>
        </div>

        <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">
          Activity
        </h2>

        <p className="mt-1 text-sm text-[var(--muted)]">
          Posts, media, and reposts from this profile.
        </p>
      </div>

      <div className="overflow-hidden rounded-[1.75rem] border border-[var(--border)] bg-[var(--surface)]">
        <div
          role="tablist"
          aria-label="Profile activity"
          className="grid grid-cols-3 border-b border-[var(--border)]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={
              activeTab ===
              "posts"
            }
            onClick={() =>
              selectTab("posts")
            }
            className={[
              "relative flex items-center justify-center gap-2 px-3 py-4 text-sm font-semibold transition",
              activeTab === "posts"
                ? "text-[var(--foreground)]"
                : "text-[var(--muted)] hover:text-[var(--foreground)]",
            ].join(" ")}
          >
            <FileText size={15} />

            Posts

            {posts.length > 0 ? (
              <span className="rounded-full bg-[var(--background)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">
                {posts.length}
              </span>
            ) : null}

            {activeTab ===
            "posts" ? (
              <span className="absolute inset-x-5 bottom-0 h-0.5 rounded-full bg-[var(--accent)]" />
            ) : null}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={
              activeTab ===
              "media"
            }
            onClick={() =>
              selectTab("media")
            }
            className={[
              "relative flex items-center justify-center gap-2 px-3 py-4 text-sm font-semibold transition",
              activeTab === "media"
                ? "text-[var(--foreground)]"
                : "text-[var(--muted)] hover:text-[var(--foreground)]",
            ].join(" ")}
          >
            <ImageIcon size={15} />

            Media

            {mediaCount > 0 ? (
              <span className="rounded-full bg-[var(--background)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">
                {mediaCount}
              </span>
            ) : null}

            {activeTab ===
            "media" ? (
              <span className="absolute inset-x-5 bottom-0 h-0.5 rounded-full bg-[var(--accent)]" />
            ) : null}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={
              activeTab ===
              "reposts"
            }
            onClick={() =>
              selectTab(
                "reposts",
              )
            }
            className={[
              "relative flex items-center justify-center gap-2 px-3 py-4 text-sm font-semibold transition",
              activeTab ===
              "reposts"
                ? "text-[var(--foreground)]"
                : "text-[var(--muted)] hover:text-[var(--foreground)]",
            ].join(" ")}
          >
            <Repeat2 size={15} />

            Reposts

            {reposts.length > 0 ? (
              <span className="rounded-full bg-[var(--background)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">
                {reposts.length}
              </span>
            ) : null}

            {activeTab ===
            "reposts" ? (
              <span className="absolute inset-x-5 bottom-0 h-0.5 rounded-full bg-[var(--accent)]" />
            ) : null}
          </button>
        </div>

        {activeTab ===
          "reposts" &&
        repostsLoading ? (
          <div className="flex min-h-52 items-center justify-center px-6">
            <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
              <Loader2
                size={17}
                className="animate-spin"
              />
              Loading reposts…
            </div>
          </div>
        ) : activeTab ===
          "media" &&
          mediaLoading ? (
          <div className="flex min-h-60 items-center justify-center px-6">
            <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
              <Loader2
                size={17}
                className="animate-spin"
              />
              Loading media…
            </div>
          </div>
        ) : activeTab ===
          "media" &&
          mediaError ? (
          <div className="px-6 py-12 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--danger-soft)] text-[var(--danger)]">
              <ImageIcon size={20} />
            </span>

            <p className="mt-4 text-sm font-medium text-[var(--foreground)]">
              Unable to load media.
            </p>

            <p className="mt-1 text-sm text-[var(--muted)]">
              {mediaError}
            </p>

            <button
              type="button"
              onClick={() => {
                mediaLoadedForUser.current =
                  null;

                setMediaError("");

                void loadMedia();
              }}
              className="mt-5 rounded-full bg-[var(--foreground)] px-4 py-2 text-sm font-semibold text-[var(--background)] transition hover:bg-[var(--accent)] hover:text-white"
            >
              Retry
            </button>
          </div>
        ) : activeTab ===
          "media" ? (
          <ProfileMedia
            key={userId}
            posts={mediaPosts}
          />
        ) : activeTab ===
          "posts" &&
          posts.length ===
            0 ? (
          <div className="px-6 py-12 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <MessageCircle
                size={20}
              />
            </span>

            <p className="mt-4 text-sm font-medium text-[var(--foreground)]">
              No posts yet.
            </p>

            <p className="mt-1 text-sm text-[var(--muted)]">
              Conversation starts here.
            </p>
          </div>
        ) : activeTab ===
            "reposts" &&
          reposts.length ===
            0 ? (
          <div className="px-6 py-12 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <Repeat2
                size={20}
              />
            </span>

            <p className="mt-4 text-sm font-medium text-[var(--foreground)]">
              No reposts yet.
            </p>

            <p className="mt-1 text-sm text-[var(--muted)]">
              Reposts from this profile will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-4 p-4 sm:p-5">
            {activeTab ===
            "posts"
              ? posts.map(
                  (post) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      viewerId={
                        viewerId
                      }
                      onPostUpdated={
                        handlePostUpdated
                      }
                      onPostDeleted={
                        handlePostDeleted
                      }
                    />
                  ),
                )
              : reposts.map(
                  (repost) => (
                    <RepostCard
                      key={
                        repost.repost_id
                      }
                      repost={
                        repost
                      }
                      viewerId={
                        viewerId
                      }
                      profileId={
                        userId
                      }
                      onPostUpdated={
                        handlePostUpdated
                      }
                      onPostDeleted={
                        handlePostDeleted
                      }
                    />
                  ),
                )}
          </div>
        )}

        {error ? (
          <div className="border-t border-[var(--border)] px-5 py-4 sm:px-6">
            <p className="text-sm font-medium text-[var(--danger)]">
              {error}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}