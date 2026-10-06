import { redirect } from "next/navigation";
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

  return (
    <main className="min-h-screen bg-[var(--background)]">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6 sm:px-8">
        <header className="flex items-center justify-between border-b border-[var(--border)] pb-5">
          <div>
            <p className="text-xl font-semibold tracking-[-0.03em]">
              Agoré
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Welcome back, {profile.display_name}.
            </p>
          </div>

          <a
            href="/"
            className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium transition hover:border-[var(--accent)]"
          >
            Exit
          </a>
        </header>

        <section className="flex flex-1 items-center justify-center py-16">
          <div className="w-full max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
              Home
            </p>

            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
              Your social space starts here.
            </h1>

            <p className="mt-4 max-w-xl leading-7 text-[var(--muted)]">
              The feed, conversations, groups, notifications, and discovery
              experience will grow from this authenticated foundation.
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {["Feed", "Messages", "Groups"].map((section) => (
                <div
                  key={section}
                  className="border border-[var(--border)] bg-[var(--surface)] p-5"
                >
                  <h2 className="font-semibold">{section}</h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                    Coming into the V0 product surface.
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <footer className="border-t border-[var(--border)] pt-5 text-sm text-[var(--muted)]">
          @{profile.username}
        </footer>
      </div>
    </main>
  );
}