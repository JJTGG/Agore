"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/browser";

type AgoreAvatarProps = {
  avatarPath?: string | null;
  name?: string | null;
  alt?: string;
  className?: string;
  textClassName?: string;
};

const supabase = createClient();

function getInitials(name: string | null | undefined) {
  const initials =
    name
      ?.split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(
        (part) =>
          part[0]?.toUpperCase() ?? "",
      )
      .join("") ?? "";

  return initials || "A";
}

export default function AgoreAvatar({
  avatarPath,
  name,
  alt,
  className = "h-10 w-10",
  textClassName = "text-xs",
}: AgoreAvatarProps) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let active = true;

    async function loadAvatar() {
      if (!avatarPath) {
        setAvatarUrl(null);
        return;
      }

      const { data, error } = await supabase.storage
        .from("avatars")
        .createSignedUrl(avatarPath, 60 * 60);

      if (!active) {
        return;
      }

      if (error) {
        console.error(
          "Failed to create Agore avatar signed URL:",
          error,
        );
        setAvatarUrl(null);
        return;
      }

      setAvatarUrl(data.signedUrl);
    }

    void loadAvatar();

    return () => {
      active = false;
    };
  }, [avatarPath]);

  const initials = getInitials(name);

  return (
    <span
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--accent-soft)] font-bold text-[var(--accent)] ${className}`}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={
            alt ??
            (name
              ? `${name}'s profile photo`
              : "Profile photo")
          }
          className="h-full w-full object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className={textClassName}
        >
          {initials}
        </span>
      )}
    </span>
  );
}