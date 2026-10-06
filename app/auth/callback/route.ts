import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { consumeInviteForUser } from "@/lib/auth/invite";

function redirectToAuth(requestUrl: URL, error: string) {
  return NextResponse.redirect(
    new URL(`/auth?error=${encodeURIComponent(error)}`, requestUrl),
  );
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (!code) {
    return redirectToAuth(requestUrl, "verification");
  }

  const supabase = await createClient();

  const { error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return redirectToAuth(requestUrl, "verification");
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user || !user.email) {
    await supabase.auth.signOut();
    return redirectToAuth(requestUrl, "verification");
  }

  const cookieStore = await cookies();
  const assertion = cookieStore.get("agore_invite_assertion")?.value;

  if (!assertion) {
    await supabase.auth.signOut();
    return redirectToAuth(requestUrl, "invite");
  }

  const inviteResult = await consumeInviteForUser(
    user.id,
    user.email,
    assertion,
  );

  if (!inviteResult.ok) {
    await supabase.auth.signOut();
    return redirectToAuth(requestUrl, "invite");
  }

  const response = NextResponse.redirect(
    new URL("/home", requestUrl),
  );

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