"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Person = {
  id: string;
  display_name: string;
  username: string;
  bio: string | null;
  avatar_path: string | null;
  created_at: string;
};

type SearchResponse = {
  people: Person[];
};

type ErrorResponse = {
  error?: string;
};

export default function ExplorePage() {
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [following, setFollowing] = useState<Record<string, boolean>>({});
  const [searching, setSearching] = useState(false);
  const [loadingRelationship, setLoadingRelationship] = useState<
    Record<string, boolean>
  >({});
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const runInitialSearch = async () => {
      const params = new URLSearchParams(window.location.search);
      const initialQuery = params.get("q")?.trim() ?? "";

      if (!initialQuery) {
        return;
      }

      setQuery(initialQuery);
      await searchPeople(initialQuery);
    };

    void runInitialSearch();
  }, []);

  async function searchPeople(searchValue = query) {
    const trimmedQuery = searchValue.trim();

    if (trimmedQuery.length < 2) {
      setPeople([]);
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
        `/api/users/search?q=${encodeURIComponent(trimmedQuery)}&limit=20`,
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
            : "Unable to search people.",
        );
      }

      const nextPeople = "people" in data ? data.people : [];

      setPeople(nextPeople);

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

            return [person.id, Boolean(relationshipData.following)] as const;
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
          : "Unable to search people.",
      );
      setPeople([]);
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

    window.history.replaceState(
      null,
      "",
      `/explore?${params.toString()}`,
    );

    await searchPeople(trimmedQuery);
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
      const response = await fetch(`/api/users/${personId}/follow`, {
        method: isFollowing ? "DELETE" : "POST",
      });

      const data = (await response.json().catch(() => ({}))) as
        | { error?: string }
        | Record<string, never>;

      if (response.status === 401) {
        router.push("/auth");
        return;
      }

      if (!response.ok) {
        throw new Error(
          "error" in data && data.error
            ? data.error
            : "Unable to update follow status.",
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

  return (
    <main className="min-h-screen bg-[var(--background)]">
      <div className="mx-auto min-h-screen w-full max-w-5xl px-5 py-6 sm:px-8">
        <header className="flex items-center justify-between border-b border-[var(--border)] pb-5">
          <div>
            <p className="text-xl font-semibold tracking-[-0.03em]">
              Agoré
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Explore people on the platform.
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/home")}
            className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium transition hover:border-[var(--accent)]"
          >
            Home
          </button>
        </header>

        <section className="py-10 sm:py-14">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
              Explore
            </p>

            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
              Find people.
            </h1>

            <p className="mt-4 leading-7 text-[var(--muted)]">
              Search usernames and display names, then follow people you want
              to keep up with.
            </p>
          </div>

          <form
            onSubmit={handleSearch}
            className="mt-8 flex flex-col gap-3 sm:flex-row"
          >
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search people…"
              minLength={2}
              maxLength={50}
              className="min-w-0 flex-1 border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
            />

            <button
              type="submit"
              disabled={searching}
              className="rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {searching ? "Searching…" : "Search"}
            </button>
          </form>

          {error ? (
            <div className="mt-5 border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
              {error}
            </div>
          ) : null}

          <div className="mt-10">
            {!searched ? (
              <div className="border border-[var(--border)] bg-[var(--surface)] p-6">
                <p className="font-medium">Search for someone.</p>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  Try a username or part of a display name.
                </p>
              </div>
            ) : searching ? (
              <div className="border border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-[var(--muted)]">
                Searching people…
              </div>
            ) : people.length === 0 ? (
              <div className="border border-[var(--border)] bg-[var(--surface)] p-6">
                <p className="font-medium">No people found.</p>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  Try a different name or username.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {people.map((person) => {
                  const isFollowing = Boolean(following[person.id]);
                  const relationshipLoading = Boolean(
                    loadingRelationship[person.id],
                  );

                  return (
                    <article
                      key={person.id}
                      className="border border-[var(--border)] bg-[var(--surface)] p-5"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() =>
                              router.push(`/profile/${person.id}`)
                            }
                            className="text-left"
                          >
                            <p className="truncate font-semibold transition hover:text-[var(--accent)]">
                              {person.display_name}
                            </p>
                            <p className="mt-1 text-sm text-[var(--muted)]">
                              @{person.username}
                            </p>
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => void toggleFollow(person.id)}
                          disabled={relationshipLoading}
                          className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
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

                      {person.bio ? (
                        <p className="mt-5 text-sm leading-6 text-[var(--muted)]">
                          {person.bio}
                        </p>
                      ) : (
                        <p className="mt-5 text-sm text-[var(--muted)]">
                          No bio yet.
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}