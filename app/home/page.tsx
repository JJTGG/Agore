import { redirect } from "next/navigation";
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

          <form action={signOut}>
            <button
              type="submit"
              className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium transition hover:border-[var(--accent)]"
            >
              Sign out
            </button>
          </form>
        </header>

        <section className="py-10 sm:py-14">
          <div className="mb-10 max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
              Home
            </p>

            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
              Your social space starts here.
            </h1>

            <p className="mt-4 leading-7 text-[var(--muted)]">
              Share what matters, see what people are saying, and build your
              social graph from here.
            </p>
          </div>

          <PostFeed />
        </section>

        <footer className="border-t border-[var(--border)] py-5 text-sm text-[var(--muted)]">
          @{profile.username}
        </footer>
      </div>
    </main>
  );
}