import Link from "next/link";
import {
  ArrowUpRight,
  Compass,
  MessageCircle,
  Plus,
} from "lucide-react";

import PostFeed from "@/app/home/post-feed";

export default function HomePage() {
  return (
    <main className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-9">
      <section className="min-w-0">
        <PostFeed mode="home" />
      </section>

      <aside className="hidden lg:block">
        <div className="sticky top-[104px] space-y-5">
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
    </main>
  );
}