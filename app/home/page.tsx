import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowUpRight,
  Compass,
  Home,
  MessageCircle,
  Settings,
  Sparkles,
  UserRound,
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

            <div className="flex items-center gap-2">
              <Link
                href={profilePath}
                className="group flex items-center gap-2.5 rounded-full border border-[var(--border)] bg-[var(--surface)] py-1.5 pl-1.5 pr-3 transition hover:border-[var(--accent)]"
              >
                <AgoreAvatar
                  avatarPath={profile.avatar_path}
                  name={profile.display_name}
                  className="h-8 w-8"
                  textClassName="text-[10px]"
                />

                <span className="hidden max-w-36 truncate text-sm font-semibold sm:block">
                  {profile.display_name}
                </span>
              </Link>

              <Link
                href="/settings"
                className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
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
        </header>

        <div className="grid gap-8 py-6 lg:grid-cols-[210px_minmax(0,1fr)_250px] lg:gap-9 lg:py-8">
          <aside className="hidden lg:block">
            <div className="sticky top-[104px] space-y-5">
              <section>
                <div className="flex items-end justify-between px-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
                      Navigate
                    </p>

                    <p className="mt-1 text-sm font-semibold">
                      Your space
                    </p>
                  </div>

                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
                    01
                  </span>
                </div>

                <div className="mt-3">
                  <AgoreDesktopNav
                    profilePath={profilePath}
                  />
                </div>
              </section>

              <section className="overflow-hidden rounded-[1.8rem] border border-[var(--border)] bg-[var(--surface)]">
                <div className="relative overflow-hidden bg-[var(--foreground)] px-4 py-5 text-[var(--background)]">
                  <div className="absolute -right-6 -top-8 h-24 w-24 rounded-full border-[12px] border-[var(--accent)] opacity-80" />
                  <div className="absolute bottom-[-20px] left-[-20px] h-16 w-16 rounded-full bg-[var(--accent)] opacity-35" />

                  <div className="relative">
                    <Sparkles
                      size={17}
                      className="text-[var(--accent)]"
                    />

                    <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.18em] opacity-60">
                      Agoré note
                    </p>

                    <p className="mt-2 text-sm font-semibold leading-5">
                      Good spaces are built one conversation at a time.
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
            <section className="relative mb-7 overflow-hidden rounded-[2.2rem] border border-[var(--border)] bg-[var(--surface)]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_12%,var(--accent-soft),transparent_29%)]" />

              <div className="absolute right-[-70px] top-[-90px] h-64 w-64 rounded-full border-[34px] border-[var(--accent-soft)] opacity-80" />

              <div className="absolute bottom-[-90px] left-[38%] h-52 w-52 rounded-full border border-[var(--border)] opacity-60" />

              <div className="relative grid lg:grid-cols-[minmax(0,1fr)_230px]">
                <div className="px-5 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />

                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
                      Your Agoré
                    </p>
                  </div>

                  <h1 className="mt-5 max-w-3xl text-[2.8rem] font-semibold leading-[0.94] tracking-[-0.07em] sm:text-5xl lg:text-[4.4rem]">
                    Good to see you,
                    <br />
                    <span className="text-[var(--accent)]">
                      {firstName}.
                    </span>
                  </h1>

                  <p className="mt-6 max-w-xl text-[15px] leading-7 text-[var(--muted)] sm:text-base sm:leading-7">
                    See what people are saying, find something worth
                    following, and add your own voice to the room.
                  </p>

                  <div className="mt-7 flex flex-wrap gap-2">
                    <Link
                      href="/app/explore"
                      className="inline-flex items-center gap-2 rounded-full bg-[var(--foreground)] px-4 py-2.5 text-sm font-semibold text-[var(--background)] transition hover:bg-[var(--accent)] hover:text-white"
                    >
                      Explore
                      <ArrowUpRight size={15} />
                    </Link>

                    <Link
                      href="/messages"
                      className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)] hover:bg-[var(--surface-muted)]"
                    >
                      Messages
                      <MessageCircle size={15} />
                    </Link>
                  </div>
                </div>

                <div className="relative flex flex-col justify-between overflow-hidden border-t border-[var(--border)] bg-[var(--foreground)] px-6 py-7 text-[var(--background)] lg:border-l lg:border-t-0 lg:px-7 lg:py-8">
                  <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-[var(--accent)] opacity-70" />
                  <div className="absolute bottom-[-34px] left-[-34px] h-24 w-24 rounded-full border-[14px] border-[var(--accent)] opacity-30" />

                  <div className="relative">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] opacity-50">
                      You are here
                    </p>

                    <AgoreAvatar
                      avatarPath={profile.avatar_path}
                      name={profile.display_name}
                      className="mt-5 h-16 w-16 border-2 border-[var(--background)]/20"
                      textClassName="text-lg"
                    />

                    <p className="mt-4 text-lg font-semibold tracking-[-0.03em]">
                      {profile.display_name}
                    </p>

                    <p className="mt-1 text-sm opacity-55">
                      @{profile.username}
                    </p>
                  </div>

                  <Link
                    href={profilePath}
                    className="relative mt-8 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--accent)] transition hover:text-[var(--accent-strong)]"
                  >
                    Open profile
                    <ArrowUpRight size={15} />
                  </Link>
                </div>
              </div>

              <div className="relative grid border-t border-[var(--border)] sm:grid-cols-3">
                <div className="px-5 py-4 sm:px-6">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--accent)]">
                    01 / Share
                  </p>

                  <p className="mt-1.5 text-sm font-semibold">
                    Put something into the space.
                  </p>
                </div>

                <div className="border-t border-[var(--border)] px-5 py-4 sm:border-l sm:border-t-0 sm:px-6">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--accent)]">
                    02 / Discover
                  </p>

                  <p className="mt-1.5 text-sm font-semibold">
                    Find people worth following.
                  </p>
                </div>

                <div className="border-t border-[var(--border)] px-5 py-4 sm:border-l sm:border-t-0 sm:px-6">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--accent)]">
                    03 / Converse
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
              <section className="relative overflow-hidden rounded-[1.8rem] border border-[var(--border)] bg-[var(--surface)] p-5">
                <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[var(--accent-soft)]" />

                <div className="relative">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
                        Your corner
                      </p>

                      <p className="mt-1 text-sm font-semibold">
                        Keep your presence close.
                      </p>
                    </div>

                    <UserRound
                      size={18}
                      className="text-[var(--accent)]"
                    />
                  </div>

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
                    className="mt-5 flex w-full items-center justify-center rounded-full bg-[var(--foreground)] px-4 py-2.5 text-sm font-semibold text-[var(--background)] transition hover:bg-[var(--accent)] hover:text-white"
                  >
                    Open profile
                  </Link>
                </div>
              </section>

              <section className="overflow-hidden rounded-[1.8rem] border border-[var(--border)] bg-[var(--surface)]">
                <div className="flex items-center justify-between px-5 py-5">
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

                <div className="border-t border-[var(--border)]">
                  <Link
                    href="/app/explore"
                    className="group flex items-center justify-between border-b border-[var(--border)] px-5 py-4 transition hover:bg-[var(--background)]"
                  >
                    <span>
                      <span className="block text-sm font-semibold">
                        Discover
                      </span>

                      <span className="mt-1 block text-xs text-[var(--muted)]">
                        People and posts
                      </span>
                    </span>

                    <ArrowUpRight
                      size={15}
                      className="text-[var(--muted)] transition group-hover:text-[var(--accent)]"
                    />
                  </Link>

                  <Link
                    href="/messages"
                    className="group flex items-center justify-between border-b border-[var(--border)] px-5 py-4 transition hover:bg-[var(--background)]"
                  >
                    <span>
                      <span className="block text-sm font-semibold">
                        Converse
                      </span>

                      <span className="mt-1 block text-xs text-[var(--muted)]">
                        Continue a conversation
                      </span>
                    </span>

                    <ArrowUpRight
                      size={15}
                      className="text-[var(--muted)] transition group-hover:text-[var(--accent)]"
                    />
                  </Link>

                  <Link
                    href="/settings"
                    className="group flex items-center justify-between px-5 py-4 transition hover:bg-[var(--background)]"
                  >
                    <span>
                      <span className="block text-sm font-semibold">
                        Settings
                      </span>

                      <span className="mt-1 block text-xs text-[var(--muted)]">
                        Tune your space
                      </span>
                    </span>

                    <Settings
                      size={15}
                      className="text-[var(--muted)] transition group-hover:text-[var(--accent)]"
                    />
                  </Link>
                </div>
              </section>

              <section className="rounded-[1.8rem] border border-[var(--accent)]/25 bg-[var(--accent-soft)] p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
                    Agoré thought
                  </p>

                  <Sparkles
                    size={15}
                    className="text-[var(--accent)]"
                  />
                </div>

                <p className="mt-3 text-sm font-semibold leading-6">
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

        <AgoreMobileNav
          profilePath={profilePath}
          avatarPath={profile.avatar_path}
          profileName={profile.display_name}
        />
      </div>
    </main>
  );
}