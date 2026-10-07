"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  Compass,
  Home,
  MessageCircle,
} from "lucide-react";

import AgoreAvatar from "@/components/agore-avatar";

type AgoreMobileNavProps = {
  profilePath: string;
  avatarPath: string | null;
  profileName: string;
};

export default function AgoreMobileNav({
  profilePath,
  avatarPath,
  profileName,
}: AgoreMobileNavProps) {
  const [quiet, setQuiet] = useState(false);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    lastScrollY.current = window.scrollY;

    function updateNavigationState() {
      const currentY = window.scrollY;
      const previousY = lastScrollY.current;
      const delta = currentY - previousY;

      if (currentY <= 8) {
        setQuiet(false);
      } else if (delta > 4) {
        setQuiet(true);
      } else if (delta < -4) {
        setQuiet(false);
      }

      lastScrollY.current = currentY;
      ticking.current = false;
    }

    function handleScroll() {
      if (ticking.current) {
        return;
      }

      ticking.current = true;
      window.requestAnimationFrame(
        updateNavigationState,
      );
    }

    window.addEventListener(
      "scroll",
      handleScroll,
      { passive: true },
    );

    return () => {
      window.removeEventListener(
        "scroll",
        handleScroll,
      );
    };
  }, []);

  function restoreNavigation() {
    setQuiet(false);
  }

  return (
    <nav
      aria-label="Mobile navigation"
      onPointerDownCapture={restoreNavigation}
      onFocusCapture={restoreNavigation}
      className={[
        "fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center justify-between",
        "rounded-[1.5rem] border border-[var(--border)]",
        "px-2 py-2 backdrop-blur",
        "transition-[opacity,transform,background-color,box-shadow]",
        "duration-200 ease-out md:hidden",
        quiet
          ? "translate-y-1 bg-[color:var(--surface)]/70 opacity-75 shadow-[0_10px_28px_rgba(0,0,0,0.08)]"
          : "translate-y-0 bg-[color:var(--surface)]/95 opacity-100 shadow-[0_18px_50px_rgba(0,0,0,0.14)]",
      ].join(" ")}
    >
      <Link
        href="/home"
        className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl bg-[var(--foreground)] px-2 py-2 text-[var(--background)]"
        aria-current="page"
      >
        <Home size={18} />

        <span className="text-[10px] font-semibold">
          Home
        </span>
      </Link>

      <Link
        href="/app/explore"
        className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[var(--muted)] transition hover:bg-[var(--background)] hover:text-[var(--foreground)]"
      >
        <Compass size={18} />

        <span className="text-[10px] font-semibold">
          Explore
        </span>
      </Link>

      <Link
        href="/messages"
        className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[var(--muted)] transition hover:bg-[var(--background)] hover:text-[var(--foreground)]"
      >
        <MessageCircle size={18} />

        <span className="text-[10px] font-semibold">
          Messages
        </span>
      </Link>

      <Link
        href={profilePath}
        className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[var(--muted)] transition hover:bg-[var(--background)] hover:text-[var(--foreground)]"
      >
        <AgoreAvatar
          avatarPath={avatarPath}
          name={profileName}
          className="h-[18px] w-[18px]"
          textClassName="text-[6px]"
        />

        <span className="text-[10px] font-semibold">
          Profile
        </span>
      </Link>
    </nav>
  );
}