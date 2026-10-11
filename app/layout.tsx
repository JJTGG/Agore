import type { Metadata, Viewport } from "next";

import "./globals.css";
import { createClient } from "@/lib/supabase/server";

const appName = "Agoré";
const appDescription =
  "A place to gather, connect, communicate, and share.";
const socialImage = "/opengraph-image.png";

export const metadata: Metadata = {
  metadataBase: new URL("https://agore.vercel.app"),
  applicationName: appName,
  title: appName,
  description: appDescription,

  appleWebApp: {
    capable: true,
    title: appName,
    statusBarStyle: "default",
  },

  icons: {
    icon: [
      {
        url: "/agore-favicon.ico",
        type: "image/x-icon",
      },
      {
        url: "/agore-icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
    ],
    shortcut: ["/agore-favicon.ico"],
    apple: [
      {
        url: "/agore-apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },

  openGraph: {
    type: "website",
    siteName: appName,
    title: appName,
    description: appDescription,
    images: [
      {
        url: socialImage,
        width: 1200,
        height: 630,
        alt: "Agoré — A place to gather, connect, communicate, and share.",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: appName,
    description: appDescription,
    images: [
      {
        url: socialImage,
        alt: "Agoré — A place to gather, connect, communicate, and share.",
      },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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