import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Compass,
  Home,
  MessageCircle,
  PenLine,
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

  const profilePath =
    `/profile/${encodeURIComponent(user.id)}`;

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto min-h-screen w-full max-w-[1440px] px-4 pb-24 sm:px-6 lg:px-8 lg:pb-0">
        <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[color:var(--background)]/95 backdrop-blur">
          <div className="flex min-h-[70px] items-center justify-between gap-4 sm:min-h-[72px]">
            <Link
              href="/home"
              className="flex items-center gap-3"
              aria-label="Agoré home"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--accent)] text-sm font-black tracking-[-0.04em] text-white shadow-sm">
                A
              </span>

              <div className="hidden sm:block">
                <p className="text-base font-bold tracking-[-0.03em]">
                  Agoré
                </p>

                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
                  Your social space
                </p>
              </div>
            </Link>

            <nav className="hidden items-center gap-1 md:flex">
              <Link
                href="/home"
                className="rounded-full bg-[var(--surface)] px-4 py-2.5 text-sm font-semibold text-[var(--foreground)] shadow-sm"
              >
                Home
              </Link>

              <Link
                href="/app/explore"
                className="rounded-full px-4 py-2.5 text-sm font-medium text-[var(--muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
              >
                Explore
              </Link>

              <Link
                href="/messages"
                className="rounded-full px-4 py-2.5 text-sm font-medium text-[var(--muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
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

              <form action={signOut}>
                <button
                  type="submit"
                  className="hidden rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium transition hover:border-[var(--accent)] sm:block"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </header>

        <div className="grid gap-8 py-5 sm:py-6 lg:grid-cols-[220px_minmax(0,1fr)_260px] lg:gap-10 lg:py-8">
          <aside className="hidden lg:block">
            <div className="sticky top-[104px] space-y-5">
              <section>
                <p className="px-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
                  Navigate
                </p>

                <nav className="mt-3 space-y-1">
                  <Link
                    href="/home"
                    className="flex items-center gap-3 rounded-2xl bg-[var(--surface)] px-3.5 py-3 text-sm font-semibold shadow-sm"
                  >
                    <Home size={18} />
                    Home
                  </Link>

                  <Link
                    href="/app/explore"
                    className="flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-medium text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
                  >
                    <Compass size={18} />
                    Explore
                  </Link>

                  <Link
                    href="/messages"
                    className="flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-medium text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
                  >
                    <MessageCircle size={18} />
                    Messages
                  </Link>

                  <Link
                    href={profilePath}
                    className="flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-medium text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
                  >
                    <UserRound size={18} />
                    Your profile
                  </Link>
                </nav>
              </section>

              <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                    <PenLine size={17} />
                  </span>

                  <div>
                    <p className="text-sm font-semibold">
                      Make some noise.
                    </p>

                    <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                      A thought, a question, a moment — put it out there.
                    </p>
                  </div>
                </div>
              </section>
            </div>
          </aside>

          <section className="min-w-0">
            <div className="mb-6 overflow-hidden rounded-[1.75rem] border border-[var(--border)] bg-[var(--surface)] sm:mb-7 sm:rounded-[2rem]">
              <div className="relative px-5 py-7 sm:px-8 sm:py-9">
                <div className="absolute right-[-80px] top-[-110px] h-64 w-64 rounded-full bg-[var(--accent-soft)] blur-3xl" />

                <div className="relative max-w-2xl">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                    Home
                  </div>

                  <h1 className="mt-4 max-w-2xl text-[2.55rem] font-semibold leading-[0.98] tracking-[-0.06em] sm:text-5xl sm:leading-none lg:text-[3.6rem]">
                    Good to see you,{" "}
                    {profile.display_name.split(" ")[0]}.
                  </h1>

                  <p className="mt-4 max-w-xl text-[15px] leading-7 text-[var(--muted)] sm:text-[17px]">
                    This is your corner of Agoré — see what people are saying,
                    join the conversation, and leave something of your own.
                  </p>

                  <div className="mt-6 flex flex-wrap gap-2 sm:mt-7">
                    <Link
                      href="/app/explore"
                      className="rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                    >
                      Explore Agoré
                    </Link>

                    <Link
                      href={profilePath}
                      className="rounded-full border border-[var(--border)] bg-[var(--background)] px-5 py-2.5 text-sm font-semibold transition hover:border-[var(--accent)]"
                    >
                      View your profile
                    </Link>
                  </div>
                </div>
              </div>

              <div className="grid border-t border-[var(--border)] sm:grid-cols-3">
                <div className="px-5 py-4 sm:px-6">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                    Share
                  </p>

                  <p className="mt-1 text-sm font-semibold">
                    Put your thoughts out there.
                  </p>
                </div>

                <div className="border-t border-[var(--border)] px-5 py-4 sm:border-l sm:border-t-0 sm:px-6">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                    Connect
                  </p>

                  <p className="mt-1 text-sm font-semibold">
                    Follow people worth knowing.
                  </p>
                </div>

                <div className="border-t border-[var(--border)] px-5 py-4 sm:border-l sm:border-t-0 sm:px-6">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                    Converse
                  </p>

                  <p className="mt-1 text-sm font-semibold">
                    Take the conversation private.
                  </p>
                </div>
              </div>
            </div>

            <PostFeed />
          </section>

          <aside className="hidden lg:block">
            <div className="sticky top-[104px] space-y-5">
              <section className="rounded-[1.75rem] border border-[var(--border)] bg-[var(--surface)] p-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-soft)] text-sm font-bold text-[var(--accent)]">
                    {initials}
                  </span>

                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      {profile.display_name}
                    </p>

                    <p className="mt-1 truncate text-sm text-[var(--muted)]">
                      @{profile.username}
                    </p>
                  </div>
                </div>

                <Link
                  href={profilePath}
                  className="mt-5 flex w-full items-center justify-center rounded-full border border-[var(--border)] px-4 py-2.5 text-sm font-semibold transition hover:border-[var(--accent)]"
                >
                  Open profile
                </Link>
              </section>

              <section className="rounded-[1.75rem] border border-[var(--border)] bg-[var(--surface)] p-5">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-bold">
                    Keep exploring
                  </p>

                  <Compass
                    size={18}
                    className="text-[var(--accent)]"
                  />
                </div>

                <div className="mt-4 space-y-2">
                  <Link
                    href="/app/explore"
                    className="flex items-center justify-between rounded-2xl bg-[var(--background)] px-3.5 py-3 transition hover:bg-[var(--surface-muted)]"
                  >
                    <span className="text-sm font-medium">
                      Find people and posts
                    </span>

                    <Compass
                      size={16}
                      className="text-[var(--muted)]"
                    />
                  </Link>

                  <Link
                    href="/messages"
                    className="flex items-center justify-between rounded-2xl bg-[var(--background)] px-3.5 py-3 transition hover:bg-[var(--surface-muted)]"
                  >
                    <span className="text-sm font-medium">
                      Open your messages
                    </span>

                    <MessageCircle
                      size={16}
                      className="text-[var(--muted)]"
                    />
                  </Link>

                  <Link
                    href={profilePath}
                    className="flex items-center justify-between rounded-2xl bg-[var(--background)] px-3.5 py-3 transition hover:bg-[var(--surface-muted)]"
                  >
                    <span className="text-sm font-medium">
                      Manage your profile
                    </span>

                    <Settings
                      size={16}
                      className="text-[var(--muted)]"
                    />
                  </Link>
                </div>
              </section>

              <div className="px-1 text-xs leading-5 text-[var(--muted)]">
                Agoré is built around people, conversations, and the things
                worth sharing.
              </div>
            </div>
          </aside>
        </div>

        <footer className="hidden border-t border-[var(--border)] py-6 lg:block">
          <div className="flex flex-col gap-2 text-xs text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between">
            <p>Agoré · Your social space.</p>

            <Link
              href={profilePath}
              className="font-semibold transition hover:text-[var(--foreground)]"
            >
              @{profile.username}
            </Link>
          </div>
        </footer>

        <nav
          aria-label="Mobile navigation"
          className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center justify-between rounded-[1.5rem] border border-[var(--border)] bg-[color:var(--surface)]/95 px-2 py-2 shadow-[0_18px_50px_rgba(0,0,0,0.14)] backdrop-blur md:hidden"
        >
          <Link
            href="/home"
            className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl bg-[var(--background)] px-2 py-2 text-[var(--accent)]"
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