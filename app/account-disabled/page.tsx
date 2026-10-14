
import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export default async function AccountDisabledPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/auth");
  }

  const {
    data: profile,
    error: profileError,
  } = await supabase
    .from("profiles")
    .select("account_status")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error(
      "Unable to verify Agore account status:",
      profileError,
    );

    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-5 py-10 text-[var(--foreground)]">
        <section className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Account access unavailable
          </h1>

          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            We could not verify your account status. Please
            contact Agoré Support for assistance.
          </p>

          <a
            href="mailto:agore.support@gmail.com?subject=Agor%C3%A9%20Account%20Access"
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)]"
          >
            Contact support
          </a>
        </section>
      </main>
    );
  }

  if (!profile) {
    redirect("/onboarding");
  }

  if (profile.account_status === "active") {
    redirect("/home");
  }

  async function signOut() {
    "use server";

    const supabase = await createClient();
    await supabase.auth.signOut();

    redirect("/auth");
  }

  const deleted = profile.account_status === "deleted";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-5 py-10 text-[var(--foreground)]">
      <section className="w-full max-w-md">
        <Link
          href="/"
          aria-label="Agoré home"
          className="inline-flex items-center"
        >
          <img
            src="/agore-logo.svg"
            alt="Agoré"
            className="agore-brand-logo-primary h-8 w-auto"
          />
          <img
            src="/agore-logo-inverse.svg"
            alt="Agoré"
            className="agore-brand-logo-inverse h-8 w-auto"
          />
        </Link>

        <div className="mt-8 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-muted)] text-xl font-semibold">
            !
          </div>

          <h1 className="mt-5 text-2xl font-semibold tracking-tight">
            {deleted
              ? "This account is no longer active"
              : "Account access is restricted"}
          </h1>

          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            {deleted
              ? "This account is marked as deleted and cannot use Agoré."
              : "This account cannot currently access the Agoré social platform. If you believe this is a mistake, contact Agoré Support for clarification."}
          </p>

          <a
            href="mailto:agore.support@gmail.com?subject=Agor%C3%A9%20Account%20Access"
            className="mt-6 flex min-h-11 items-center justify-center rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)]"
          >
            Contact Agoré Support
          </a>

          <form action={signOut} className="mt-3">
            <button
              type="submit"
              className="flex min-h-11 w-full items-center justify-center rounded-full border border-[var(--border)] px-5 py-3 text-sm font-semibold transition hover:bg-[var(--surface-muted)]"
            >
              Sign out
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
