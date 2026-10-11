
import { notFound, redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

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

  const admin = createAdminClient();

  const { data: profile, error } = await admin
    .from("profiles")
    .select("id, account_status")
    .eq("username", username)
    .maybeSingle();

  if (error) {
    console.error(
      "Unable to resolve Agoré mention profile:",
      error,
    );
    notFound();
  }

  if (!profile || profile.account_status !== "active") {
    notFound();
  }

  redirect(`/profile/${encodeURIComponent(profile.id)}`);
}
