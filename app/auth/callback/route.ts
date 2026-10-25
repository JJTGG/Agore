import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const LEGAL_DOCUMENT_VERSION = "2026-10-25";

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

  return response;
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

function hasCurrentLegalAcknowledgement(requestUrl: URL) {
  return (
    requestUrl.searchParams.get("agore_age_confirmed") === "true" &&
    requestUrl.searchParams.get("agore_terms_version") === LEGAL_DOCUMENT_VERSION &&
    requestUrl.searchParams.get("agore_privacy_version") === LEGAL_DOCUMENT_VERSION &&
    requestUrl.searchParams.get("agore_guidelines_version") === LEGAL_DOCUMENT_VERSION
  );
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

  if (hasCurrentLegalAcknowledgement(requestUrl)) {
    const { error: legalRecordError } =
      await supabase.auth.updateUser({
        data: {
          agore_age_confirmed: true,
          agore_age_confirmation_method: "self_attestation",
          agore_terms_accepted_version: LEGAL_DOCUMENT_VERSION,
          agore_privacy_acknowledged_version: LEGAL_DOCUMENT_VERSION,
          agore_guidelines_acknowledged_version: LEGAL_DOCUMENT_VERSION,
        },
      });

    if (legalRecordError) {
      console.error(
        "Agoré signup acknowledgement metadata could not be saved:",
        legalRecordError.message,
      );
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