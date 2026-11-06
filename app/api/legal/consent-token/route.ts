import { NextResponse } from "next/server";
import { z } from "zod";

import { readBoundedJsonBody } from "@/lib/security/bounded-json";
import {
  createLegalConsentToken,
  LEGAL_CONSENT_COOKIE,
} from "@/lib/legal-consent-server";

const MAX_REQUEST_BODY_BYTES = 2048;

const requestSchema = z.object({
  mode: z.enum(["email", "oauth"]),
  email: z.string().trim().email().max(320).optional(),
  ageConfirmed: z.literal(true),
  legalAccepted: z.literal(true),
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

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");

  if (!origin || origin !== requestUrl.origin) {
    return jsonNoStore(
      { error: "The request origin could not be verified." },
      403,
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
      {
        error:
          "Confirm the age requirement and signup agreements first.",
      },
      400,
    );
  }

  const { mode, email } = parsed.data;

  if (mode === "email" && !email) {
    return jsonNoStore(
      { error: "An email address is required." },
      400,
    );
  }

  try {
    const token = createLegalConsentToken(mode, email);
    const response = jsonNoStore({ token });

    if (mode === "oauth") {
      response.cookies.set({
        name: LEGAL_CONSENT_COOKIE,
        value: token,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 15 * 60,
      });
    }

    return response;
  } catch (error) {
    console.error(
      "Agoré could not issue a signup acknowledgement token:",
      error instanceof Error ? error.message : "Unknown error",
    );

    return jsonNoStore(
      {
        error:
          "The signup acknowledgement could not be prepared. Please retry.",
      },
      500,
    );
  }
}