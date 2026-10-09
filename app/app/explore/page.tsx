"use client";

import {
  FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  ChevronRight,
  Compass,
  Home,
  Loader2,
  MessageCircle,
  Search,
  Settings,
  Users,
  X,
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

type ExploreTab = "all" | "people" | "posts" | "groups";

function formatPostDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const now = new Date();

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() !== now.getFullYear()
      ? { year: "numeric" }
      : {}),
  }).format(date);
}

function truncateText(value: string, maxLength: number) {
  const trimmed = value.trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength).trimEnd()}…`;
}

function ExploreTabs({
  activeTab,
  searched,
  counts,
  onChange,
}: {
  activeTab: ExploreTab;
  searched: boolean;
  counts: {
    people: number;
    posts: number;
    groups: number;
  };
  onChange: (tab: ExploreTab) => void;
}) {
  const tabs: Array<{
    id: ExploreTab;
    label: string;
    count?: number;
  }> = searched
    ? [
        { id: "all", label: "All" },
        {
          id: "people",
          label: "People",
          count: counts.people,
        },
        {
          id: "posts",
          label: "Posts",
          count: counts.posts,
        },
        {
          id: "groups",
          label: "Groups",
          count: counts.groups,
        },
      ]
    : [
        { id: "all", label: "For you" },
        {
          id: "people",
          label: "People",
          count: counts.people,
        },
        {
          id: "posts",
          label: "Posts",
          count: counts.posts,
        },
      ];

  return (
    <nav
      aria-label="Explore sections"
      className="flex gap-6 overflow-x-auto border-b border-[var(--border)]"
    >
      {tabs.map((tab) => {
        const active = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            aria-pressed={active}
            className={[
              "flex shrink-0 items-center gap-2 border-b-2",
              "py-3.5 text-sm font-semibold transition",
              active
                ? "border-[var(--accent)] text-[var(--foreground)]"
                : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]",
            ].join(" ")}
          >
            {tab.label}

            {typeof tab.count === "number" && searched ? (
              <span className="text-xs font-medium text-[var(--muted)]">
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

function PersonCard({
  person,
  following,
  loading,
  onOpen,
  onToggleFollow,
  compact = false,
}: {
  person: Person;
  following: boolean;
  loading: boolean;
  onOpen: () => void;
  onToggleFollow: () => void;
  compact?: boolean;
}) {
  return (
    <article
      className={[
        "min-w-0 rounded-2xl border border-[var(--border)]",
        "bg-[var(--surface)] transition-colors",
        "hover:border-[var(--accent)]/50",
        compact ? "p-3.5" : "p-4",
      ].join(" ")}
    >
      <div className="flex min-w-0 items-start gap-3">
        <button
          type="button"
          onClick={onOpen}
          aria-label={`View ${person.display_name}'s profile`}
          className="shrink-0 rounded-full"
        >
          <AgoreAvatar
            avatarPath={person.avatar_path}
            name={person.display_name}
            className={compact ? "h-10 w-10" : "h-12 w-12"}
            textClassName="text-sm"
          />
        </button>

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpen}
            className="block max-w-full text-left"
          >
            <p className="truncate text-sm font-semibold hover:text-[var(--accent)]">
              {person.display_name}
            </p>

            <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
              @{person.username}
            </p>
          </button>

          {person.bio ? (
            <p
              className={[
                "mt-2 text-sm leading-5 text-[var(--muted)]",
                compact ? "line-clamp-2" : "line-clamp-3",
              ].join(" ")}
            >
              {person.bio}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="flex-1 rounded-full border border-[var(--border)] px-3 py-2 text-xs font-semibold transition hover:border-[var(--accent)]"
        >
          Profile
        </button>

        <button
          type="button"
          onClick={onToggleFollow}
          disabled={loading}
          className={[
            "rounded-full px-3.5 py-2 text-xs font-semibold transition",
            "disabled:cursor-not-allowed disabled:opacity-50",
            following
              ? "border border-[var(--border)] bg-[var(--background)] hover:border-[var(--accent)]"
              : "bg-[var(--foreground)] text-[var(--background)] hover:bg-[var(--accent)] hover:text-white",
          ].join(" ")}
        >
          {loading
            ? "Updating…"
            : following
              ? "Following"
              : "Follow"}
        </button>
      </div>
    </article>
  );
}

function PostCard({
  post,
  onOpenProfile,
}: {
  post: Post;
  onOpenProfile: (personId: string) => void;
}) {
  const author = post.author;

  return (
    <article className="min-w-0 border-b border-[var(--border)] px-4 py-5 transition-colors hover:bg-[var(--surface)]/40 sm:px-5">
      <div className="flex min-w-0 items-start gap-3">
        <button
          type="button"
          onClick={() => {
            if (author) {
              onOpenProfile(author.id);
            }
          }}
          disabled={!author}
          aria-label={
            author
              ? `View ${author.display_name}'s profile`
              : "Unknown author"
          }
          className="shrink-0 rounded-full disabled:cursor-default"
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
                onClick={() => onOpenProfile(author.id)}
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

            <span aria-hidden="true" className="text-xs text-[var(--muted)]">
              ·
            </span>

            <time
              dateTime={post.created_at}
              className="text-xs text-[var(--muted)]"
            >
              {formatPostDate(post.created_at)}
            </time>
          </div>

          {post.content.trim() ? (
            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--foreground)]">
              {truncateText(post.content, 1800)}
            </p>
          ) : null}

          {post.post_media.length > 0 ? (
            <PostMedia media={post.post_media} />
          ) : null}

          <div className="mt-4 flex justify-end">
            <Link
              href={`/post/${encodeURIComponent(post.id)}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3.5 py-2 text-xs font-semibold transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              Open post
              <ChevronRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

function GroupCard({ group }: { group: Group }) {
  const title = group.name?.trim() || "Unnamed group";

  return (
    <Link
      href={`/messages/${encodeURIComponent(group.id)}`}
      className="flex min-w-0 items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 transition hover:border-[var(--accent)]"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[var(--muted)]">
        <Users size={18} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{title}</p>

        <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--muted)]">
          {group.description?.trim() || "Group conversation"}
        </p>
      </div>

      <ChevronRight
        size={17}
        className="shrink-0 text-[var(--muted)]"
      />
    </Link>
  );
}

export default function ExplorePage() {
  const router = useRouter();
  const requestSequence = useRef(0);

  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);

  const [following, setFollowing] = useState<Record<string, boolean>>({});
  const [loadingRelationship, setLoadingRelationship] = useState<
    Record<string, boolean>
  >({});

  const [searching, setSearching] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [searched, setSearched] = useState(false);
  const [activeTab, setActiveTab] = useState<ExploreTab>("all");
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialQuery = params.get("q")?.trim() ?? "";
    const initialTab = params.get("tab") as ExploreTab | null;

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

    // Read the initial URL state once after mounting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function searchAll(searchValue = query) {
    const requestId = ++requestSequence.current;
    const trimmedQuery = searchValue.trim();

    if (trimmedQuery.length === 1) {
      setError("Enter at least 2 characters to search.");
      setSearching(false);
      setLoaded(true);
      setSearched(true);
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

      if (requestId !== requestSequence.current) {
        return;
      }

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
      if (requestId !== requestSequence.current) {
        return;
      }

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
      if (requestId === requestSequence.current) {
        setSearching(false);
        setLoaded(true);
      }
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

  function changeTab(tab: ExploreTab) {
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

  function openProfile(personId: string) {
    router.push(`/profile/${encodeURIComponent(personId)}`);
  }

  function renderPeopleCards(
    list: Person[],
    compact = false,
  ) {
    return (
      <div
        className={
          compact
            ? "space-y-3"
            : "grid gap-3 sm:grid-cols-2"
        }
      >
        {list.map((person) => (
          <PersonCard
            key={person.id}
            person={person}
            following={Boolean(following[person.id])}
            loading={Boolean(loadingRelationship[person.id])}
            onOpen={() => openProfile(person.id)}
            onToggleFollow={() => void toggleFollow(person.id)}
            compact={compact}
          />
        ))}
      </div>
    );
  }

  function renderPostList(list: Post[]) {
    return (
      <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
        {list.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            onOpenProfile={openProfile}
          />
        ))}
      </div>
    );
  }

  function renderGroupList(list: Group[]) {
    return (
      <div className="space-y-3">
        {list.map((group) => (
          <GroupCard key={group.id} group={group} />
        ))}
      </div>
    );
  }

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

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[color:var(--background)]/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link
            href="/home"
            aria-label="Agoré home"
            className="shrink-0 text-lg font-bold tracking-[-0.05em] transition hover:text-[var(--accent)]"
          >
            Agoré
          </Link>

          <nav
            aria-label="Primary navigation"
            className="flex min-w-0 items-center gap-1 overflow-x-auto"
          >
            <Link
              href="/home"
              className="flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-xs font-medium text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)] sm:text-sm"
            >
              <Home size={16} />
              <span className="hidden sm:inline">Home</span>
            </Link>

            <Link
              href="/app/explore"
              aria-current="page"
              className="flex shrink-0 items-center gap-2 rounded-full bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] sm:text-sm"
            >
              <Compass size={16} className="text-[var(--accent)]" />
              <span>Explore</span>
            </Link>

            <Link
              href="/messages"
              className="flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-xs font-medium text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)] sm:text-sm"
            >
              <MessageCircle size={16} />
              <span className="hidden sm:inline">Messages</span>
            </Link>

            <Link
              href="/notifications"
              aria-label="Notifications"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
            >
              <Bell size={17} />
            </Link>

            <Link
              href="/settings"
              aria-label="Settings"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
            >
              <Settings size={17} />
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl gap-8 px-0 pb-20 sm:px-6 lg:grid-cols-[minmax(0,1fr)_290px] lg:gap-10">
        <section className="min-w-0">
          <div className="px-4 pb-5 pt-7 sm:px-0 sm:pt-8">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--accent)]">
              Discover
            </p>

            <div className="mt-2 flex items-end justify-between gap-4">
              <div>
                <h1 className="text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
                  Explore
                </h1>

                <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">
                  Find new voices, interesting posts, and people worth following.
                </p>
              </div>
            </div>

            <form
              onSubmit={handleSearch}
              className="mt-5 flex items-center gap-2"
            >
              <div className="relative min-w-0 flex-1">
                <Search
                  size={18}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]"
                />

                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search people and posts"
                  aria-label="Search people and posts"
                  maxLength={50}
                  className="h-12 w-full rounded-full border border-[var(--border)] bg-[var(--surface)] pl-11 pr-11 text-sm outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
                />

                {query ? (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setError("");
                      window.history.replaceState(
                        null,
                        "",
                        "/app/explore",
                      );
                      void searchAll("");
                    }}
                    aria-label="Clear search"
                    className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
                  >
                    <X size={15} />
                  </button>
                ) : null}
              </div>

              <button
                type="submit"
                disabled={searching}
                className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-[var(--foreground)] px-4 text-sm font-semibold text-[var(--background)] transition hover:bg-[var(--accent)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50 sm:px-5"
              >
                {searching ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Search size={16} />
                )}

                <span className="hidden sm:inline">
                  {searching ? "Searching" : "Search"}
                </span>
              </button>
            </form>
          </div>

          <div className="px-4 sm:px-0">
            <ExploreTabs
              activeTab={activeTab}
              searched={searched}
              counts={{
                people: people.length,
                posts: posts.length,
                groups: groups.length,
              }}
              onChange={changeTab}
            />
          </div>

          {error ? (
            <div
              role="alert"
              className="mx-4 mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5 text-sm text-[var(--foreground)] sm:mx-0"
            >
              {error}
            </div>
          ) : null}

          <div className="mt-2 min-w-0">
            {searching || !loaded ? (
              <div className="flex min-h-48 items-center justify-center gap-3 px-5 text-sm text-[var(--muted)]">
                <Loader2 size={18} className="animate-spin" />
                {searched
                  ? "Searching Agoré…"
                  : "Finding people and posts…"}
              </div>
            ) : searched ? (
              !hasVisibleResults ? (
                <div className="px-5 py-16 text-center sm:px-8">
                  <Search
                    size={24}
                    className="mx-auto text-[var(--muted)]"
                  />

                  <h2 className="mt-4 text-lg font-semibold">
                    No results found
                  </h2>

                  <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--muted)]">
                    Try a different name or phrase, or choose another result category.
                  </p>
                </div>
              ) : (
                <div className="space-y-8 px-4 pt-5 sm:px-0">
                  {visiblePeople.length > 0 ? (
                    <section>
                      <div className="mb-3 flex items-center justify-between">
                        <h2 className="text-base font-semibold">
                          People
                        </h2>

                        <span className="text-xs text-[var(--muted)]">
                          {visiblePeople.length} found
                        </span>
                      </div>

                      {renderPeopleCards(visiblePeople)}
                    </section>
                  ) : null}

                  {visiblePosts.length > 0 ? (
                    <section>
                      <div className="mb-3 flex items-center justify-between">
                        <h2 className="text-base font-semibold">
                          Posts
                        </h2>

                        <span className="text-xs text-[var(--muted)]">
                          {visiblePosts.length} found
                        </span>
                      </div>

                      {renderPostList(visiblePosts)}
                    </section>
                  ) : null}

                  {visibleGroups.length > 0 ? (
                    <section>
                      <div className="mb-3">
                        <h2 className="text-base font-semibold">
                          Your group conversations
                        </h2>

                        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                          Only groups you already belong to appear here.
                        </p>
                      </div>

                      {renderGroupList(visibleGroups)}
                    </section>
                  ) : null}
                </div>
              )
            ) : activeTab === "people" ? (
              <section className="px-4 pt-5 sm:px-0">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold">
                    People to meet
                  </h2>

                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Active accounts you are not following yet.
                  </p>
                </div>

                {people.length > 0 ? (
                  renderPeopleCards(people)
                ) : (
                  <p className="rounded-2xl border border-[var(--border)] p-5 text-sm leading-6 text-[var(--muted)]">
                    No new people to recommend right now. Try searching by name or username.
                  </p>
                )}
              </section>
            ) : activeTab === "posts" ? (
              <section className="pt-2">
                <div className="px-4 py-4 sm:px-0">
                  <h2 className="text-lg font-semibold">
                    Recent posts
                  </h2>

                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Posts from active accounts you have not followed yet.
                  </p>
                </div>

                {posts.length > 0 ? (
                  renderPostList(posts)
                ) : (
                  <p className="mx-4 rounded-2xl border border-[var(--border)] p-5 text-sm leading-6 text-[var(--muted)] sm:mx-0">
                    No recent posts from new voices are available yet.
                  </p>
                )}
              </section>
            ) : (
              <div className="space-y-8 pt-2">
                <section>
                  <div className="flex items-end justify-between gap-4 px-4 py-4 sm:px-0">
                    <div>
                      <h2 className="text-lg font-semibold">
                        Recent posts
                      </h2>

                      <p className="mt-1 text-sm text-[var(--muted)]">
                        Discover what people are sharing.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => changeTab("posts")}
                      className="shrink-0 text-sm font-semibold text-[var(--accent)] hover:opacity-80"
                    >
                      View all
                    </button>
                  </div>

                  {posts.length > 0 ? (
                    renderPostList(posts)
                  ) : (
                    <p className="mx-4 rounded-2xl border border-[var(--border)] p-5 text-sm leading-6 text-[var(--muted)] sm:mx-0">
                      No recent posts from new voices are available yet.
                    </p>
                  )}
                </section>

                <section className="px-4 sm:px-0 lg:hidden">
                  <div className="mb-4 flex items-end justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold">
                        People to meet
                      </h2>

                      <p className="mt-1 text-sm text-[var(--muted)]">
                        Find new people to follow.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => changeTab("people")}
                      className="shrink-0 text-sm font-semibold text-[var(--accent)] hover:opacity-80"
                    >
                      View all
                    </button>
                  </div>

                  {people.length > 0 ? (
                    renderPeopleCards(people.slice(0, 6), true)
                  ) : (
                    <p className="rounded-2xl border border-[var(--border)] p-4 text-sm leading-6 text-[var(--muted)]">
                      No new people to recommend right now. Try searching for a name or username.
                    </p>
                  )}
                </section>
              </div>
            )}
          </div>
        </section>

        <aside className="hidden min-w-0 lg:block">
          {!searched && activeTab === "all" ? (
            <div className="sticky top-24 space-y-6 pt-8">
              <section>
                <div className="mb-4 flex items-end justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold">
                      People to meet
                    </h2>

                    <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                      Discover active accounts beyond your current circle.
                    </p>
                  </div>

                  <Users
                    size={18}
                    className="shrink-0 text-[var(--accent)]"
                  />
                </div>

                {people.length > 0 ? (
                  renderPeopleCards(people.slice(0, 8), true)
                ) : (
                  <div className="rounded-2xl border border-[var(--border)] p-4 text-sm leading-6 text-[var(--muted)]">
                    No new people to recommend right now.
                  </div>
                )}

                {people.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => changeTab("people")}
                    className="mt-3 text-sm font-semibold text-[var(--accent)] hover:opacity-80"
                  >
                    See more people
                  </button>
                ) : null}
              </section>

              <section className="border-t border-[var(--border)] pt-5">
                <p className="text-sm font-semibold">
                  Looking for something specific?
                </p>

                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  Search people by name or username, find posts by their text, or search group conversations you already belong to.
                </p>
              </section>
            </div>
          ) : null}
        </aside>
      </div>
    </main>
  );
}