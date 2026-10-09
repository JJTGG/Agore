"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronRight,
  Compass,
  Loader2,
  Search,
  Sparkles,
  Users,
} from "lucide-react";

import AgoreAvatar from "@/components/agore-avatar";
import PostMedia, {
  type PostMediaItem,
} from "@/components/post-media";

type Person = {
  id: string;
  display_name: string;
  username: string;
  bio: string | null;
  avatar_path: string | null;
  created_at: string;
};

type Post = {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  post_media: PostMediaItem[];
  author: Person | null;
};

type Group = {
  id: string;
  name: string | null;
  description: string | null;
  image_path: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type SearchResponse = {
  mode: "discover" | "search";
  query: string | null;
  people: Person[];
  posts: Post[];
  groups: Group[];
  followingIds: string[];
};

type ErrorResponse = {
  error?: string;
};

type SearchTab = "all" | "people" | "posts" | "groups";

function formatPostDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year:
      date.getFullYear() === new Date().getFullYear()
        ? undefined
        : "numeric",
  }).format(date);
}

function truncateText(value: string, maxLength: number) {
  const trimmed = value.trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength).trim()}…`;
}

function SearchTabs({
  activeTab,
  counts,
  onChange,
}: {
  activeTab: SearchTab;
  counts: {
    people: number;
    posts: number;
    groups: number;
  };
  onChange: (tab: SearchTab) => void;
}) {
  const tabs: Array<{
    id: SearchTab;
    label: string;
    count?: number;
  }> = [
    { id: "all", label: "All" },
    { id: "people", label: "People", count: counts.people },
    { id: "posts", label: "Posts", count: counts.posts },
    { id: "groups", label: "Groups", count: counts.groups },
  ];

  return (
    <div className="flex gap-5 overflow-x-auto border-b border-[var(--border)]">
      {tabs.map((tab) => {
        const active = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={[
              "shrink-0 border-b-2 pb-3 pt-1 text-sm font-semibold transition",
              active
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]",
            ].join(" ")}
          >
            {tab.label}

            {typeof tab.count === "number" ? (
              <span className="ml-1.5 text-xs font-medium">
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export default function ExplorePage() {
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [following, setFollowing] = useState<Record<string, boolean>>({});
  const [searching, setSearching] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const [loadingRelationship, setLoadingRelationship] = useState<
    Record<string, boolean>
  >({});

  const [searched, setSearched] = useState(false);
  const [activeTab, setActiveTab] = useState<SearchTab>("all");
  const [error, setError] = useState("");

  /*
   * The first visit loads discovery automatically.
   * A URL containing ?q=... loads the corresponding search.
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialQuery = params.get("q")?.trim() ?? "";
    const initialTab = params.get("tab") as SearchTab | null;

    if (
      initialTab === "people" ||
      initialTab === "posts" ||
      initialTab === "groups"
    ) {
      setActiveTab(initialTab);
    }

    if (initialQuery) {
      setQuery(initialQuery);
    }

    void searchAll(initialQuery);
    // Initial navigation state is read once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function searchAll(searchValue = query) {
    const trimmedQuery = searchValue.trim();

    if (trimmedQuery.length === 1) {
      setError("Enter at least 2 characters to search.");
      return;
    }

    const discoveryMode = trimmedQuery.length === 0;

    setSearching(true);
    setLoaded(false);
    setSearched(!discoveryMode);
    setError("");

    if (discoveryMode) {
      setActiveTab("all");
    }

    try {
      const params = new URLSearchParams();
      params.set("limit", "20");

      if (!discoveryMode) {
        params.set("q", trimmedQuery);
      }

      const response = await fetch(
        `/api/search?${params.toString()}`,
        {
          method: "GET",
          cache: "no-store",
        },
      );

      const data = (await response.json()) as
        | SearchResponse
        | ErrorResponse;

      if (response.status === 401) {
        router.push("/auth");
        return;
      }

      if (!response.ok) {
        throw new Error(
          "error" in data && data.error
            ? data.error
            : "Unable to load Explore.",
        );
      }

      const result = data as SearchResponse;

      const nextPeople = Array.isArray(result.people)
        ? result.people
        : [];

      const nextPosts = Array.isArray(result.posts)
        ? result.posts
        : [];

      const nextGroups = Array.isArray(result.groups)
        ? result.groups
        : [];

      const nextFollowingIds = Array.isArray(result.followingIds)
        ? result.followingIds
        : [];

      setPeople(nextPeople);

      setPosts(
        nextPosts.map((post) => ({
          ...post,
          post_media: Array.isArray(post.post_media)
            ? post.post_media
            : [],
        })),
      );

      setGroups(nextGroups);

      setFollowing(
        Object.fromEntries(
          nextPeople.map((person) => [
            person.id,
            nextFollowingIds.includes(person.id),
          ]),
        ),
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load Explore.",
      );

      setPeople([]);
      setPosts([]);
      setGroups([]);
      setFollowing({});
    } finally {
      setSearching(false);
      setLoaded(true);
    }
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedQuery = query.trim();

    if (trimmedQuery.length === 1) {
      setError("Enter at least 2 characters to search.");
      return;
    }

    const params = new URLSearchParams();

    if (trimmedQuery) {
      params.set("q", trimmedQuery);

      if (activeTab !== "all") {
        params.set("tab", activeTab);
      }
    }

    const queryString = params.toString();

    /*
     * The real route is /app/explore, not /explore.
     * Keep submitted searches and browser refreshes on
     * the route that actually exists in this repository.
     */
    window.history.replaceState(
      null,
      "",
      queryString
        ? `/app/explore?${queryString}`
        : "/app/explore",
    );

    await searchAll(trimmedQuery);
  }

  async function toggleFollow(personId: string) {
    if (loadingRelationship[personId]) {
      return;
    }

    const isFollowing = Boolean(following[personId]);

    setLoadingRelationship((current) => ({
      ...current,
      [personId]: true,
    }));

    setError("");

    try {
      const response = await fetch(
        `/api/users/${encodeURIComponent(personId)}/follow`,
        {
          method: isFollowing ? "DELETE" : "POST",
        },
      );

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (response.status === 401) {
        router.push("/auth");
        return;
      }

      if (!response.ok) {
        throw new Error(
          data.error ?? "Unable to update follow status.",
        );
      }

      setFollowing((current) => ({
        ...current,
        [personId]: !isFollowing,
      }));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to update follow status.",
      );
    } finally {
      setLoadingRelationship((current) => ({
        ...current,
        [personId]: false,
      }));
    }
  }

  function changeTab(tab: SearchTab) {
    setActiveTab(tab);

    const params = new URLSearchParams();
    const trimmedQuery = query.trim();

    if (trimmedQuery) {
      params.set("q", trimmedQuery);
    }

    if (tab !== "all") {
      params.set("tab", tab);
    }

    const queryString = params.toString();

    window.history.replaceState(
      null,
      "",
      queryString
        ? `/app/explore?${queryString}`
        : "/app/explore",
    );
  }

  const hasResults =
    people.length > 0 ||
    posts.length > 0 ||
    groups.length > 0;

  const visiblePeople =
    activeTab === "all" || activeTab === "people"
      ? people
      : [];

  const visiblePosts =
    activeTab === "all" || activeTab === "posts"
      ? posts
      : [];

  const visibleGroups =
    activeTab === "all" || activeTab === "groups"
      ? groups
      : [];

  const hasVisibleResults =
    visiblePeople.length > 0 ||
    visiblePosts.length > 0 ||
    visibleGroups.length > 0;

  function renderPersonCard(person: Person) {
    const isFollowing = Boolean(following[person.id]);
    const relationshipLoading = Boolean(
      loadingRelationship[person.id],
    );

    return (
      <article
        key={person.id}
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 transition hover:border-[var(--accent)]/50"
      >
        <div className="flex items-start gap-4">
          <button
            type="button"
            onClick={() =>
              router.push(
                `/profile/${encodeURIComponent(person.id)}`,
              )
            }
            aria-label={`View ${person.display_name}'s profile`}
            className="shrink-0 rounded-full"
          >
            <AgoreAvatar
              avatarPath={person.avatar_path}
              name={person.display_name}
              className="h-12 w-12"
              textClassName="text-sm"
            />
          </button>

          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() =>
                router.push(
                  `/profile/${encodeURIComponent(person.id)}`,
                )
              }
              className="block max-w-full text-left"
            >
              <p className="truncate font-semibold transition hover:text-[var(--accent)]">
                {person.display_name}
              </p>

              <p className="mt-1 text-sm text-[var(--muted)]">
                @{person.username}
              </p>
            </button>

            {person.bio ? (
              <p className="mt-3 line-clamp-2 text-sm leading-6 text-[var(--muted)]">
                {person.bio}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() =>
              router.push(
                `/profile/${encodeURIComponent(person.id)}`,
              )
            }
            className="flex-1 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold transition hover:border-[var(--accent)]"
          >
            Profile
          </button>

          <button
            type="button"
            onClick={() => void toggleFollow(person.id)}
            disabled={relationshipLoading}
            className={[
              "rounded-full px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
              isFollowing
                ? "border border-[var(--border)] bg-[var(--background)] hover:border-[var(--accent)]"
                : "bg-[var(--accent)] text-white hover:opacity-90",
            ].join(" ")}
          >
            {relationshipLoading
              ? "Updating…"
              : isFollowing
                ? "Following"
                : "Follow"}
          </button>
        </div>
      </article>
    );
  }

  function renderPostCard(post: Post) {
    const author = post.author;

    return (
      <article
        key={post.id}
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6"
      >
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => {
              if (author) {
                router.push(
                  `/profile/${encodeURIComponent(author.id)}`,
                );
              }
            }}
            aria-label={
              author
                ? `View ${author.display_name}'s profile`
                : "Unknown author"
            }
            className="shrink-0 rounded-full"
          >
            <AgoreAvatar
              avatarPath={author?.avatar_path ?? null}
              name={author?.display_name ?? "Agoré user"}
              className="h-10 w-10"
              textClassName="text-xs"
            />
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {author ? (
                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      `/profile/${encodeURIComponent(author.id)}`,
                    )
                  }
                  className="text-sm font-semibold hover:text-[var(--accent)]"
                >
                  {author.display_name}
                </button>
              ) : (
                <span className="text-sm font-semibold">
                  Agoré user
                </span>
              )}

              {author ? (
                <span className="text-xs text-[var(--muted)]">
                  @{author.username}
                </span>
              ) : null}

              <span className="text-xs text-[var(--muted)]">
                ·
              </span>

              <span className="text-xs text-[var(--muted)]">
                {formatPostDate(post.created_at)}
              </span>
            </div>

            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">
              {truncateText(post.content, 800)}
            </p>

            {post.post_media.length > 0 ? (
              <PostMedia media={post.post_media} />
            ) : null}

            <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-3">
              <span className="text-xs text-[var(--muted)]">
                Conversation
              </span>

              <Link
                href={`/post/${encodeURIComponent(post.id)}`}
                className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)] transition hover:opacity-80"
              >
                Open post
                <ChevronRight size={15} />
              </Link>
            </div>
          </div>
        </div>
      </article>
    );
  }

  function renderGroupCard(group: Group) {
    const title = group.name?.trim() || "Unnamed group";

    return (
      <button
        key={group.id}
        type="button"
        onClick={() =>
          router.push(
            `/messages/${encodeURIComponent(group.id)}`,
          )
        }
        className="flex w-full items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-left transition hover:border-[var(--accent)]"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
          <Users size={18} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            {title}
          </p>

          <p className="mt-1 line-clamp-2 text-sm leading-6 text-[var(--muted)]">
            {group.description?.trim() || "Group conversation"}
          </p>
        </div>

        <ChevronRight
          size={18}
          className="shrink-0 text-[var(--muted)]"
        />
      </button>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto min-h-screen w-full max-w-5xl px-5 py-6 pb-16 sm:px-8">
        <header className="flex items-center justify-between border-b border-[var(--border)] pb-5">
          <div>
            <Link
              href="/home"
              className="text-xl font-semibold tracking-[-0.03em] transition hover:text-[var(--accent)]"
            >
              Agoré
            </Link>

            <p className="mt-1 text-sm text-[var(--muted)]">
              Discover people and conversations.
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/home")}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium transition hover:border-[var(--accent)]"
          >
            <ArrowLeft size={16} />
            Home
          </button>
        </header>

        <section className="py-8 sm:py-12">
          <div className="relative overflow-hidden rounded-[2rem] border border-[var(--border)] bg-[var(--surface)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_90%_0%,var(--accent-soft),transparent_35%)]" />

            <div className="relative px-5 py-8 sm:px-8 sm:py-10">
              <div className="flex items-center gap-2">
                <Compass
                  size={16}
                  className="text-[var(--accent)]"
                />

                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
                  Explore Agoré
                </p>
              </div>

              <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
                Find people.
                <br />
                <span className="text-[var(--accent)]">
                  Find your next conversation.
                </span>
              </h1>

              <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--muted)] sm:text-base">
                Meet people you have not followed yet, discover recent posts
                from new voices, or search for something specific.
              </p>

              <form
                onSubmit={handleSearch}
                className="mt-7 flex flex-col gap-3 sm:flex-row"
              >
                <div className="relative min-w-0 flex-1">
                  <Search
                    size={18}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]"
                  />

                  <input
                    type="search"
                    value={query}
                    onChange={(event) =>
                      setQuery(event.target.value)
                    }
                    placeholder="Search people, posts, or groups…"
                    maxLength={50}
                    className="w-full rounded-full border border-[var(--border)] bg-[var(--background)] py-3 pl-11 pr-4 text-sm outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={searching}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {searching ? (
                    <>
                      <Loader2
                        size={16}
                        className="animate-spin"
                      />
                      Loading…
                    </>
                  ) : query.trim() ? (
                    "Search"
                  ) : (
                    "Discover"
                  )}
                </button>
              </form>
            </div>
          </div>
        </section>

        {searched ? (
          <div className="mb-8">
            <SearchTabs
              activeTab={activeTab}
              counts={{
                people: people.length,
                posts: posts.length,
                groups: groups.length,
              }}
              onChange={changeTab}
            />
          </div>
        ) : null}

        {error ? (
          <div className="mb-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--foreground)]">
            {error}
          </div>
        ) : null}

        <div className="space-y-10">
          {searching || !loaded ? (
            <div className="flex items-center justify-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-12 text-sm text-[var(--muted)]">
              <Loader2
                size={18}
                className="animate-spin"
              />
              {searched ? "Searching Agoré…" : "Finding people and posts…"}
            </div>
          ) : searched ? (
            !hasVisibleResults ? (
              <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-6 py-12 text-center">
                <Search
                  size={22}
                  className="mx-auto text-[var(--muted)]"
                />

                <h2 className="mt-4 text-lg font-semibold">
                  No results in this section
                </h2>

                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  Try another search term or choose a different tab.
                </p>
              </section>
            ) : (
              <>
                {visiblePeople.length > 0 ? (
                  <section>
                    <div className="mb-4 flex items-end justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
                          People
                        </p>

                        <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em]">
                          Matching people
                        </h2>
                      </div>

                      {activeTab === "all" &&
                      people.length > 4 ? (
                        <button
                          type="button"
                          onClick={() => changeTab("people")}
                          className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)]"
                        >
                          See all
                          <ChevronRight size={15} />
                        </button>
                      ) : null}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      {visiblePeople
                        .slice(
                          0,
                          activeTab === "all" ? 4 : visiblePeople.length,
                        )
                        .map(renderPersonCard)}
                    </div>
                  </section>
                ) : null}

                {visiblePosts.length > 0 ? (
                  <section>
                    <div className="mb-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
                        Posts
                      </p>

                      <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em]">
                        Matching posts
                      </h2>
                    </div>

                    <div className="space-y-4">
                      {visiblePosts
                        .slice(
                          0,
                          activeTab === "all" ? 5 : visiblePosts.length,
                        )
                        .map(renderPostCard)}
                    </div>
                  </section>
                ) : null}

                {visibleGroups.length > 0 ? (
                  <section>
                    <div className="mb-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
                        Groups
                      </p>

                      <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em]">
                        Your group conversations
                      </h2>

                      <p className="mt-1 text-sm text-[var(--muted)]">
                        These are groups you already belong to.
                      </p>
                    </div>

                    <div className="space-y-3">
                      {visibleGroups.map(renderGroupCard)}
                    </div>
                  </section>
                ) : null}
              </>
            )
          ) : (
            <>
              <section>
                <div className="mb-4 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
                      People
                    </p>

                    <h2 className="mt-1 text-2xl font-semibold tracking-[-0.035em]">
                      People to meet
                    </h2>

                    <p className="mt-2 text-sm text-[var(--muted)]">
                      Active accounts you are not following yet.
                    </p>
                  </div>

                  <Users
                    size={19}
                    className="shrink-0 text-[var(--accent)]"
                  />
                </div>

                {people.length > 0 ? (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {people.slice(0, 6).map(renderPersonCard)}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-sm leading-6 text-[var(--muted)]">
                    There are no new people to recommend right now. Try
                    searching for a name or username.
                  </div>
                )}
              </section>

              <section>
                <div className="mb-4 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
                      Recent posts
                    </p>

                    <h2 className="mt-1 text-2xl font-semibold tracking-[-0.035em]">
                      From new voices
                    </h2>

                    <p className="mt-2 text-sm text-[var(--muted)]">
                      Recent posts from active accounts you do not follow.
                    </p>
                  </div>

                  <Sparkles
                    size={19}
                    className="shrink-0 text-[var(--accent)]"
                  />
                </div>

                {posts.length > 0 ? (
                  <div className="space-y-4">
                    {posts.slice(0, 10).map(renderPostCard)}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-sm leading-6 text-[var(--muted)]">
                    No recent posts from new voices are available yet.
                    Search for a topic or check back as more people post.
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
                <p className="text-sm font-semibold">
                  Looking for something specific?
                </p>

                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  Search by username, display name, post content, or the
                  name of a group conversation you already belong to.
                </p>
              </section>
            </>
          )}
        </div>

        {searched && activeTab === "all" ? (
          <footer className="mt-10 border-t border-[var(--border)] py-6 text-center text-sm text-[var(--muted)]">
            Search results are limited to people, posts, and groups
            available to your account.
          </footer>
        ) : null}
      </div>
    </main>
  );
}