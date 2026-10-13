
import Link from "next/link";
import { redirect } from "next/navigation";

import AgoreAvatar from "@/components/agore-avatar";
import AgoreDesktopNav from "@/components/agore-desktop-nav";
import AgoreMobileNav from "@/components/agore-mobile-nav";
import AgorePerformanceHud from "@/components/performance/live-hud";
import NotificationBellLink from "@/components/notification-bell-link";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const adminPanelRoles = [
  "founder",
  "super_admin",
  "platform_admin",
  "moderator",
  "analyst",
];

export default async function SocialLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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

  let hasAdminAccess = false;
  let hasFounderAccess = false;

  try {
    const admin = createAdminClient();

    const { data: role, error } = await admin.rpc(
      "agore_get_admin_role",
      { candidate_user_id: user.id },
    );

    if (error) {
      console.error(
        "Unable to resolve Agore admin menu access:",
        error,
      );
    } else {
      hasAdminAccess =
        typeof role === "string" &&
        adminPanelRoles.includes(role);

      hasFounderAccess = role === "founder";
    }
  } catch (error) {
    console.error(
      "Unable to initialize Agore admin menu access:",
      error,
    );
  }

  async function signOut() {
    "use server";

    const supabase = await createClient();

    await supabase.auth.signOut();

    redirect("/auth");
  }

  const profilePath = `/profile/${encodeURIComponent(user.id)}`;

  return (
    <>
      <div className="min-h-dvh bg-[var(--background)] text-[var(--foreground)]">
        <div className="agore-social-shell mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-8">
          <header className="agore-social-header sticky top-0 z-40 border-b border-[var(--border)] bg-[color:var(--background)]/95 backdrop-blur">
            <div className="flex min-h-[72px] items-center justify-between gap-3">
              <Link
                href="/home"
                className="flex shrink-0 items-center"
                aria-label="Agoré home"
              >
                <img
                  src="/agore-logo.svg"
                  alt="Agoré"
                  className="agore-brand-logo-primary h-7 w-auto sm:h-9"
                />
                <img
                  src="/agore-logo-inverse.svg"
                  alt="Agoré"
                  className="agore-brand-logo-inverse h-7 w-auto sm:h-9"
                />
              </Link>

              <div className="flex items-center gap-2">
                <NotificationBellLink />

                <details className="group relative">
                  <summary
                    aria-label="Open account menu"
                    title="Account menu"
                    className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full transition hover:bg-[var(--surface)] [&::-webkit-details-marker]:hidden"
                  >
                    <AgoreAvatar
                      avatarPath={profile.avatar_path}
                      name={profile.display_name}
                      className="h-9 w-9"
                      textClassName="text-xs"
                    />
                  </summary>

                  <div className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-xl">
                    <div className="border-b border-[var(--border)] px-3 py-3">
                      <p className="truncate text-sm font-semibold">
                        {profile.display_name}
                      </p>
                      <p className="mt-1 truncate text-xs text-[var(--muted)]">
                        @{profile.username}
                      </p>
                    </div>

                    <Link
                      href={profilePath}
                      className="block rounded-xl px-3 py-2.5 text-sm transition hover:bg-[var(--background)]"
                    >
                      View profile
                    </Link>

                    <Link
                      href="/settings"
                      className="block rounded-xl px-3 py-2.5 text-sm transition hover:bg-[var(--background)]"
                    >
                      Settings
                    </Link>

                    <Link
                      href="/support"
                      className="block rounded-xl px-3 py-2.5 text-sm transition hover:bg-[var(--background)]"
                    >
                      Help &amp; support
                    </Link>

                    {hasAdminAccess ? (
                      <>
                        <Link
                          href="/admin"
                          className="block rounded-xl px-3 py-2.5 text-sm font-semibold text-[var(--accent)] transition hover:bg-[var(--accent-soft)]"
                        >
                          Administration
                        </Link>

                        <Link
                          href="/admin/insights"
                          className="block rounded-xl px-3 py-2.5 text-sm font-semibold transition hover:bg-[var(--background)]"
                        >
                          Agoré Insights
                        </Link>
                      </>
                    ) : null}

                    {hasFounderAccess ? (
                      <Link
                        href="/admin/founder-tools"
                        className="block rounded-xl px-3 py-2.5 text-sm font-semibold transition hover:bg-[var(--background)]"
                      >
                        Founder tools
                      </Link>
                    ) : null}

                    <form action={signOut}>
                      <button
                        type="submit"
                        className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-[var(--danger)] transition hover:bg-[var(--danger-soft)]"
                      >
                        Sign out
                      </button>
                    </form>
                  </div>
                </details>
              </div>
            </div>
          </header>

          <div className="grid items-start gap-7 py-5 sm:gap-8 lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-9 lg:py-7">
            <aside className="hidden lg:block">
              <div className="sticky top-[104px]">
                <AgoreDesktopNav profilePath={profilePath} />
              </div>
            </aside>

            <div className="min-w-0">
              {children}
            </div>
          </div>

          <AgoreMobileNav
            profilePath={profilePath}
            avatarPath={profile.avatar_path}
            profileName={profile.display_name}
          />
        </div>
      </div>

      <AgorePerformanceHud />
    </>
  );
}
