import type { Metadata } from "next";

import "./globals.css";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Agoré",
  description:
    "A place to gather, connect, communicate, and share.",
};

type Theme = "system" | "light" | "dark";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();

  let theme: Theme = "system";

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: settings } = await supabase
      .from("user_settings")
      .select("theme")
      .eq("user_id", user.id)
      .maybeSingle();

    if (
      settings?.theme === "light" ||
      settings?.theme === "dark" ||
      settings?.theme === "system"
    ) {
      theme = settings.theme;
    }
  }

  return (
    <html lang="en" data-theme={theme}>
      <body>{children}</body>
    </html>
  );
}