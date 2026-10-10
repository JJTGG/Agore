"use client";

import { useEffect, useState } from "react";

import VerificationBadge from "@/components/verification-badge";

type AccountType =
  | "personal"
  | "creator"
  | "business"
  | "organization"
  | "institution";

type VerificationKind =
  | "agore_official"
  | "official"
  | "paid"
  | null;

type BadgeStatus = {
  accountType: AccountType;
  kind: VerificationKind;
};

type BadgeResponse = {
  badge?: {
    accountType?: unknown;
    kind?: unknown;
  };
};

type UserIdentityProps = {
  userId?: string | null;
  displayName: string;
  accountType?: AccountType;
  verificationKind?: VerificationKind;
  className?: string;
  nameClassName?: string;
  badgeSize?: number;
};

type CachedBadge = {
  badge: BadgeStatus | null;
  expiresAt: number;
};

const CACHE_TTL_MS = 60_000;
const ERROR_CACHE_TTL_MS = 10_000;

const badgeCache = new Map<string, CachedBadge>();
const badgeRequests = new Map<
  string,
  Promise<BadgeStatus | null>
>();

function isAccountType(value: unknown): value is AccountType {
  return (
    value === "personal" ||
    value === "creator" ||
    value === "business" ||
    value === "organization" ||
    value === "institution"
  );
}

function isVerificationKind(
  value: unknown,
): value is VerificationKind {
  return (
    value === null ||
    value === "agore_official" ||
    value === "official" ||
    value === "paid"
  );
}

async function loadBadgeStatus(
  userId: string,
): Promise<BadgeStatus | null> {
  const cached = badgeCache.get(userId);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.badge;
  }

  if (cached) {
    badgeCache.delete(userId);
  }

  const pending = badgeRequests.get(userId);

  if (pending) {
    return pending;
  }

  const request = (async (): Promise<BadgeStatus | null> => {
    try {
      const response = await fetch(
        `/api/users/${encodeURIComponent(userId)}/badge`,
        {
          method: "GET",
          cache: "no-store",
        },
      );

      if (!response.ok) {
        badgeCache.set(userId, {
          badge: null,
          expiresAt: Date.now() + ERROR_CACHE_TTL_MS,
        });

        return null;
      }

      const data = (await response.json()) as BadgeResponse;
      const accountType = data.badge?.accountType;
      const kind = data.badge?.kind;

      if (
        !isAccountType(accountType) ||
        !isVerificationKind(kind)
      ) {
        badgeCache.set(userId, {
          badge: null,
          expiresAt: Date.now() + ERROR_CACHE_TTL_MS,
        });

        return null;
      }

      const badge: BadgeStatus = {
        accountType,
        kind,
      };

      badgeCache.set(userId, {
        badge,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });

      return badge;
    } catch {
      badgeCache.set(userId, {
        badge: null,
        expiresAt: Date.now() + ERROR_CACHE_TTL_MS,
      });

      return null;
    }
  })();

  badgeRequests.set(userId, request);

  try {
    return await request;
  } finally {
    if (badgeRequests.get(userId) === request) {
      badgeRequests.delete(userId);
    }
  }
}

export default function UserIdentity({
  userId,
  displayName,
  accountType,
  verificationKind,
  className = "",
  nameClassName = "",
  badgeSize = 18,
}: UserIdentityProps) {
  const hasInitialStatus =
    accountType !== undefined &&
    verificationKind !== undefined;

  const [remoteStatus, setRemoteStatus] = useState<{
    userId: string;
    badge: BadgeStatus | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (hasInitialStatus || !userId) {
      return () => {
        cancelled = true;
      };
    }

    void loadBadgeStatus(userId).then((badge) => {
      if (!cancelled) {
        setRemoteStatus({
          userId,
          badge,
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    userId,
    hasInitialStatus,
    accountType,
    verificationKind,
  ]);

  let status: BadgeStatus | null = null;

  if (
    hasInitialStatus &&
    accountType !== undefined &&
    verificationKind !== undefined
  ) {
    status = {
      accountType,
      kind: verificationKind,
    };
  } else if (
    userId &&
    remoteStatus !== null &&
    remoteStatus.userId === userId
  ) {
    status = remoteStatus.badge;
  }

  return (
    <span
      className={[
        "inline-flex min-w-0 max-w-full items-center gap-1.5 align-baseline",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className={nameClassName}>
        {displayName}
      </span>

      {status?.kind ? (
        <VerificationBadge
          accountType={status.accountType}
          kind={status.kind}
          size={badgeSize}
        />
      ) : null}
    </span>
  );
}