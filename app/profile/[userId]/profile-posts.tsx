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
  Clock3,
} from "lucide-react";

import AgoreAvatar from "@/components/agore-avatar";
import PostMedia, {
  type PostMediaItem,
} from "@/components/post-media";
import PostInteractions from "@/app/post-interactions";
import ProfileMedia from "./profile-media";
import ActivityTimeline from "./activity-timeline";
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
  onOwnPostDeleted?: () => void;
};

type PostsResponse = {
  posts?: ProfilePost[];
  error?: string;
  total?: number;
  limit?: number;
  offset?: number;
  has_more?: boolean;
};

type RepostsResponse = {
  reposts?: RepostPost[];
  error?: string;
};

type MediaResponse = {
  media?: MediaPost[];
  error?: string;
};

type ProfileTab =
  | "posts"
  | "media"
  | "reposts"
  | "activity";

const PROFILE_POSTS_PAGE_SIZE = 50;
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

function normalizeMediaPosts(
  media: MediaPost[] | undefined,
): MediaPost[] {
  if (!Array.isArray(media)) {
    return [];
  }

  return media.map((post) => ({
    ...post,
    post_media: Array.isArray(post.post_media)
      ? post.post_media
      : [],
  }));
}

function normalizeProfilePosts(
  posts: ProfilePost[] | undefined,
): ProfilePost[] {
  if (!Array.isArray(posts)) {
    return [];
  }

  return posts.map((post) => ({
    ...post,
    post_media: Array.isArray(post.post_media)
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
  onPostDeleted: (postId: string) => void;
}) {
  const isOwner =
    viewerId !== null &&
    viewerId === post.author_id;

  const displayName =
    post.profiles?.display_name ?? "Agoré user";

  const username =
    post.profiles?.username ?? "unknown";

  return (
    <article className="px-4 py-5 transition sm:px-6 sm:py-6">
      <div className="flex items-start gap-3">
        <Link
          href={`/profile/${encodeURIComponent(post.author_id)}`}
          className="shrink-0"
        >
          <AgoreAvatar
            avatarPath={post.profiles?.avatar_path}
            name={displayName}
            className="h-10 w-10 transition hover:scale-[1.03]"
            textClassName="text-xs"
          />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link
                href={`/profile/${encodeURIComponent(post.author_id)}`}
                className="block truncate text-sm font-semibold transition hover:text-[var(--accent)]"
              >
                {displayName}
              </Link>

              <p className="truncate text-xs text-[var(--muted)]">
                @{username}
              </p>
            </div>

            <time
              dateTime={post.created_at}
              className="shrink-0 text-right text-[11px] text-[var(--muted)]"
            >
              {formatPostDate(post.created_at)}
            </time>
          </div>

          <Link
            href={`/post/${encodeURIComponent(post.id)}`}
            className="mt-4 block rounded-xl outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-soft)]"
          >
            <p className="whitespace-pre-wrap text-[15px] leading-7 text-[var(--foreground)] transition hover:text-[var(--accent)]">
              {post.content}
            </p>
          </Link>

          <PostMedia media={post.post_media} />

          <PostInteractions
            postId={post.id}
            initialContent={post.content}
            isOwner={isOwner}
            onPostUpdated={onPostUpdated}
            onPostDeleted={onPostDeleted}
          />

          {post.updated_at !== post.created_at ? (
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
  onPostDeleted: (postId: string) => void;
}) {
  const displayName =
    repost.profiles?.display_name ?? "Agoré user";

  const username =
    repost.profiles?.username ?? "unknown";

  return (
    <article className="px-4 py-5 transition sm:px-6 sm:py-6">
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
        <Repeat2
          size={14}
          className="shrink-0 text-[var(--accent)]"
        />

        <span>Reposted by</span>

        <Link
          href={`/profile/${encodeURIComponent(profileId)}`}
          className="font-semibold text-[var(--foreground)] transition hover:text-[var(--accent)]"
        >
          this profile
        </Link>

        <span aria-hidden="true">·</span>

        <time dateTime={repost.reposted_at}>
          {formatPostDate(repost.reposted_at)}
        </time>
      </div>

      <div className="flex items-start gap-3">
        <Link
          href={`/profile/${encodeURIComponent(repost.author_id)}`}
          className="shrink-0"
        >
          <AgoreAvatar
            avatarPath={repost.profiles?.avatar_path}
            name={displayName}
            className="h-10 w-10 transition hover:scale-[1.03]"
            textClassName="text-xs"
          />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="min-w-0">
            <Link
              href={`/profile/${encodeURIComponent(repost.author_id)}`}
              className="block truncate text-sm font-semibold transition hover:text-[var(--accent)]"
            >
              {displayName}
            </Link>

            <p className="truncate text-xs text-[var(--muted)]">
              @{username}
            </p>
          </div>

          <Link
            href={`/post/${encodeURIComponent(repost.id)}`}
            className="mt-4 block rounded-xl outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-soft)]"
          >
            <p className="whitespace-pre-wrap text-[15px] leading-7 text-[var(--foreground)] transition hover:text-[var(--accent)]">
              {repost.content}
            </p>
          </Link>

          <PostMedia media={repost.post_media} />

          <PostInteractions
            postId={repost.id}
            initialContent={repost.content}
            isOwner={
              viewerId !== null &&
              viewerId === repost.author_id
            }
            onPostUpdated={onPostUpdated}
            onPostDeleted={onPostDeleted}
          />
        </div>
      </div>
    </article>
  );
}

export default function ProfilePosts({
  userId,
  onOwnPostDeleted,
}: ProfilePostsProps) {
  const [posts, setPosts] = useState<ProfilePost[]>([]);
  const [reposts, setReposts] = useState<RepostPost[]>([]);
  const [mediaPosts, setMediaPosts] = useState<MediaPost[]>([]);
  const [viewerId, setViewerId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<ProfileTab>("posts");
  const [loading, setLoading] = useState(true);
  const [repostsLoading, setRepostsLoading] = useState(false);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [morePostsLoading, setMorePostsLoading] = useState(false);

  const [postsHasMore, setPostsHasMore] = useState(false);
  const [postsNextOffset, setPostsNextOffset] = useState(0);

  const [error, setError] = useState("");
  const [mediaError, setMediaError] = useState("");
  const [morePostsError, setMorePostsError] = useState("");

  const repostsLoadedForUser = useRef<string | null>(null);
  const mediaLoadedForUser = useRef<string | null>(null);
  const currentUserIdRef = useRef(userId);

  useEffect(() => {
    currentUserIdRef.current = userId;

    repostsLoadedForUser.current = null;
    mediaLoadedForUser.current = null;

    setPosts([]);
    setReposts([]);
    setMediaPosts([]);
    setError("");
    setMediaError("");
    setMorePostsError("");
    setPostsHasMore(false);
    setPostsNextOffset(0);
    setRepostsLoading(false);
    setMediaLoading(false);
    setMorePostsLoading(false);
  }, [userId]);

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

    const requestUserId = userId;

    setLoading(true);
    setError("");
    setMorePostsError("");
    setPostsHasMore(false);
    setPostsNextOffset(0);

    try {
      const response = await fetch(
        `/api/users/${encodeURIComponent(requestUserId)}/posts?limit=${PROFILE_POSTS_PAGE_SIZE}&offset=0`,
        {
          method: "GET",
          cache: "no-store",
        },
      );

      const data = (await response.json()) as PostsResponse;

      if (currentUserIdRef.current !== requestUserId) {
        return;
      }

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to load posts.");
      }

      const normalizedPosts = normalizeProfilePosts(data.posts);

      setPosts(normalizedPosts);
      setPostsNextOffset(
        (data.offset ?? 0) + normalizedPosts.length,
      );
      setPostsHasMore(
        data.has_more ??
          (normalizedPosts.length >= PROFILE_POSTS_PAGE_SIZE),
      );
    } catch (requestError) {
      if (currentUserIdRef.current !== requestUserId) {
        return;
      }

      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load posts.",
      );
      setPosts([]);
      setPostsHasMore(false);
      setPostsNextOffset(0);
    } finally {
      if (currentUserIdRef.current === requestUserId) {
        setLoading(false);
      }
    }
  }, [userId]);

  const loadMorePosts = useCallback(async () => {
    if (
      !userId ||
      !postsHasMore ||
      morePostsLoading
    ) {
      return;
    }

    const requestUserId = userId;
    const requestOffset = postsNextOffset;

    setMorePostsLoading(true);
    setMorePostsError("");

    try {
      const response = await fetch(
        `/api/users/${encodeURIComponent(requestUserId)}/posts?limit=${PROFILE_POSTS_PAGE_SIZE}&offset=${requestOffset}`,
        {
          method: "GET",
          cache: "no-store",
        },
      );

      const data = (await response.json()) as PostsResponse;

      if (currentUserIdRef.current !== requestUserId) {
        return;
      }

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to load more posts.");
      }

      const nextPosts = normalizeProfilePosts(data.posts);

      setPosts((currentPosts) => {
        const existingIds = new Set(
          currentPosts.map((post) => post.id),
        );

        const uniqueNextPosts = nextPosts.filter(
          (post) => !existingIds.has(post.id),
        );

        return [...currentPosts, ...uniqueNextPosts];
      });

      setPostsNextOffset(
        (data.offset ?? requestOffset) + nextPosts.length,
      );

      setPostsHasMore(
        data.has_more ??
          (nextPosts.length >= PROFILE_POSTS_PAGE_SIZE),
      );
    } catch (requestError) {
      if (currentUserIdRef.current !== requestUserId) {
        return;
      }

      setMorePostsError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load more posts.",
      );
    } finally {
      if (currentUserIdRef.current === requestUserId) {
        setMorePostsLoading(false);
      }
    }
  }, [
    userId,
    postsHasMore,
    morePostsLoading,
    postsNextOffset,
  ]);

  const loadReposts = useCallback(async () => {
    if (
      !userId ||
      repostsLoadedForUser.current === userId
    ) {
      return;
    }

    const requestUserId = userId;
    setRepostsLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/users/${encodeURIComponent(requestUserId)}/reposts?limit=50`,
        {
          method: "GET",
          cache: "no-store",
        },
      );

      const data = (await response.json()) as RepostsResponse;

      if (currentUserIdRef.current !== requestUserId) {
        return;
      }

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to load reposts.");
      }

      setReposts(
        Array.isArray(data.reposts)
          ? data.reposts.map((repost) => ({
              ...repost,
              post_media: Array.isArray(repost.post_media)
                ? repost.post_media
                : [],
            }))
          : [],
      );

      repostsLoadedForUser.current = requestUserId;
    } catch (requestError) {
      if (currentUserIdRef.current !== requestUserId) {
        return;
      }

      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load reposts.",
      );
      setReposts([]);
    } finally {
      if (currentUserIdRef.current === requestUserId) {
        setRepostsLoading(false);
      }
    }
  }, [userId]);

  const loadMedia = useCallback(async () => {
    if (
      !userId ||
      mediaLoadedForUser.current === userId
    ) {
      return;
    }

    const requestUserId = userId;
    setMediaLoading(true);
    setMediaError("");

    try {
      const response = await fetch(
        `/api/users/${encodeURIComponent(requestUserId)}/media?limit=100`,
        {
          method: "GET",
          cache: "no-store",
        },
      );

      const data = (await response.json()) as MediaResponse;

      if (currentUserIdRef.current !== requestUserId) {
        return;
      }

      if (!response.ok) {
        throw new Error(
          data.error ?? "Unable to load profile media.",
        );
      }

      setMediaPosts(normalizeMediaPosts(data.media));
      mediaLoadedForUser.current = requestUserId;
    } catch (requestError) {
      if (currentUserIdRef.current !== requestUserId) {
        return;
      }

      setMediaError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load profile media.",
      );
      setMediaPosts([]);
    } finally {
      if (currentUserIdRef.current === requestUserId) {
        setMediaLoading(false);
      }
    }
  }, [userId]);

  useEffect(() => {
    void loadViewer();
    void loadPosts();
  }, [loadPosts, loadViewer]);

  useEffect(() => {
    if (activeTab === "reposts") {
      void loadReposts();
    }

    if (activeTab === "media") {
      void loadMedia();
    }
  }, [activeTab, loadMedia, loadReposts]);

  function handlePostUpdated(
    postId: string,
    updatedContent: string,
  ) {
    const updatedAt = new Date().toISOString();

    setPosts((currentPosts) =>
      currentPosts.map((post) =>
        post.id === postId
          ? {
              ...post,
              content: updatedContent,
              updated_at: updatedAt,
            }
          : post,
      ),
    );

    setReposts((currentReposts) =>
      currentReposts.map((post) =>
        post.id === postId
          ? {
              ...post,
              content: updatedContent,
              updated_at: updatedAt,
            }
          : post,
      ),
    );

    setMediaPosts((currentMediaPosts) =>
      currentMediaPosts.map((post) =>
        post.id === postId
          ? {
              ...post,
              content: updatedContent,
            }
          : post,
      ),
    );
  }

  function handlePostDeleted(postId: string) {
    const wasInProfilePosts = posts.some(
      (post) => post.id === postId,
    );

    setPosts((currentPosts) =>
      currentPosts.filter((post) => post.id !== postId),
    );

    setReposts((currentReposts) =>
      currentReposts.filter((post) => post.id !== postId),
    );

    setMediaPosts((currentMediaPosts) =>
      currentMediaPosts.filter((post) => post.id !== postId),
    );

    if (wasInProfilePosts) {
      setPostsNextOffset((currentOffset) =>
        Math.max(0, currentOffset - 1),
      );
    }

    if (viewerId === userId) {
      onOwnPostDeleted?.();
    }

    mediaLoadedForUser.current = null;
    setMediaError("");
  }

  function selectTab(tab: ProfileTab) {
    setError("");
    setMediaError("");
    setMorePostsError("");
    setActiveTab(tab);
  }

  if (loading) {
    return (
      <section className="mt-7">
        <div className="mb-4 h-5 w-32 animate-pulse rounded-full bg-[var(--surface-muted)]" />

        <div className="min-w-0">
          <div className="grid grid-cols-4 border-b border-[var(--border)]">
            {[0, 1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-12 animate-pulse bg-[var(--surface-muted)]"
              />
            ))}
          </div>

          <div className="space-y-4 py-5">
            <div className="h-24 animate-pulse rounded-xl bg-[var(--surface-muted)]" />
            <div className="h-24 animate-pulse rounded-xl bg-[var(--surface-muted)]" />
          </div>
        </div>
      </section>
    );
  }

  if (error && posts.length === 0) {
    return (
      <section className="mt-7 py-5">
        <p className="text-sm font-medium text-[var(--danger)]">
          {error}
        </p>

        <button
          type="button"
          onClick={() => {
            mediaLoadedForUser.current = null;
            repostsLoadedForUser.current = null;
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
    <section className="mt-7 min-w-0">
      <div className="min-w-0">
        <div
          role="tablist"
          aria-label="Profile content"
          className="grid grid-cols-4 border-b border-[var(--border)]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "posts"}
            onClick={() => selectTab("posts")}
            className={[
              "relative flex min-w-0 items-center justify-center gap-1 whitespace-nowrap px-1 py-4 text-[11px] font-semibold transition sm:gap-2 sm:px-3 sm:text-sm",
              activeTab === "posts"
                ? "text-[var(--foreground)]"
                : "text-[var(--muted)] hover:text-[var(--foreground)]",
            ].join(" ")}
          >
            <FileText size={15} className="hidden shrink-0 sm:block" />
            Posts

            {activeTab === "posts" ? (
              <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[var(--accent)] sm:inset-x-5" />
            ) : null}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "media"}
            onClick={() => selectTab("media")}
            className={[
              "relative flex min-w-0 items-center justify-center gap-1 whitespace-nowrap px-1 py-4 text-[11px] font-semibold transition sm:gap-2 sm:px-3 sm:text-sm",
              activeTab === "media"
                ? "text-[var(--foreground)]"
                : "text-[var(--muted)] hover:text-[var(--foreground)]",
            ].join(" ")}
          >
            <ImageIcon size={15} className="hidden shrink-0 sm:block" />
            Media

            {activeTab === "media" ? (
              <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[var(--accent)] sm:inset-x-5" />
            ) : null}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "reposts"}
            onClick={() => selectTab("reposts")}
            className={[
              "relative flex min-w-0 items-center justify-center gap-1 whitespace-nowrap px-1 py-4 text-[11px] font-semibold transition sm:gap-2 sm:px-3 sm:text-sm",
              activeTab === "reposts"
                ? "text-[var(--foreground)]"
                : "text-[var(--muted)] hover:text-[var(--foreground)]",
            ].join(" ")}
          >
            <Repeat2 size={15} className="hidden shrink-0 sm:block" />
            Reposts

            {activeTab === "reposts" ? (
              <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[var(--accent)] sm:inset-x-5" />
            ) : null}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "activity"}
            onClick={() => selectTab("activity")}
            className={[
              "relative flex min-w-0 items-center justify-center gap-1 whitespace-nowrap px-1 py-4 text-[11px] font-semibold transition sm:gap-2 sm:px-3 sm:text-sm",
              activeTab === "activity"
                ? "text-[var(--foreground)]"
                : "text-[var(--muted)] hover:text-[var(--foreground)]",
            ].join(" ")}
          >
            <Clock3 size={15} className="hidden shrink-0 sm:block" />
            Activity

            {activeTab === "activity" ? (
              <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[var(--accent)] sm:inset-x-5" />
            ) : null}
          </button>
        </div>

        {activeTab === "reposts" && repostsLoading ? (
          <div className="flex min-h-52 items-center justify-center px-6">
            <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
              <Loader2 size={17} className="animate-spin" />
              Loading reposts…
            </div>
          </div>
        ) : activeTab === "media" && mediaLoading ? (
          <div className="flex min-h-60 items-center justify-center px-6">
            <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
              <Loader2 size={17} className="animate-spin" />
              Loading media…
            </div>
          </div>
        ) : activeTab === "activity" ? (
          <ActivityTimeline
            key={`activity-${userId}`}
            userId={userId}
            isOwner={viewerId !== null && viewerId === userId}
          />
        ) : activeTab === "media" && mediaError ? (
          <div className="px-4 py-12 text-center sm:px-6">
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
                mediaLoadedForUser.current = null;
                setMediaError("");
                void loadMedia();
              }}
              className="mt-5 rounded-full bg-[var(--foreground)] px-4 py-2 text-sm font-semibold text-[var(--background)] transition hover:bg-[var(--accent)] hover:text-white"
            >
              Retry
            </button>
          </div>
        ) : activeTab === "media" ? (
          <ProfileMedia key={userId} posts={mediaPosts} />
        ) : activeTab === "posts" && posts.length === 0 ? (
          <div className="px-4 py-12 text-center sm:px-6">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <MessageCircle size={20} />
            </span>

            <p className="mt-4 text-sm font-medium text-[var(--foreground)]">
              No posts yet.
            </p>

            <p className="mt-1 text-sm text-[var(--muted)]">
              Conversation starts here.
            </p>
          </div>
        ) : activeTab === "reposts" && reposts.length === 0 ? (
          <div className="px-4 py-12 text-center sm:px-6">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <Repeat2 size={20} />
            </span>

            <p className="mt-4 text-sm font-medium text-[var(--foreground)]">
              No reposts yet.
            </p>

            <p className="mt-1 text-sm text-[var(--muted)]">
              Reposts from this profile will appear here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {activeTab === "posts"
              ? posts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    viewerId={viewerId}
                    onPostUpdated={handlePostUpdated}
                    onPostDeleted={handlePostDeleted}
                  />
                ))
              : reposts.map((repost) => (
                  <RepostCard
                    key={repost.repost_id}
                    repost={repost}
                    viewerId={viewerId}
                    profileId={userId}
                    onPostUpdated={handlePostUpdated}
                    onPostDeleted={handlePostDeleted}
                  />
                ))}
          </div>
        )}

        {activeTab === "posts" && postsHasMore ? (
          <div className="border-t border-[var(--border)] px-4 py-5 text-center sm:px-6">
            {morePostsError ? (
              <p className="mb-3 text-sm text-[var(--danger)]">
                {morePostsError}
              </p>
            ) : null}

            <button
              type="button"
              onClick={() => void loadMorePosts()}
              disabled={morePostsLoading}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-[var(--border)] px-5 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {morePostsLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Loading posts…
                </>
              ) : morePostsError ? (
                "Retry loading posts"
              ) : (
                "Load more posts"
              )}
            </button>
          </div>
        ) : null}

        {error ? (
          <div className="border-t border-[var(--border)] px-4 py-4 sm:px-6">
            <p className="text-sm font-medium text-[var(--danger)]">
              {error}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}