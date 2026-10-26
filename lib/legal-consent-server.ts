import "server-only";

import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";

export const LEGAL_DOCUMENT_VERSION = "2026-10-26-r2";
export const LEGAL_CONSENT_COOKIE = "agore_legal_consent";

export type LegalConsentMode = "email" | "oauth";

type LegalConsentClaims = {
  version: 1;
  mode: LegalConsentMode;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
  ageConfirmed: true;
  termsVersion: string;
  privacyVersion: string;
  guidelinesVersion: string;
  emailHash?: string;
};

type RecordConsentResult =
  | { ok: true }
  | {
      ok: false;
      status: 400 | 403 | 500;
      reason: string;
    };

function getSigningSecret() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret || secret.length < 32) {
    throw new Error(
      "A valid server-side Supabase service-role key is required to sign legal acknowledgements.",
    );
  }

  return secret;
}

function hashEmail(email: string) {
  return createHash("sha256")
    .update(email.trim().toLowerCase())
    .digest("hex");
}

function signPayload(encodedPayload: string) {
  return createHmac("sha256", getSigningSecret())
    .update(encodedPayload)
    .digest("base64url");
}

export function createLegalConsentToken(
  mode: LegalConsentMode,
  email?: string,
) {
  if (mode === "email" && !email?.trim()) {
    throw new Error(
      "An email address is required for email signup consent.",
    );
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const lifetimeSeconds =
    mode === "email"
      ? 7 * 24 * 60 * 60
      : 15 * 60;

  const claims: LegalConsentClaims = {
    version: 1,
    mode,
    nonce: randomUUID(),
    issuedAt,
    expiresAt: issuedAt + lifetimeSeconds,
    ageConfirmed: true,
    termsVersion: LEGAL_DOCUMENT_VERSION,
    privacyVersion: LEGAL_DOCUMENT_VERSION,
    guidelinesVersion: LEGAL_DOCUMENT_VERSION,
    ...(mode === "email" && email
      ? { emailHash: hashEmail(email) }
      : {}),
  };

  const encodedPayload = Buffer
    .from(JSON.stringify(claims))
    .toString("base64url");

  return `${encodedPayload}.${signPayload(encodedPayload)}`;
}

export function verifyLegalConsentToken(
  token: string,
): LegalConsentClaims | null {
  try {
    const parts = token.split(".");

    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return null;
    }

    const [encodedPayload, suppliedSignature] = parts;
    const expectedSignature = signPayload(encodedPayload);
    const suppliedBuffer = Buffer.from(
      suppliedSignature,
      "base64url",
    );
    const expectedBuffer = Buffer.from(
      expectedSignature,
      "base64url",
    );

    if (
      suppliedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(suppliedBuffer, expectedBuffer)
    ) {
      return null;
    }

    const parsed: unknown = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    );

    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }

    const claims = parsed as Partial<LegalConsentClaims>;
    const now = Math.floor(Date.now() / 1000);

    if (
      claims.version !== 1 ||
      (claims.mode !== "email" && claims.mode !== "oauth") ||
      typeof claims.nonce !== "string" ||
      !claims.nonce ||
      typeof claims.issuedAt !== "number" ||
      typeof claims.expiresAt !== "number" ||
      claims.ageConfirmed !== true ||
      claims.termsVersion !== LEGAL_DOCUMENT_VERSION ||
      claims.privacyVersion !== LEGAL_DOCUMENT_VERSION ||
      claims.guidelinesVersion !== LEGAL_DOCUMENT_VERSION ||
      claims.expiresAt <= now ||
      claims.issuedAt > now + 60
    ) {
      return null;
    }

    if (
      claims.mode === "email" &&
      (
        typeof claims.emailHash !== "string" ||
        !/^[a-f0-9]{64}$/.test(claims.emailHash)
      )
    ) {
      return null;
    }

    return claims as LegalConsentClaims;
  } catch {
    return null;
  }
}

export async function recordLegalConsentForUser({
  userId,
  userEmail,
  token,
  oauthCookieToken,
}: {
  userId: string;
  userEmail: string | undefined;
  token: string;
  oauthCookieToken: string | null;
}): Promise<RecordConsentResult> {
  const claims = verifyLegalConsentToken(token);

  if (!claims) {
    return {
      ok: false,
      status: 400,
      reason: "The signup acknowledgement is invalid or expired.",
    };
  }

  if (claims.mode === "email") {
    if (
      !userEmail ||
      claims.emailHash !== hashEmail(userEmail)
    ) {
      return {
        ok: false,
        status: 403,
        reason: "The acknowledgement does not match the account email.",
      };
    }
  } else if (oauthCookieToken !== token) {
    return {
      ok: false,
      status: 403,
      reason:
        "The Google signup acknowledgement does not match this browser's signup flow.",
    };
  }

  const admin = createAdminClient();

  const {
    data: { user },
    error: getUserError,
  } = await admin.auth.admin.getUserById(userId);

  if (getUserError || !user) {
    return {
      ok: false,
      status: 500,
      reason:
        "The account's legal acknowledgement could not be retrieved.",
    };
  }

  const appMetadata = user.app_metadata ?? {};
  const storedHistory = appMetadata.agore_legal_acceptance_history;

  const history: Array<Record<string, unknown>> =
    Array.isArray(storedHistory)
      ? storedHistory.filter(
          (entry): entry is Record<string, unknown> =>
            typeof entry === "object" && entry !== null,
        )
      : [];

  if (history.some((entry) => entry.token_id === claims.nonce)) {
    return { ok: true };
  }

  const acceptance = {
    token_id: claims.nonce,
    accepted_at: new Date(
      claims.issuedAt * 1000,
    ).toISOString(),
    recorded_at: new Date().toISOString(),
    age_confirmed: true,
    age_confirmation_method: "self_attestation",
    terms_version: claims.termsVersion,
    privacy_version: claims.privacyVersion,
    guidelines_version: claims.guidelinesVersion,
    method:
      claims.mode === "email"
        ? "email_signup"
        : "google_oauth_signup",
  };

  const nextHistory = [
    ...history.slice(-19),
    acceptance,
  ];

  const { error: updateError } =
    await admin.auth.admin.updateUserById(userId, {
      app_metadata: {
        ...appMetadata,
        agore_legal_acceptance_history: nextHistory,
      },
    });

  if (updateError) {
    console.error(
      "Agoré legal acknowledgement could not be recorded:",
      updateError.message,
    );

    return {
      ok: false,
      status: 500,
      reason:
        "The signup acknowledgement could not be saved.",
    };
  }

  return { ok: true };
}