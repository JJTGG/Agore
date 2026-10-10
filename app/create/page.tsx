import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  Bell,
  MessageCircle,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";

import AgoreAvatar from "@/components/agore-avatar";
import AgoreDesktopNav from "@/components/agore-desktop-nav";
import AgoreMobileNav from "@/components/agore-mobile-nav";
import PostFeed from "@/app/home/post-feed";
import { createClient } from "@/lib/supabase/server";

export default async function CreatePage() {
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
                <span className="relative z-10">A</span>
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

        <div className="grid gap-8 py-6 lg:grid-cols-[210px_minmax(0,1fr)_250px] lg:gap-9 lg:py-8">
          <aside className="hidden lg:block">
            <div className="sticky top-[104px] space-y-5">
              <section>
                <div className="px-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
                    Navigate
                  </p>
                  <p className="mt-1 text-sm font-semibold">
                    Your space
                  </p>
                </div>

                <div className="mt-3">
                  <AgoreDesktopNav profilePath={profilePath} />
                </div>
              </section>

              <section className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface)] p-4">
                <Sparkles
                  size={18}
                  className="text-[var(--accent)]"
                />
                <p className="mt-3 text-sm font-semibold">
                  Every conversation starts somewhere.
                </p>
                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                  Share a thought, ask a question, or bring something
                  interesting into the space.
                </p>
              </section>
            </div>
          </aside>

          <section className="mx-auto min-w-0 w-full max-w-3xl">
            <Link
              href="/home"
              className="inline-flex items-center gap-2 rounded-full px-2 py-2 text-sm font-medium text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
            >
              <ArrowLeft size={16} />
              Back to Home
            </Link>

            <div className="mb-6 mt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
                Create
              </p>

              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.055em] sm:text-4xl">
                Put it into words.
              </h1>

              <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted)] sm:text-base">
                Share something worth saying. Add media when it helps
                tell the story.
              </p>
            </div>

            <div className="mb-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--muted)]">
                Up to 2,000 characters
              </span>
              <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--muted)]">
                Up to 10 attachments
              </span>
              <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--muted)]">
                15 MB per file
              </span>
            </div>

            <PostFeed mode="create" />

            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <Sparkles
                size={18}
                className="mt-0.5 shrink-0 text-[var(--accent)]"
              />
              <div>
                <p className="text-sm font-medium">
                  Your voice belongs here.
                </p>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                  Keep it respectful. Posts remain subject to Agoré's
                  community and moderation rules.
                </p>
              </div>
            </div>
          </section>

          <aside className="hidden lg:block">
            <div className="sticky top-[104px] space-y-4">
              <section className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface)] p-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
                  Your post
                </p>

                <div className="mt-4 flex items-center gap-3">
                  <AgoreAvatar
                    avatarPath={profile.avatar_path}
                    name={profile.display_name}
                    className="h-11 w-11"
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

                <p className="mt-4 text-xs leading-5 text-[var(--muted)]">
                  Your post will appear in the relevant feed once
                  it has been published successfully.
                </p>
              </section>

              <section className="rounded-[1.5rem] border border-[var(--border)] p-5">
                <p className="text-sm font-semibold">
                  Keep exploring
                </p>

                <Link
                  href="/app/explore"
                  className="mt-3 flex items-center justify-between gap-3 text-sm text-[var(--muted)] transition hover:text-[var(--accent)]"
                >
                  Discover people and posts
                  <ArrowUpRight size={15} />
                </Link>

                <Link
                  href="/messages"
                  className="mt-3 flex items-center justify-between gap-3 text-sm text-[var(--muted)] transition hover:text-[var(--accent)]"
                >
                  Continue a conversation
                  <MessageCircle size={15} />
                </Link>

                <Link
                  href="/settings"
                  className="mt-3 flex items-center justify-between gap-3 text-sm text-[var(--muted)] transition hover:text-[var(--accent)]"
                >
                  Tune your space
                  <Settings size={15} />
                </Link>
              </section>
            </div>
          </aside>
        </div>

        <AgoreMobileNav
          profilePath={profilePath}
          avatarPath={profile.avatar_path}
          profileName={profile.display_name}
        />
      </div>
    </main>
  );
}