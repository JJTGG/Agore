import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Agoré",
    short_name: "Agoré",
    description:
      "A place to gather, connect, communicate, and share.",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    background_color: "#111315",
    theme_color: "#1746D1",
    lang: "en",
    categories: ["social", "communication"],
    icons: [
      {
        src: "/agore-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/agore-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/agore-icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}