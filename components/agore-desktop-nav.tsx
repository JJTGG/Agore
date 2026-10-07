"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  Bell,
  Compass,
  Home,
  MessageCircle,
  Settings,
  UserRound,
} from "lucide-react";

type AgoreDesktopNavProps = {
  profilePath: string;
};

export default function AgoreDesktopNav({
  profilePath,
}: AgoreDesktopNavProps) {
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
      } else if (delta > 5) {
        setQuiet(true);
      } else if (delta < -5) {
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

  const itemClass =
    "flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-medium text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]";

  return (
    <nav
      aria-label="Primary navigation"
      onPointerDownCapture={restoreNavigation}
      onFocusCapture={restoreNavigation}
      className={[
        "space-y-1",
        "transition-[opacity,transform]",
        "duration-200 ease-out",
        "will-change-[opacity,transform]",
        quiet
          ? "translate-y-0.5 opacity-55"
          : "translate-y-0 opacity-100",
      ].join(" ")}
    >
      <Link
        href="/home"
        className="flex items-center gap-3 rounded-2xl bg-[var(--foreground)] px-3.5 py-3 text-sm font-semibold text-[var(--background)] transition hover:bg-[var(--accent)] hover:text-white"
        aria-current="page"
      >
        <Home size={17} />
        Home
      </Link>

      <Link
        href="/app/explore"
        className={itemClass}
      >
        <Compass size={17} />
        Explore
      </Link>

      <Link
        href="/messages"
        className={itemClass}
      >
        <MessageCircle size={17} />
        Messages
      </Link>

      <Link
        href="/notifications"
        className={itemClass}
      >
        <Bell size={17} />
        Notifications
      </Link>

      <Link
        href={profilePath}
        className={itemClass}
      >
        <UserRound size={17} />
        Profile
      </Link>

      <Link
        href="/settings"
        className={itemClass}
      >
        <Settings size={17} />
        Settings
      </Link>
    </nav>
  );
}