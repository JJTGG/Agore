import { NextResponse } from "next/server";
import { z } from "zod";

import {
  createLegalConsentToken,
  LEGAL_CONSENT_COOKIE,
  type LegalConsentMode,
} from "@/lib/legal-consent-server";

const requestSchema = z.object({
  mode: z.enum(["email", "oauth"]),
  email: z.string().trim().email().max(320).optional(),
  ageConfirmed: z.literal(true),
  legalAccepted: z.literal(true),
}).strict();

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");

  if (!origin || origin !== requestUrl.origin) {
    return NextResponse.json(
      { error: "The request origin could not be verified." },
      { status: 403 },
    );
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Confirm the age requirement and signup agreements first." },
      { status: 400 },
    );
  }

  const { mode, email } = parsed.data;

  if (mode === "email" && !email) {
    return NextResponse.json(
      { error: "An email address is required." },
      { status: 400 },
    );
  }

  try {
    const token = createLegalConsentToken(
      mode as LegalConsentMode,
      email,
    );

    const response = NextResponse.json({ token });

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

    return NextResponse.json(
      { error: "The signup acknowledgement could not be prepared. Please retry." },
      { status: 500 },
    );
  }
}