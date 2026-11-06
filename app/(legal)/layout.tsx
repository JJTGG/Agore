import Link from "next/link";
import type { ReactNode } from "react";

import AnalyticsSettingsLink from "@/components/legal/analytics-settings-link";

export default function LegalLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto w-full max-w-4xl px-6 py-8 sm:px-10">
        <header className="flex flex-col gap-5 border-b border-[var(--border)] pb-6 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/"
            className="inline-flex items-center"
            aria-label="Agoré home"
          >
            <img
              src="/agore-logo.svg"
              alt="Agoré"
              className="agore-brand-logo-primary h-9 w-auto"
            />
            <img
              src="/agore-logo-inverse.svg"
              alt="Agoré"
              className="agore-brand-logo-inverse h-9 w-auto"
            />
          </Link>

          <nav
            aria-label="Legal and safety information"
            className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-[var(--muted)]"
          >
            <Link href="/guidelines" className="hover:text-[var(--accent)] hover:underline">
              Guidelines
            </Link>
            <Link href="/terms" className="hover:text-[var(--accent)] hover:underline">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-[var(--accent)] hover:underline">
              Privacy
            </Link>
            <Link href="/support" className="hover:text-[var(--accent)] hover:underline">
              Support
            </Link>
          </nav>
        </header>

        <main className="py-10 sm:py-14">
          {children}
        </main>

        <footer className="border-t border-[var(--border)] py-6 text-sm text-[var(--muted)]">
          <p className="leading-6">
            Agoré is built around people, conversation, and safer participation.
            These pages describe the rules and practices that apply to the service.
          </p>

          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
            <Link href="/guidelines" className="hover:underline">
              Community Guidelines
            </Link>
            <Link href="/terms" className="hover:underline">
              Terms of Service
            </Link>
            <Link href="/privacy" className="hover:underline">
              Privacy Policy
            </Link>
            <Link href="/" className="hover:underline">
              Agoré home
            </Link>
            <AnalyticsSettingsLink />
          </div>

          <p className="mt-4">
            Contact:{" "}
            <a
              href="mailto:agore.support@gmail.com"
              className="hover:underline"
            >
              agore.support@gmail.com
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
}