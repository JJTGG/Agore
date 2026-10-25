import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function UsernameProfileRedirect({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username: rawUsername } = await params;
  const username = rawUsername.trim().toLowerCase();

  if (!/^[a-z0-9_]{2,30}$/.test(username)) {
    notFound();
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/auth");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, account_status")
    .eq("username", username)
    .maybeSingle();

  if (error) {
    console.error(
      "Unable to resolve Agore username for authenticated user:",
      error,
    );

    notFound();
  }

  if (!profile || profile.account_status !== "active") {
    notFound();
  }

  redirect(`/profile/${encodeURIComponent(profile.id)}`);
}