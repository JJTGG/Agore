"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Compass,
  Home,
  MessageCircle,
  Plus,
  UserRound,
} from "lucide-react";

import {
  useUnreadIndicators,
  UnreadBadge,
} from "@/components/unread-indicators";

type AgoreDesktopNavProps = {
  profilePath: string;
};

export default function AgoreDesktopNav({
  profilePath,
}: AgoreDesktopNavProps) {
  const pathname = usePathname();

  const { hasUnreadMessages } = useUnreadIndicators();

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
      if (ticking.current) return;

      ticking.current = true;
      window.requestAnimationFrame(updateNavigationState);
    }

    window.addEventListener("scroll", handleScroll, {
      passive: true,
    });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  function restoreNavigation() {
    setQuiet(false);
  }

  function isActiveRoute(href: string) {
    return (
      pathname === href ||
      pathname.startsWith(`${href}/`)
    );
  }

  const isProfileActive = pathname.startsWith("/profile/");

  const itemClass =
    "flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-medium text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]";

  const activeItemClass =
    "flex items-center gap-3 rounded-2xl bg-[var(--accent-soft)] px-3.5 py-3 text-sm font-semibold text-[var(--accent)] transition";

  function getItemClass(active: boolean) {
    return active ? activeItemClass : itemClass;
  }

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
        className={getItemClass(isActiveRoute("/home"))}
        aria-current={
          isActiveRoute("/home") ? "page" : undefined
        }
      >
        <Home size={18} />
        <span>Home</span>
      </Link>

      <Link
        href="/app/explore"
        className={getItemClass(
          isActiveRoute("/app/explore"),
        )}
        aria-current={
          isActiveRoute("/app/explore")
            ? "page"
            : undefined
        }
      >
        <Compass size={18} />
        <span>Explore</span>
      </Link>

      <Link
        href="/create"
        className={getItemClass(isActiveRoute("/create"))}
        aria-current={
          isActiveRoute("/create") ? "page" : undefined
        }
      >
        <Plus size={18} />
        <span>Create</span>
      </Link>

      <Link
        href="/messages"
        className={getItemClass(
          isActiveRoute("/messages"),
        )}
        aria-current={
          isActiveRoute("/messages")
            ? "page"
            : undefined
        }
        aria-label={
          hasUnreadMessages
            ? "Messages, unread messages"
            : "Messages"
        }
      >
        <span className="relative inline-flex">
          <MessageCircle size={18} />
          <UnreadBadge
            count={hasUnreadMessages ? 1 : 0}
            dotOnly
          />
        </span>
        <span>Messages</span>
      </Link>

      <Link
        href={profilePath}
        className={getItemClass(isProfileActive)}
        aria-current={
          isProfileActive ? "page" : undefined
        }
      >
        <UserRound size={18} />
        <span>Profile</span>
      </Link>
    </nav>
  );
}