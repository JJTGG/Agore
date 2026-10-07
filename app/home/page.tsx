import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowUpRight,
  Compass,
  Home,
  MessageCircle,
  Settings,
  UserRound,
} from "lucide-react";

import PostFeed from "./post-feed";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, username")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    redirect("/onboarding");
  }

  async function signOut() {
    "use server";

    const supabase = await createClient();

    await supabase.auth.signOut();

    redirect("/auth");
  }

  const initials =
    profile.display_name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(
        (part: string) =>
          part[0]?.toUpperCase() ?? "",
      )
      .join("") || "A";

  const firstName =
    profile.display_name.split(/\s+/)[0] ||
    "there";

  const profilePath =
    `/profile/${encodeURIComponent(user.id)}`;

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto min-h-screen w-full max-w-[1440px] px-4 pb-28 sm:px-6 lg:px-8 lg:pb-0">
        <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[color:var(--background)]/95 backdrop-blur">
          <div className="flex min-h-[72px] items-center justify-between gap-4">
            <Link
              href="/home"
              className="group flex items-center gap-3"
              aria-label="Agoré home"
            >
              <span className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl bg-[var(--foreground)] text-sm font-black tracking-[-0.04em] text-[var(--background)] transition duration-200 group-hover:bg-[var(--accent)] group-hover:text-white">
                <span className="relative z-10">
                  A
                </span>

                <span className="absolute -right-3 -top-3 h-7 w-7 rounded-full bg-[var(--accent)] opacity-70 transition duration-200 group-hover:scale-150" />
              </span>

              <div className="hidden sm:block">
                <p className="text-base font-bold tracking-[-0.04em]">
                  Agoré
                </p>

                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                  Your social space
                </p>
              </div>
            </Link>

            <nav className="hidden items-center gap-1 md:flex">
              <Link
                href="/home"
                className="rounded-full bg-[var(--surface)] px-4 py-2.5 text-sm font-semibold shadow-sm ring-1 ring-[var(--border)]"
              >
                Home
              </Link>

              <Link
                href="/app/explore"
                className="rounded-full px-4 py-2.5 text-sm font-medium text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
              >
                Explore
              </Link>

              <Link
                href="/messages"
                className="rounded-full px-4 py-2.5 text-sm font-medium text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
              >
                Messages
              </Link>
            </nav>

            <div className="flex items-center gap-2">
              <Link
                href={profilePath}
                className="flex items-center gap-2.5 rounded-full border border-[var(--border)] bg-[var(--surface)] py-1.5 pl-1.5 pr-3 transition hover:border-[var(--accent)]"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-soft)] text-xs font-bold text-[var(--accent)]">
                  {initials}
                </span>

                <span className="hidden max-w-32 truncate text-sm font-semibold sm:block">
                  {profile.display_name}
                </span>
              </Link>

              <Link
                href="/settings"
                className="hidden h-10 w-10 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)] sm:flex"
                aria-label="Settings"
              >
                <Settings size={18} />
              </Link>

              <form action={signOut}>
                <button
                  type="submit"
                  className="hidden rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium transition hover:border-[var(--foreground)] sm:block"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>

          <nav className="flex gap-2 overflow-x-auto pb-3 md:hidden">
            <Link
              href="/home"
              className="shrink-0 rounded-full bg-[var(--surface)] px-4 py-2 text-sm font-semibold shadow-sm"
            >
              Home
            </Link>

            <Link
              href="/app/explore"
              className="shrink-0 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--muted)]"
            >
              Explore
            </Link>

            <Link
              href="/messages"
              className="shrink-0 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--muted)]"
            >
              Messages
            </Link>

            <Link
              href={profilePath}
              className="shrink-0 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--muted)]"
            >
              Profile
            </Link>
          </nav>
        </header>

        <div className="grid gap-8 py-6 lg:grid-cols-[210px_minmax(0,1fr)_250px] lg:gap-9 lg:py-8">
          <aside className="hidden lg:block">
            <div className="sticky top-[104px] space-y-5">
              <section>
                <p className="px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
                  Your space
                </p>

                <nav className="mt-3 space-y-1">
                  <Link
                    href="/home"
                    className="flex items-center gap-3 rounded-2xl bg-[var(--foreground)] px-3.5 py-3 text-sm font-semibold text-[var(--background)]"
                  >
                    <Home size={17} />
                    Home
                  </Link>

                  <Link
                    href="/app/explore"
                    className="flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-medium text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
                  >
                    <Compass size={17} />
                    Explore
                  </Link>

                  <Link
                    href="/messages"
                    className="flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-medium text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
                  >
                    <MessageCircle size={17} />
                    Messages
                  </Link>

                  <Link
                    href={profilePath}
                    className="flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-medium text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
                  >
                    <UserRound size={17} />
                    Profile
                  </Link>
                </nav>
              </section>

              <section className="overflow-hidden rounded-[1.7rem] border border-[var(--border)] bg-[var(--surface)]">
                <div className="relative bg-[var(--foreground)] px-4 py-4 text-[var(--background)]">
                  <div className="absolute -right-4 -top-8 h-20 w-20 rounded-full bg-[var(--accent)] opacity-70" />

                  <div className="relative">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] opacity-60">
                      Agoré note
                    </p>

                    <p className="mt-2 text-sm font-semibold leading-5">
                      A place for thoughts to meet people.
                    </p>
                  </div>
                </div>

                <div className="px-4 py-4">
                  <p className="text-xs leading-5 text-[var(--muted)]">
                    Follow people, discover ideas, and take conversations
                    further.
                  </p>

                  <Link
                    href="/app/explore"
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent)]"
                  >
                    Explore Agoré
                    <ArrowUpRight size={13} />
                  </Link>
                </div>
              </section>
            </div>
          </aside>

          <section className="min-w-0">
            <section className="relative mb-7 overflow-hidden rounded-[2rem] border border-[var(--border)] bg-[var(--surface)]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_92%_8%,var(--accent-soft),transparent_31%)]" />

              <div className="absolute -right-12 bottom-[-85px] h-52 w-52 rounded-full border-[26px] border-[var(--accent-soft)] opacity-80" />

              <div className="relative px-5 py-7 sm:px-8 sm:py-9">
                <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_200px] lg:gap-10">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />

                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
                        Your Agoré
                      </p>
                    </div>

                    <h1 className="mt-4 max-w-2xl text-[2.7rem] font-semibold leading-[0.97] tracking-[-0.065em] sm:text-5xl lg:text-[4rem]">
                      Good to see you,
                      <br />
                      {firstName}.
                    </h1>

                    <p className="mt-5 max-w-xl text-[15px] leading-7 text-[var(--muted)] sm:text-base sm:leading-7">
                      See what people are saying, discover something new, and
                      add your own voice to the space.
                    </p>
                  </div>

                  <div className="flex flex-col justify-between border-l border-[var(--border)] pl-5">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
                        You
                      </p>

                      <p className="mt-2 text-lg font-semibold tracking-[-0.03em]">
                        {profile.display_name}
                      </p>

                      <p className="mt-1 text-sm text-[var(--muted)]">
                        @{profile.username}
                      </p>
                    </div>

                    <Link
                      href={profilePath}
                      className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--accent)] transition hover:opacity-70"
                    >
                      View profile
                      <ArrowUpRight size={15} />
                    </Link>
                  </div>
                </div>
              </div>

              <div className="relative grid border-t border-[var(--border)] sm:grid-cols-3">
                <div className="px-5 py-4 sm:px-6">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--accent)]">
                    Share
                  </p>

                  <p className="mt-1.5 text-sm font-semibold">
                    Put something into the space.
                  </p>
                </div>

                <div className="border-t border-[var(--border)] px-5 py-4 sm:border-l sm:border-t-0 sm:px-6">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--accent)]">
                    Discover
                  </p>

                  <p className="mt-1.5 text-sm font-semibold">
                    Find people worth following.
                  </p>
                </div>

                <div className="border-t border-[var(--border)] px-5 py-4 sm:border-l sm:border-t-0 sm:px-6">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--accent)]">
                    Converse
                  </p>

                  <p className="mt-1.5 text-sm font-semibold">
                    Turn posts into conversations.
                  </p>
                </div>
              </div>
            </section>

            <PostFeed />
          </section>

          <aside className="hidden lg:block">
            <div className="sticky top-[104px] space-y-5">
              <section className="relative overflow-hidden rounded-[1.7rem] border border-[var(--border)] bg-[var(--surface)] p-5">
                <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[var(--accent-soft)]" />

                <div className="relative">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
                    Your corner
                  </p>

                  <div className="mt-4 flex items-center gap-3">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-bold text-white">
                      {initials}
                    </span>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {profile.display_name}
                      </p>

                      <p className="mt-1 truncate text-xs text-[var(--muted)]">
                        @{profile.username}
                      </p>
                    </div>
                  </div>

                  <Link
                    href={profilePath}
                    className="mt-5 flex w-full items-center justify-center rounded-full bg-[var(--foreground)] px-4 py-2.5 text-sm font-semibold text-[var(--background)] transition hover:bg-[var(--accent)] hover:text-white"
                  >
                    Open profile
                  </Link>
                </div>
              </section>

              <section className="rounded-[1.7rem] border border-[var(--border)] bg-[var(--surface)] p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
                      Move around
                    </p>

                    <p className="mt-1.5 text-sm font-semibold">
                      There’s more here.
                    </p>
                  </div>

                  <Compass
                    size={19}
                    className="text-[var(--accent)]"
                  />
                </div>

                <div className="mt-5 space-y-2">
                  <Link
                    href="/app/explore"
                    className="group flex items-center justify-between rounded-2xl bg-[var(--background)] px-3.5 py-3 transition hover:bg-[var(--surface-muted)]"
                  >
                    <span className="text-sm font-medium">
                      Discover people & posts
                    </span>

                    <ArrowUpRight
                      size={15}
                      className="text-[var(--muted)] transition group-hover:text-[var(--accent)]"
                    />
                  </Link>

                  <Link
                    href="/messages"
                    className="group flex items-center justify-between rounded-2xl bg-[var(--background)] px-3.5 py-3 transition hover:bg-[var(--surface-muted)]"
                  >
                    <span className="text-sm font-medium">
                      Continue a conversation
                    </span>

                    <ArrowUpRight
                      size={15}
                      className="text-[var(--muted)] transition group-hover:text-[var(--accent)]"
                    />
                  </Link>

                  <Link
                    href="/settings"
                    className="group flex items-center justify-between rounded-2xl bg-[var(--background)] px-3.5 py-3 transition hover:bg-[var(--surface-muted)]"
                  >
                    <span className="text-sm font-medium">
                      Tune your space
                    </span>

                    <Settings
                      size={15}
                      className="text-[var(--muted)] transition group-hover:text-[var(--accent)]"
                    />
                  </Link>
                </div>
              </section>

              <section className="rounded-[1.7rem] border border-[var(--accent)]/20 bg-[var(--accent-soft)] p-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
                  Agoré thought
                </p>

                <p className="mt-2 text-sm font-semibold leading-6">
                  You don’t need a big audience to start a good conversation.
                </p>

                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                  One thought is enough to get things moving.
                </p>
              </section>
            </div>
          </aside>
        </div>

        <footer className="mt-12 hidden border-t border-[var(--border)] py-6 lg:block">
          <div className="flex flex-col gap-3 text-xs text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between">
            <p>Agoré · Your social space.</p>

            <div className="flex items-center gap-4">
              <Link
                href={profilePath}
                className="transition hover:text-[var(--foreground)]"
              >
                @{profile.username}
              </Link>

              <span aria-hidden="true">·</span>

              <Link
                href="/settings"
                className="transition hover:text-[var(--foreground)]"
              >
                Settings
              </Link>
            </div>
          </div>
        </footer>

        <nav
          aria-label="Mobile navigation"
          className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center justify-between rounded-[1.5rem] border border-[var(--border)] bg-[color:var(--surface)]/95 px-2 py-2 shadow-[0_18px_50px_rgba(0,0,0,0.14)] backdrop-blur md:hidden"
        >
          <Link
            href="/home"
            className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl bg-[var(--foreground)] px-2 py-2 text-[var(--background)]"
            aria-current="page"
          >
            <Home size={18} />

            <span className="text-[10px] font-semibold">
              Home
            </span>
          </Link>

          <Link
            href="/app/explore"
            className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[var(--muted)] transition hover:bg-[var(--background)] hover:text-[var(--foreground)]"
          >
            <Compass size={18} />

            <span className="text-[10px] font-semibold">
              Explore
            </span>
          </Link>

          <Link
            href="/messages"
            className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[var(--muted)] transition hover:bg-[var(--background)] hover:text-[var(--foreground)]"
          >
            <MessageCircle size={18} />

            <span className="text-[10px] font-semibold">
              Messages
            </span>
          </Link>

          <Link
            href={profilePath}
            className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[var(--muted)] transition hover:bg-[var(--background)] hover:text-[var(--foreground)]"
          >
            <UserRound size={18} />

            <span className="text-[10px] font-semibold">
              Profile
            </span>
          </Link>
        </nav>
      </div>
    </main>
  );
}