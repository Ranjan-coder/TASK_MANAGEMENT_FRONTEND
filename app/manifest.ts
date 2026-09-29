import type { MetadataRoute } from "next";

/** Makes Bonito installable on phones and desktops (R7). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bonito Interiors",
    short_name: "Bonito",
    description: "Your interior design projects, offers and designer chat.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#020617",
    theme_color: "#7c3aed",
    categories: ["lifestyle", "shopping"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };
}
