import type { MetadataRoute } from "next";
import { ICONS } from "@/lib/icons";

/** Makes the app installable on phones and desktops (R7). Name: NEXT_PUBLIC_APP_NAME. */
export default function manifest(): MetadataRoute.Manifest {
  const name = process.env.NEXT_PUBLIC_APP_NAME || "Serenx";
  return {
    // The app's identity stays the same across updates (the default is the start URL)
    id: "/",
    name,
    short_name: name.slice(0, 12),
    description: "Your interior design projects, offers and designer chat.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#020617",
    theme_color: "#7c3aed",
    categories: ["lifestyle", "shopping"],
    icons: [
      // Versioned addresses: installed apps pick up a new logo (lib/icons.ts)
      { src: ICONS.icon192, sizes: "192x192", type: "image/png" },
      { src: ICONS.icon512, sizes: "512x512", type: "image/png" },
      { src: ICONS.maskable512, sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };
}
