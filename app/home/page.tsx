import Link from "next/link";
import { redirect } from "next/navigation";
import {
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

  const profilePath =
    `/profile/${encodeURIComponent(user.id)}`;

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto min-h-screen w-full max-w-[1180px] px-4 pb-10 sm:px-6 lg:px-8">
        <header className="sticky top-0 z-40 bg-[color:var(--background)]/95 backdrop-blur">
          <div className="flex min-h-[76px] items-center justify-between gap-5 border-b border-[var(--border)]">
            <Link
              href="/home"
              className="group flex items-center gap-3"
              aria-label="Agoré home"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[var(--foreground)] text-sm font-black tracking-[-0.04em] text-[var(--background)] transition group-hover:bg-[var(--accent)] group-hover:text-white">
                A
              </span>

              <div>
                <p className="text-[17px] font-bold tracking-[-0.04em]">
                  Agoré
                </p>

                <p className="hidden text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)] sm:block">
                  a place to gather
                </p>
              </div>
            </Link>

            <nav className="hidden items-center gap-7 md:flex">
              <Link
                href="/home"
                className="relative py-2 text-sm font-semibold"
              >
                Home

                <span className="absolute inset-x-0 -bottom-[1px] h-0.5 rounded-full bg-[var(--accent)]" />
              </Link>

              <Link
                href="/app/explore"
                className="py-2 text-sm font-medium text-[var(--muted)] transition hover:text-[var(--foreground)]"
              >
                Explore
              </Link>

              <Link
                href="/messages"
                className="py-2 text-sm font-medium text-[var(--muted)] transition hover:text-[var(--foreground)]"
              >
                Messages
              </Link>
            </nav>

            <div className="flex items-center gap-2">
              <Link
                href={profilePath}
                className="group flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-xs font-bold text-[var(--accent)] transition hover:border-[var(--accent)]"
                aria-label="Your profile"
              >
                <span>{initials}</span>
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
                  className="hidden rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--muted)] transition hover:border-[var(--foreground)] hover:text-[var(--foreground)] sm:block"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>

          <nav className="flex gap-5 overflow-x-auto border-b border-[var(--border)] py-3 md:hidden">
            <Link
              href="/home"
              className="flex shrink-0 items-center gap-1.5 text-sm font-semibold"
            >
              <Home size={15} />
              Home
            </Link>

            <Link
              href="/app/explore"
              className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-[var(--muted)]"
            >
              <Compass size={15} />
              Explore
            </Link>

            <Link
              href="/messages"
              className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-[var(--muted)]"
            >
              <MessageCircle size={15} />
              Messages
            </Link>

            <Link
              href={profilePath}
              className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-[var(--muted)]"
            >
              <UserRound size={15} />
              Profile
            </Link>
          </nav>
        </header>

        <section className="py-10 sm:py-14 lg:py-16">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-end lg:gap-14">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--accent)]">
                The square
              </p>

              <h1 className="mt-4 max-w-3xl text-[3.2rem] font-semibold leading-[0.94] tracking-[-0.07em] sm:text-6xl lg:text-[5rem]">
                Welcome back,
                <br />
                {profile.display_name.split(" ")[0]}.
              </h1>

              <p className="mt-6 max-w-2xl text-base leading-7 text-[var(--muted)] sm:text-lg sm:leading-8">
                Agoré is where people meet ideas, conversations, and each
                other. See what is moving through your space.
              </p>
            </div>

            <div className="border-l border-[var(--border)] pl-5 lg:mb-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
                Signed in as
              </p>

              <p className="mt-2 text-lg font-semibold tracking-[-0.025em]">
                {profile.display_name}
              </p>

              <p className="mt-1 text-sm text-[var(--muted)]">
                @{profile.username}
              </p>

              <Link
                href={profilePath}
                className="mt-5 inline-flex text-sm font-semibold text-[var(--accent)] transition hover:opacity-70"
              >
                Open profile →
              </Link>
            </div>
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-[var(--border)] py-4 text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted)]">
            <span className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
              Share
            </span>

            <span>Follow people</span>

            <span>Join conversations</span>

            <span>Message directly</span>
          </div>
        </section>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,760px)_180px] lg:justify-center lg:gap-14">
          <section className="min-w-0">
            <PostFeed />
          </section>

          <aside className="hidden lg:block">
            <div className="sticky top-[104px] pt-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
                Your space
              </p>

              <nav className="mt-4 space-y-4">
                <Link
                  href="/home"
                  className="flex items-center gap-2 text-sm font-semibold"
                >
                  <Home
                    size={15}
                    className="text-[var(--accent)]"
                  />
                  Home
                </Link>

                <Link
                  href="/app/explore"
                  className="flex items-center gap-2 text-sm text-[var(--muted)] transition hover:text-[var(--foreground)]"
                >
                  <Compass size={15} />
                  Explore
                </Link>

                <Link
                  href="/messages"
                  className="flex items-center gap-2 text-sm text-[var(--muted)] transition hover:text-[var(--foreground)]"
                >
                  <MessageCircle size={15} />
                  Messages
                </Link>

                <Link
                  href={profilePath}
                  className="flex items-center gap-2 text-sm text-[var(--muted)] transition hover:text-[var(--foreground)]"
                >
                  <UserRound size={15} />
                  Profile
                </Link>
              </nav>

              <div className="mt-12 border-t border-[var(--border)] pt-5">
                <p className="text-xs leading-5 text-[var(--muted)]">
                  A social space should feel like somewhere people actually
                  gather — not another dashboard.
                </p>
              </div>
            </div>
          </aside>
        </div>

        <footer className="mt-14 flex flex-col gap-2 border-t border-[var(--border)] py-6 text-xs text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between">
          <p>Agoré · a place to gather.</p>

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
        </footer>
      </div>
    </main>
  );
}