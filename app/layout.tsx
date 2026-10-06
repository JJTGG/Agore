import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agoré",
  description: "A place to gather, connect, communicate, and share.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}