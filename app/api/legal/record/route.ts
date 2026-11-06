import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { readBoundedJsonBody } from "@/lib/security/bounded-json";
import {
  LEGAL_CONSENT_COOKIE,
  recordLegalConsentForUser,
} from "@/lib/legal-consent-server";

const MAX_REQUEST_BODY_BYTES = 6144;

const requestSchema = z.object({
  token: z.string().min(1).max(5000),
}).strict();

function jsonNoStore(
  body: Record<string, unknown>,
  status = 200,
) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
    },
  });
}

function readCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie");

  if (!cookieHeader) {
    return null;
  }

  const entry = cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));

  if (!entry) {
    return null;
  }

  return entry.slice(name.length + 1);
}

function clearConsentCookie(response: NextResponse) {
  response.cookies.set({
    name: LEGAL_CONSENT_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");

  if (!origin || origin !== requestUrl.origin) {
    return jsonNoStore(
      { error: "The request origin could not be verified." },
      403,
    );
  }

  const authorization = request.headers.get("authorization") ?? "";
  const accessTokenMatch = authorization.match(/^Bearer\s+(.+)$/i);

  if (!accessTokenMatch) {
    return jsonNoStore(
      { error: "Authentication is required." },
      401,
    );
  }

  const boundedBody = await readBoundedJsonBody(
    request,
    MAX_REQUEST_BODY_BYTES,
  );

  if (!boundedBody.ok) {
    return jsonNoStore(
      {
        error:
          boundedBody.reason === "too_large"
            ? "The request body is too large."
            : "The request body must be valid JSON.",
      },
      boundedBody.reason === "too_large" ? 413 : 400,
    );
  }

  const parsed = requestSchema.safeParse(boundedBody.value);

  if (!parsed.success) {
    return jsonNoStore(
      { error: "The signup acknowledgement token is invalid." },
      400,
    );
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !publishableKey) {
      return jsonNoStore(
        { error: "Authentication is not configured on the server." },
        500,
      );
    }

    const userClient = createSupabaseClient(
      supabaseUrl,
      publishableKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      },
    );

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser(accessTokenMatch[1]);

    if (userError || !user) {
      return jsonNoStore(
        { error: "The account session could not be verified." },
        401,
      );
    }

    const result = await recordLegalConsentForUser({
      userId: user.id,
      userEmail: user.email,
      token: parsed.data.token,
      oauthCookieToken: readCookie(
        request,
        LEGAL_CONSENT_COOKIE,
      ),
    });

    if (!result.ok) {
      return jsonNoStore(
        { error: result.reason },
        result.status,
      );
    }

    return clearConsentCookie(
      jsonNoStore({ recorded: true }),
    );
  } catch (error) {
    console.error(
      "Agoré legal acknowledgement could not be recorded:",
      error instanceof Error ? error.message : "Unknown error",
    );

    return jsonNoStore(
      {
        error:
          "The signup acknowledgement could not be recorded. Please try again.",
      },
      500,
    );
  }
}