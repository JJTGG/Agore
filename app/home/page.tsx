import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowUpRight,
  Bell,
  Compass,
  MessageCircle,
  Plus,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";

import AgoreAvatar from "@/components/agore-avatar";
import AgoreDesktopNav from "@/components/agore-desktop-nav";
import AgoreMobileNav from "@/components/agore-mobile-nav";
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
    .select("display_name, username, avatar_path")
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

  const profilePath = `/profile/${encodeURIComponent(user.id)}`;

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto min-h-screen w-full max-w-[1440px] px-4 pb-28 sm:px-6 lg:px-8 lg:pb-0">
        <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[color:var(--background)]/95 backdrop-blur">
          <div className="flex min-h-[72px] items-center justify-between gap-3">
            <Link
              href="/home"
              className="group flex shrink-0 items-center gap-3"
              aria-label="Agoré home"
            >
              <span className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl bg-[var(--foreground)] text-sm font-black tracking-[-0.04em] text-[var(--background)] transition duration-200 group-hover:bg-[var(--accent)] group-hover:text-white">
                <span className="relative z-10">
                  A
                </span>

                <span className="absolute -right-3 -top-3 h-7 w-7 rounded-full bg-[var(--accent)] opacity-70 transition duration-200 group-hover:scale-150" />
              </span>

              <span className="hidden sm:block">
                <span className="block text-base font-bold tracking-[-0.04em]">
                  Agoré
                </span>

                <span className="block text-[10px] font-medium text-[var(--muted)]">
                  Your social space
                </span>
              </span>
            </Link>

            <div className="flex items-center gap-1 sm:gap-2">
              <Link
                href="/app/explore"
                aria-label="Explore and search Agoré"
                title="Explore"
                className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
              >
                <Search size={19} />
              </Link>

              <Link
                href="/notifications"
                aria-label="Notifications"
                title="Notifications"
                className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
              >
                <Bell size={19} />
              </Link>

              <Link
                href="/settings"
                aria-label="Settings"
                title="Settings"
                className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
              >
                <Settings size={18} />
              </Link>

              <form action={signOut}>
                <button
                  type="submit"
                  className="hidden rounded-full border border-[var(--border)] px-3.5 py-2 text-xs font-semibold transition hover:border-[var(--foreground)] sm:block"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </header>

        <div className="grid items-start gap-7 py-5 sm:gap-8 lg:grid-cols-[210px_minmax(0,1fr)_260px] lg:gap-9 lg:py-7">
          <aside className="hidden lg:block">
            <div className="sticky top-[104px] space-y-6">
              <section>
                <div className="px-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
                    Your space
                  </p>

                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Move at your own pace.
                  </p>
                </div>

                <div className="mt-4">
                  <AgoreDesktopNav
                    profilePath={profilePath}
                  />
                </div>
              </section>

              <section className="border-t border-[var(--border)] px-3 pt-5">
                <Sparkles
                  size={17}
                  className="text-[var(--accent)]"
                />

                <p className="mt-3 text-sm font-semibold leading-5">
                  Every conversation starts somewhere.
                </p>

                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                  Discover perspectives, share ideas, and
                  find people whose conversations matter to you.
                </p>

                <Link
                  href="/app/explore"
                  className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent)] transition hover:opacity-80"
                >
                  Explore Agoré
                  <ArrowUpRight size={13} />
                </Link>
              </section>
            </div>
          </aside>

          <section className="min-w-0">
            <PostFeed mode="home" />
          </section>

          <aside className="hidden lg:block">
            <div className="sticky top-[104px] space-y-5">
              <section className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface)] p-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
                  Your corner
                </p>

                <div className="mt-5 flex items-center gap-3">
                  <AgoreAvatar
                    avatarPath={profile.avatar_path}
                    name={profile.display_name}
                    className="h-12 w-12"
                    textClassName="text-sm"
                  />

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
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-full border border-[var(--border)] px-4 py-2.5 text-sm font-semibold transition hover:border-[var(--accent)] hover:bg-[var(--background)]"
                >
                  View profile
                  <ArrowUpRight size={14} />
                </Link>
              </section>

              <section className="overflow-hidden rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface)]">
                <div className="px-5 py-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
                    Around Agoré
                  </p>

                  <p className="mt-1 text-sm font-semibold">
                    Where to next?
                  </p>
                </div>

                <div className="border-t border-[var(--border)]">
                  <Link
                    href="/create"
                    className="group flex items-center gap-3 border-b border-[var(--border)] px-5 py-4 transition hover:bg-[var(--background)]"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                      <Plus size={17} />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">
                        Create a post
                      </span>

                      <span className="mt-1 block text-xs text-[var(--muted)]">
                        Share what is on your mind
                      </span>
                    </span>

                    <ArrowUpRight
                      size={15}
                      className="shrink-0 text-[var(--muted)] transition group-hover:text-[var(--accent)]"
                    />
                  </Link>

                  <Link
                    href="/app/explore"
                    className="group flex items-center gap-3 border-b border-[var(--border)] px-5 py-4 transition hover:bg-[var(--background)]"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--background)] text-[var(--muted)]">
                      <Compass size={17} />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">
                        Explore
                      </span>

                      <span className="mt-1 block text-xs text-[var(--muted)]">
                        Find people and posts
                      </span>
                    </span>

                    <ArrowUpRight
                      size={15}
                      className="shrink-0 text-[var(--muted)] transition group-hover:text-[var(--accent)]"
                    />
                  </Link>

                  <Link
                    href="/messages"
                    className="group flex items-center gap-3 px-5 py-4 transition hover:bg-[var(--background)]"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--background)] text-[var(--muted)]">
                      <MessageCircle size={17} />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">
                        Messages
                      </span>

                      <span className="mt-1 block text-xs text-[var(--muted)]">
                        Continue a conversation
                      </span>
                    </span>

                    <ArrowUpRight
                      size={15}
                      className="shrink-0 text-[var(--muted)] transition group-hover:text-[var(--accent)]"
                    />
                  </Link>
                </div>
              </section>

              <p className="px-2 text-xs leading-5 text-[var(--muted)]">
                A good conversation does not need a big audience.
                It just needs a place to begin.
              </p>
            </div>
          </aside>
        </div>

        <footer className="hidden border-t border-[var(--border)] py-5 lg:block">
          <div className="flex items-center justify-between gap-4 text-xs text-[var(--muted)]">
            <p>Agoré · Your social space.</p>

            <div className="flex items-center gap-4">
              <Link
                href={profilePath}
                className="transition hover:text-[var(--foreground)]"
              >
                @{profile.username}
              </Link>

              <Link
                href="/settings"
                className="transition hover:text-[var(--foreground)]"
              >
                Settings
              </Link>

              <Link
                href="/notifications"
                className="transition hover:text-[var(--foreground)]"
              >
                Notifications
              </Link>
            </div>
          </div>
        </footer>

        <AgoreMobileNav
          profilePath={profilePath}
          avatarPath={profile.avatar_path}
          profileName={profile.display_name}
        />
      </div>
    </main>
  );
}