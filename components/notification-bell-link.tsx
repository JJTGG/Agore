"use client";

import Link from "next/link";
import { Bell } from "lucide-react";

import {
  useUnreadIndicators,
  UnreadBadge,
} from "@/components/unread-indicators";

type NotificationBellLinkProps = {
  className?: string;
  iconSize?: number;
};

export default function NotificationBellLink({
  className = "flex h-10 w-10 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]",
  iconSize = 19,
}: NotificationBellLinkProps) {
  const { unreadNotifications } = useUnreadIndicators();

  return (
    <Link
      href="/notifications"
      aria-label={
        unreadNotifications > 0
          ? `Notifications, ${unreadNotifications} unread`
          : "Notifications"
      }
      title="Notifications"
      className={className}
    >
      <span className="relative inline-flex">
        <Bell size={iconSize} />
        <UnreadBadge count={unreadNotifications} />
      </span>
    </Link>
  );
}