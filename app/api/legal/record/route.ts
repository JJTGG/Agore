import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  LEGAL_CONSENT_COOKIE,
  recordLegalConsentForUser,
} from "@/lib/legal-consent-server";

const requestSchema = z.object({
  token: z.string().min(1).max(5000),
}).strict();

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
    return NextResponse.json(
      { error: "The request origin could not be verified." },
      { status: 403 },
    );
  }

  const authorization = request.headers.get("authorization") ?? "";
  const accessTokenMatch = authorization.match(/^Bearer\s+(.+)$/i);

  if (!accessTokenMatch) {
    return NextResponse.json(
      { error: "Authentication is required." },
      { status: 401 },
    );
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "The signup acknowledgement token is invalid." },
      { status: 400 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !publishableKey) {
    return NextResponse.json(
      { error: "Authentication is not configured on the server." },
      { status: 500 },
    );
  }

  const accessToken = accessTokenMatch[1];
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
  } = await userClient.auth.getUser(accessToken);

  if (userError || !user) {
    return NextResponse.json(
      { error: "The account session could not be verified." },
      { status: 401 },
    );
  }

  const result = await recordLegalConsentForUser({
    userId: user.id,
    userEmail: user.email,
    token: parsed.data.token,
    oauthCookieToken: readCookie(request, LEGAL_CONSENT_COOKIE),
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason },
      { status: result.status },
    );
  }

  return clearConsentCookie(
    NextResponse.json({ recorded: true }),
  );
}