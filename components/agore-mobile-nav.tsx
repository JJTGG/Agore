
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
} from "lucide-react";

import AgoreAvatar from "@/components/agore-avatar";
import {
  useUnreadIndicators,
  UnreadBadge,
} from "@/components/unread-indicators";

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
  const pathname = usePathname();
  const { hasUnreadMessages } = useUnreadIndicators();

  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    lastScrollY.current = window.scrollY;

    function updateNavigationState() {
      const currentY = window.scrollY;
      const previousY = lastScrollY.current;
      const delta = currentY - previousY;

      if (currentY <= 12) {
        setHidden(false);
      } else if (delta > 6 && currentY > 72) {
        setHidden(true);
      } else if (delta < -4) {
        setHidden(false);
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

  useEffect(() => {
    setHidden(false);
  }, [pathname]);

  function restoreNavigation() {
    setHidden(false);
  }

  function isActiveRoute(href: string) {
    return (
      pathname === href ||
      pathname.startsWith(`${href}/`)
    );
  }

  const itemClass = [
    "group relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1",
    "rounded-2xl px-1 py-2 text-[var(--muted)]",
    "transition-all duration-200 ease-out",
    "hover:bg-[var(--background)] hover:text-[var(--foreground)]",
    "active:scale-[0.94]",
    "focus-visible:outline-none focus-visible:ring-2",
    "focus-visible:ring-[var(--accent)]",
  ].join(" ");

  const activeItemClass = [
    "group relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1",
    "rounded-2xl bg-[var(--accent-soft)] px-1 py-2",
    "text-[var(--accent)] shadow-sm",
    "transition-all duration-200 ease-out",
    "active:scale-[0.94]",
    "focus-visible:outline-none focus-visible:ring-2",
    "focus-visible:ring-[var(--accent)]",
  ].join(" ");

  function getItemClass(active: boolean) {
    return active ? activeItemClass : itemClass;
  }

  function getIconClass(active: boolean) {
    return [
      "transition-transform duration-200 ease-out",
      active ? "scale-110" : "group-hover:scale-110",
    ].join(" ");
  }

  return (
    <nav
      aria-label="Mobile navigation"
      onPointerDownCapture={restoreNavigation}
      onFocusCapture={restoreNavigation}
      className={[
        "fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-md items-center justify-between",
        "rounded-[1.5rem] border border-[var(--border)]",
        "bg-[color:var(--surface)]/95 px-2 py-2 backdrop-blur-xl",
        "transition-[opacity,transform,background-color,box-shadow]",
        "duration-300 ease-out",
        "md:hidden",
        hidden
          ? "pointer-events-none translate-y-[130%] opacity-0"
          : "translate-y-0 opacity-100 shadow-[0_18px_50px_rgba(0,0,0,0.14)]",
      ].join(" ")}
    >
      <Link
        href="/home"
        className={getItemClass(isActiveRoute("/home"))}
        aria-current={
          isActiveRoute("/home") ? "page" : undefined
        }
      >
        <Home
          size={19}
          className={getIconClass(isActiveRoute("/home"))}
        />
        <span className="text-[10px] font-semibold">
          Home
        </span>
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
        <Compass
          size={19}
          className={getIconClass(
            isActiveRoute("/app/explore"),
          )}
        />
        <span className="text-[10px] font-semibold">
          Explore
        </span>
      </Link>

      <Link
        href="/create"
        className={getItemClass(
          isActiveRoute("/create"),
        )}
        aria-current={
          isActiveRoute("/create")
            ? "page"
            : undefined
        }
      >
        <Plus
          size={20}
          strokeWidth={2.5}
          className={getIconClass(
            isActiveRoute("/create"),
          )}
        />
        <span className="text-[10px] font-semibold">
          Create
        </span>
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
          <MessageCircle
            size={19}
            className={getIconClass(
              isActiveRoute("/messages"),
            )}
          />
          <UnreadBadge
            count={hasUnreadMessages ? 1 : 0}
            dotOnly
          />
        </span>

        <span className="text-[10px] font-semibold">
          Messages
        </span>
      </Link>

      <Link
        href={profilePath}
        className={getItemClass(
          isActiveRoute(profilePath),
        )}
        aria-current={
          isActiveRoute(profilePath)
            ? "page"
            : undefined
        }
      >
        <AgoreAvatar
          avatarPath={avatarPath}
          name={profileName}
          className={[
            "h-[19px] w-[19px] transition-transform duration-200",
            isActiveRoute(profilePath)
              ? "scale-110 ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--surface)]"
              : "group-hover:scale-110",
          ].join(" ")}
          textClassName="text-[6px]"
        />
        <span className="text-[10px] font-semibold">
          Profile
        </span>
      </Link>
    </nav>
  );
}
