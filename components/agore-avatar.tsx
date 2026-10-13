"use client";

import { useEffect, useRef, useState } from "react";
import type { SyntheticEvent } from "react";

import { createClient } from "@/lib/supabase/browser";
import { recordAgorePerformanceMetric } from "@/lib/performance/monitor";

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

type AvatarImageTiming = {
  url: string | null;
  urlReadyAt: number;
  completed: boolean;
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
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    null,
  );

  const imageTimingRef = useRef<AvatarImageTiming>({
    url: null,
    urlReadyAt: 0,
    completed: false,
  });

  useEffect(() => {
    let active = true;

    async function loadAvatar() {
      if (!avatarPath) {
        setAvatarUrl(null);

        imageTimingRef.current = {
          url: null,
          urlReadyAt: 0,
          completed: false,
        };

        return;
      }

      const startedAt = performance.now();

      const url = await getSignedAvatarUrl(
        bucketName,
        avatarPath,
        refreshKey,
      );

      const resolvedAt = performance.now();

      recordAgorePerformanceMetric(
        "image",
        "Avatar URL availability",
        resolvedAt - startedAt,
        "ms",
        {
          success: Boolean(url),
        },
      );

      if (!active) {
        return;
      }

      imageTimingRef.current = {
        url,
        urlReadyAt: resolvedAt,
        completed: false,
      };

      setAvatarUrl(url);
    }

    void loadAvatar();

    return () => {
      active = false;
    };
  }, [avatarPath, bucketName, refreshKey]);

  async function handleAvatarLoad(
    event: SyntheticEvent<HTMLImageElement>,
  ) {
    const image = event.currentTarget;
    const timing = imageTimingRef.current;
    const expectedUrl = timing.url;

    if (
      !expectedUrl ||
      timing.completed ||
      !timing.urlReadyAt
    ) {
      return;
    }

    // Ignore a late load event from an avatar that has since
    // been replaced by another URL.
    if (
      image.currentSrc !== expectedUrl &&
      image.src !== expectedUrl
    ) {
      return;
    }

    try {
      if (typeof image.decode === "function") {
        await image.decode();
      }

      const latestTiming = imageTimingRef.current;

      if (
        latestTiming.url !== expectedUrl ||
        latestTiming.completed
      ) {
        return;
      }

      latestTiming.completed = true;

      const resourceEntries = performance.getEntriesByName(
        expectedUrl,
        "resource",
      );

      const resource =
        resourceEntries.length > 0
          ? resourceEntries[
              resourceEntries.length - 1
            ] as PerformanceResourceTiming
          : null;

      recordAgorePerformanceMetric(
        "image",
        "Avatar image ready (load + decode)",
        Math.max(
          0,
          performance.now() - latestTiming.urlReadyAt,
        ),
        "ms",
        {
          success: true,
          resourceTimingAvailable: resource !== null,
          resourceDurationMs: resource
            ? resource.duration
            : 0,
          transferSizeBytes: resource
            ? resource.transferSize
            : 0,
        },
      );
    } catch {
      const latestTiming = imageTimingRef.current;

      if (
        latestTiming.url !== expectedUrl ||
        latestTiming.completed
      ) {
        return;
      }

      latestTiming.completed = true;

      recordAgorePerformanceMetric(
        "image",
        "Avatar image decode failed",
        Math.max(
          0,
          performance.now() - latestTiming.urlReadyAt,
        ),
        "ms",
        {
          success: false,
        },
      );
    }
  }

  function handleAvatarError(
    failedUrl: string | null,
  ) {
    const timing = imageTimingRef.current;

    if (
      !failedUrl ||
      timing.url !== failedUrl ||
      timing.completed
    ) {
      return;
    }

    timing.completed = true;

    recordAgorePerformanceMetric(
      "image",
      "Avatar image failed to load",
      Math.max(
        0,
        performance.now() - timing.urlReadyAt,
      ),
      "ms",
      {
        success: false,
      },
    );
  }

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
          onLoad={handleAvatarLoad}
          onError={() => handleAvatarError(avatarUrl)}
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