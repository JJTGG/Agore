import Link from "next/link";

const pillars = [
  {
    title: "People",
    description: "Find people, build connections, and shape your own social graph.",
  },
  {
    title: "Content",
    description: "Share thoughts, images, and conversations without fighting an algorithm.",
  },
  {
    title: "Communication",
    description: "Move naturally from public conversation into private messages and groups.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8 sm:px-10 lg:px-12">
        <header className="flex items-center justify-between">
          <Link
            href="/"
            className="text-xl font-semibold tracking-[-0.03em]"
            aria-label="Agoré home"
          >
            Agoré
          </Link>

          <Link
            href="/auth"
            className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium transition hover:border-[var(--accent)]"
          >
            Sign in
          </Link>
        </header>

        <div className="flex flex-1 items-center py-20">
          <div className="max-w-3xl">
            <p className="mb-5 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
              A place to gather
            </p>

            <h1 className="max-w-3xl text-5xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-6xl lg:text-7xl">
              People first.
              <br />
              Conversation at the center.
            </h1>

            <p className="mt-7 max-w-2xl text-base leading-7 text-[var(--muted)] sm:text-lg">
              Agoré brings people, content, and communication into one social
              space built around real connections.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/auth"
                className="inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-6 py-3 font-medium text-white transition hover:bg-[var(--accent-strong)]"
              >
                Join Agoré
              </Link>

              <p className="flex items-center justify-center px-2 text-sm text-[var(--muted)] sm:justify-start">
                Invite-only during the early launch.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 border-t border-[var(--border)] py-8 sm:grid-cols-3">
          {pillars.map((pillar) => (
            <div key={pillar.title} className="max-w-sm">
              <h2 className="text-base font-semibold">{pillar.title}</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                {pillar.description}
              </p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}