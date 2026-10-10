import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

type EmailChangeStatus =
  | "confirmation-received"
  | "invalid-link"
  | "error";

function redirectToSettings(
  requestUrl: URL,
  status: EmailChangeStatus,
) {
  return NextResponse.redirect(
    new URL(
      `/settings?email_change=${status}`,
      requestUrl.origin,
    ),
  );
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const providerError =
    requestUrl.searchParams.get("error");

  if (providerError) {
    return redirectToSettings(
      requestUrl,
      "error",
    );
  }

  if (!code) {
    return redirectToSettings(
      requestUrl,
      "invalid-link",
    );
  }

  try {
    const supabase = await createClient();

    const { error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(
        code,
      );

    if (exchangeError) {
      console.error(
        "Email change callback code exchange failed:",
        exchangeError,
      );

      return redirectToSettings(
        requestUrl,
        "invalid-link",
      );
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error(
        "Email change callback could not verify the user session:",
        userError,
      );

      return redirectToSettings(
        requestUrl,
        "error",
      );
    }

    return redirectToSettings(
      requestUrl,
      "confirmation-received",
    );
  } catch (caughtError) {
    console.error(
      "Email change callback failed:",
      caughtError,
    );

    return redirectToSettings(
      requestUrl,
      "error",
    );
  }
}