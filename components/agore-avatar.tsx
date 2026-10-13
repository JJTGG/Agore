"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/browser";

type AgoreAvatarProps = {
  avatarPath?: string | null;
  name?: string | null;
  alt?: string;
  className?: string;
  textClassName?: string;
  bucketName?: string;
  refreshKey?: string | number;
};

type CachedAvatarUrl = {
  url: string;
  expiresAt: number;
};

const supabase = createClient();
const SIGNED_URL_LIFETIME_SECONDS = 60 * 60;
const SIGNED_URL_CACHE_TTL_MS = 55 * 60 * 1000;
const MAX_CACHED_AVATAR_URLS = 500;

const signedAvatarUrlCache = new Map<
  string,
  CachedAvatarUrl
>();
const pendingAvatarUrlRequests = new Map<
  string,
  Promise<string | null>
>();

function getAvatarCacheKey(
  bucketName: string,
  avatarPath: string,
  refreshKey: string | number | undefined,
) {
  return JSON.stringify([
    bucketName,
    avatarPath,
    refreshKey ?? null,
  ]);
}

async function getSignedAvatarUrl(
  bucketName: string,
  avatarPath: string,
  refreshKey: string | number | undefined,
): Promise<string | null> {
  const cacheKey = getAvatarCacheKey(
    bucketName,
    avatarPath,
    refreshKey,
  );
  const now = Date.now();
  const cached = signedAvatarUrlCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    // Refresh insertion order so frequently reused avatars stay cached.
    signedAvatarUrlCache.delete(cacheKey);
    signedAvatarUrlCache.set(cacheKey, cached);
    return cached.url;
  }

  if (cached) {
    signedAvatarUrlCache.delete(cacheKey);
  }

  const pending = pendingAvatarUrlRequests.get(cacheKey);

  if (pending) {
    return pending;
  }

  const request = supabase.storage
    .from(bucketName)
    .createSignedUrl(
      avatarPath,
      SIGNED_URL_LIFETIME_SECONDS,
    )
    .then(({ data, error }) => {
      if (error) {
        throw error;
      }

      if (
        signedAvatarUrlCache.size >=
        MAX_CACHED_AVATAR_URLS
      ) {
        const oldestKey =
          signedAvatarUrlCache.keys().next().value;

        if (oldestKey) {
          signedAvatarUrlCache.delete(oldestKey);
        }
      }

      signedAvatarUrlCache.set(cacheKey, {
        url: data.signedUrl,
        expiresAt: Date.now() + SIGNED_URL_CACHE_TTL_MS,
      });

      return data.signedUrl;
    })
    .catch((error: unknown) => {
      console.error(
        "Failed to create Agore avatar signed URL:",
        error,
      );

      return null;
    })
    .finally(() => {
      pendingAvatarUrlRequests.delete(cacheKey);
    });

  pendingAvatarUrlRequests.set(cacheKey, request);
  return request;
}

function getInitials(
  name: string | null | undefined,
) {
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
  bucketName = "avatars",
  refreshKey,
}: AgoreAvatarProps) {
  const [
    avatarUrl,
    setAvatarUrl,
  ] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let active = true;

    async function loadAvatar() {
      if (!avatarPath) {
        setAvatarUrl(null);
        return;
      }

      const url = await getSignedAvatarUrl(
        bucketName,
        avatarPath,
        refreshKey,
      );

      if (!active) {
        return;
      }

      setAvatarUrl(url);
    }

    void loadAvatar();

    return () => {
      active = false;
    };
  }, [
    avatarPath,
    bucketName,
    refreshKey,
  ]);

  const initials =
    getInitials(name);

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
          className={
            textClassName
          }
        >
          {initials}
        </span>
      )}
    </span>
  );
}
