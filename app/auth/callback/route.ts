import { NextResponse } from "next/server";

import {
  LEGAL_CONSENT_COOKIE,
  recordLegalConsentForUser,
} from "@/lib/legal-consent-server";
import { createClient } from "@/lib/supabase/server";

function clearLegacyInviteCookie(response: NextResponse) {
  response.cookies.set({
    name: "agore_invite_assertion",
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

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

function getCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie");

  if (!cookieHeader) {
    return null;
  }

  const entry = cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));

  return entry ? entry.slice(name.length + 1) : null;
}

function redirectToAuth(requestUrl: URL, error: string) {
  const destination = new URL("/auth", requestUrl.origin);
  destination.searchParams.set("error", error);

  return clearLegacyInviteCookie(
    NextResponse.redirect(destination),
  );
}

function getSafeNextPath(requestUrl: URL) {
  const next = requestUrl.searchParams.get("next");

  const allowedPaths = [
    "/home",
    "/auth/update-password",
    "/onboarding",
  ];

  return next && allowedPaths.includes(next)
    ? next
    : "/home";
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);

  if (requestUrl.searchParams.has("error")) {
    return redirectToAuth(requestUrl, "oauth");
  }

  const code = requestUrl.searchParams.get("code");

  if (!code) {
    return redirectToAuth(requestUrl, "verification");
  }

  const supabase = await createClient();

  const { error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    console.error(
      "Agore authentication callback failed:",
      exchangeError.message,
    );

    return redirectToAuth(requestUrl, "verification");
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    await supabase.auth.signOut();
    return redirectToAuth(requestUrl, "verification");
  }

  const consentToken =
    requestUrl.searchParams.get("legal_consent");

  if (consentToken) {
    const result = await recordLegalConsentForUser({
      userId: user.id,
      userEmail: user.email,
      token: consentToken,
      oauthCookieToken: getCookie(
        request,
        LEGAL_CONSENT_COOKIE,
      ),
    });

    if (!result.ok) {
      console.error(
        "Agoré rejected a signup acknowledgement:",
        result.reason,
      );

      await supabase.auth.signOut();

      return redirectToAuth(requestUrl, "legal");
    }
  }

  const destination = new URL(
    getSafeNextPath(requestUrl),
    requestUrl.origin,
  );

  return clearLegacyInviteCookie(
    NextResponse.redirect(destination),
  );
}