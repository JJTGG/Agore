"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronRight,
  Loader2,
  MessageCircle,
  Search,
  Users,
} from "lucide-react";

type Person = {
  id: string;
  display_name: string;
  username: string;
  bio: string | null;
  avatar_path: string | null;
};

type Post = {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
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
  query: string;
  people: Person[];
  posts: Post[];
  groups: Group[];
};

type ErrorResponse = {
  error?: string;
};

type SearchTab = "all" | "people" | "posts" | "groups";

function getInitials(value: string) {
  return (
    value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "A"
  );
}

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
    <div className="flex gap-2 overflow-x-auto border-b border-[var(--border)] pb-px">
      {tabs.map((tab) => {
        const active = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`shrink-0 border-b-2 px-1 pb-3 pt-1 text-sm font-semibold transition ${
              active
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
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
  const [loadingRelationship, setLoadingRelationship] = useState<
    Record<string, boolean>
  >({});
  const [searched, setSearched] = useState(false);
  const [activeTab, setActiveTab] = useState<SearchTab>("all");
  const [error, setError] = useState("");

  useEffect(() => {
    const runInitialSearch = async () => {
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

      if (!initialQuery) {
        return;
      }

      setQuery(initialQuery);
      await searchAll(initialQuery);
    };

    void runInitialSearch();
  }, []);

  async function searchAll(searchValue = query) {
    const trimmedQuery = searchValue.trim();

    if (trimmedQuery.length < 2) {
      setPeople([]);
      setPosts([]);
      setGroups([]);
      setFollowing({});
      setSearched(false);
      setError("");
      return;
    }

    setSearching(true);
    setSearched(true);
    setError("");

    try {
      const response = await fetch(
        `/api/search?q=${encodeURIComponent(trimmedQuery)}&limit=20`,
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
            : "Unable to search.",
        );
      }

      const searchData = data as SearchResponse;

      const nextPeople = Array.isArray(searchData.people)
        ? searchData.people
        : [];

      const nextPosts = Array.isArray(searchData.posts)
        ? searchData.posts
        : [];

      const nextGroups = Array.isArray(searchData.groups)
        ? searchData.groups
        : [];

      setPeople(nextPeople);
      setPosts(nextPosts);
      setGroups(nextGroups);

      const relationshipEntries = await Promise.all(
        nextPeople.map(async (person) => {
          try {
            const relationshipResponse = await fetch(
              `/api/users/${person.id}/follow`,
              {
                method: "GET",
                cache: "no-store",
              },
            );

            if (!relationshipResponse.ok) {
              return [person.id, false] as const;
            }

            const relationshipData = (await relationshipResponse.json()) as {
              following?: boolean;
            };

            return [
              person.id,
              Boolean(relationshipData.following),
            ] as const;
          } catch {
            return [person.id, false] as const;
          }
        }),
      );

      setFollowing(Object.fromEntries(relationshipEntries));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to search.",
      );
      setPeople([]);
      setPosts([]);
      setGroups([]);
    } finally {
      setSearching(false);
    }
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedQuery = query.trim();

    if (trimmedQuery.length < 2) {
      setError("Enter at least 2 characters to search.");
      return;
    }

    const params = new URLSearchParams();
    params.set("q", trimmedQuery);

    if (activeTab !== "all") {
      params.set("tab", activeTab);
    }

    window.history.replaceState(
      null,
      "",
      `/explore?${params.toString()}`,
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
        `/api/users/${personId}/follow`,
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
      queryString ? `/explore?${queryString}` : "/explore",
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

  return (
    <main className="min-h-screen bg-[var(--background)]">
      <div className="mx-auto min-h-screen w-full max-w-5xl px-5 py-6 sm:px-8">
        <header className="flex items-center justify-between border-b border-[var(--border)] pb-5">
          <div>
            <p className="text-xl font-semibold tracking-[-0.03em]">
              Agoré
            </p>

            <p className="mt-1 text-sm text-[var(--muted)]">
              Search people, posts, and your groups.
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

        <section className="py-10 sm:py-14">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
              Explore
            </p>

            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
              Find something.
            </h1>

            <p className="mt-4 leading-7 text-[var(--muted)]">
              Search across people, posts, and group conversations
              you already belong to.
            </p>
          </div>

          <form
            onSubmit={handleSearch}
            className="mt-8 flex flex-col gap-3 sm:flex-row"
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
                placeholder="Search people, posts, or groups…"
                minLength={2}
                maxLength={50}
                className="w-full border border-[var(--border)] bg-[var(--surface)] py-3 pl-11 pr-4 text-sm outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
              />
            </div>

            <button
              type="submit"
              disabled={searching}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {searching ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Searching…
                </>
              ) : (
                "Search"
              )}
            </button>
          </form>

          {searched ? (
            <div className="mt-8">
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
            <div className="mt-5 border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--foreground)]">
              {error}
            </div>
          ) : null}

          <div className="mt-8">
            {!searched ? (
              <div className="border border-[var(--border)] bg-[var(--surface)] p-6">
                <p className="font-medium">
                  Search Agoré.
                </p>

                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  Find people, discover matching posts, or search
                  through groups you already belong to.
                </p>
              </div>
            ) : searching ? (
              <div className="border border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-[var(--muted)]">
                Searching Agoré…
              </div>
            ) : !hasResults ? (
              <div className="border border-[var(--border)] bg-[var(--surface)] p-6">
                <p className="font-medium">
                  No results found.
                </p>

                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  Try a different search term.
                </p>
              </div>
            ) : (
              <div className="space-y-10">
                {visiblePeople.length > 0 ? (
                  <section>
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
                          People
                        </p>

                        <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em]">
                          People
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
                          activeTab === "all" ? 4 : people.length,
                        )
                        .map((person) => {
                          const isFollowing = Boolean(
                            following[person.id],
                          );

                          const relationshipLoading =
                            Boolean(
                              loadingRelationship[person.id],
                            );

                          return (
                            <article
                              key={person.id}
                              className="border border-[var(--border)] bg-[var(--surface)] p-5"
                            >
                              <div className="flex items-start gap-4">
                                <button
                                  type="button"
                                  onClick={() =>
                                    router.push(
                                      `/profile/${person.id}`,
                                    )
                                  }
                                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/10 text-sm font-bold text-[var(--accent)]"
                                  aria-label={`View ${person.display_name}'s profile`}
                                >
                                  {getInitials(
                                    person.display_name,
                                  )}
                                </button>

                                <div className="min-w-0 flex-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      router.push(
                                        `/profile/${person.id}`,
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
                                      `/profile/${person.id}`,
                                    )
                                  }
                                  className="flex-1 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold transition hover:border-[var(--accent)]"
                                >
                                  Profile
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    void toggleFollow(person.id)
                                  }
                                  disabled={
                                    relationshipLoading
                                  }
                                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                                    isFollowing
                                      ? "border border-[var(--border)] bg-[var(--background)] hover:border-[var(--accent)]"
                                      : "bg-[var(--accent)] text-white hover:opacity-90"
                                  }`}
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
                        })}
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

                    <div className="space-y-3">
                      {visiblePosts
                        .slice(
                          0,
                          activeTab === "all" ? 5 : posts.length,
                        )
                        .map((post) => {
                          const author = post.author;

                          return (
                            <article
                              key={post.id}
                              className="border border-[var(--border)] bg-[var(--surface)] p-5"
                            >
                              <div className="flex items-start gap-3">
                                <button
                                  type="button"
                                  onClick={() =>
                                    author
                                      ? router.push(
                                          `/profile/${author.id}`,
                                        )
                                      : undefined
                                  }
                                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/10 text-xs font-bold text-[var(--accent)]"
                                  aria-label={
                                    author
                                      ? `View ${author.display_name}'s profile`
                                      : "Unknown author"
                                  }
                                >
                                  {author
                                    ? getInitials(
                                        author.display_name,
                                      )
                                    : "A"}
                                </button>

                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        author
                                          ? router.push(
                                              `/profile/${author.id}`,
                                            )
                                          : undefined
                                      }
                                      className="text-sm font-semibold hover:text-[var(--accent)]"
                                    >
                                      {author?.display_name ??
                                        "Agoré user"}
                                    </button>

                                    {author ? (
                                      <span className="text-xs text-[var(--muted)]">
                                        @{author.username}
                                      </span>
                                    ) : null}

                                    <span className="text-xs text-[var(--muted)]">
                                      ·
                                    </span>

                                    <span className="text-xs text-[var(--muted)]">
                                      {formatPostDate(
                                        post.created_at,
                                      )}
                                    </span>
                                  </div>

                                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6">
                                    {truncateText(
                                      post.content,
                                      500,
                                    )}
                                  </p>

                                  {post.content.trim().length >
                                  500 ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        router.push(
                                          `/home#post-${post.id}`,
                                        )
                                      }
                                      className="mt-3 text-sm font-semibold text-[var(--accent)]"
                                    >
                                      View post
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            </article>
                          );
                        })}
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
                        Your groups
                      </h2>

                      <p className="mt-1 text-sm text-[var(--muted)]">
                        Only groups you already belong to appear here.
                      </p>
                    </div>

                    <div className="space-y-3">
                      {visibleGroups.map((group) => {
                        const title =
                          group.name?.trim() ||
                          "Unnamed group";

                        return (
                          <button
                            key={group.id}
                            type="button"
                            onClick={() =>
                              router.push(
                                `/messages/${encodeURIComponent(
                                  group.id,
                                )}`,
                              )
                            }
                            className="flex w-full items-center gap-4 border border-[var(--border)] bg-[var(--surface)] p-5 text-left transition hover:border-[var(--accent)]"
                          >
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/10 text-[var(--accent)]">
                              <Users size={18} />
                            </div>

                            <div className="min-w-0 flex-1">
                              <p className="truncate font-semibold">
                                {title}
                              </p>

                              <p className="mt-1 line-clamp-2 text-sm leading-6 text-[var(--muted)]">
                                {group.description?.trim() ||
                                  "Group conversation"}
                              </p>
                            </div>

                            <ChevronRight
                              size={18}
                              className="shrink-0 text-[var(--muted)]"
                            />
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ) : null}
              </div>
            )}
          </div>
        </section>

        {searched && activeTab === "all" ? (
          <footer className="border-t border-[var(--border)] py-6 text-center text-sm text-[var(--muted)]">
            Search is limited to people, posts, and groups available
            to your account.
          </footer>
        ) : null}
      </div>
    </main>
  );
}