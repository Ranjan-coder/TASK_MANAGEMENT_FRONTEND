import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "sonner";
import { Providers } from "./providers";
import { PwaSetup } from "@/components/shared/PwaSetup";

// The product's name (NEXT_PUBLIC_APP_NAME); each organisation's own name is shown inside the app
const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Serenx";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Your interior design projects, offers and designer chat.",
  applicationName: APP_NAME,
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "black-translucent" },
  // The Serenx logo: the same for every organisation (scripts/genIcons.js makes these)
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }
    ],
    apple: "/icons/apple-touch-icon.png"
  }
};

export const viewport: Viewport = {
  themeColor: "#7c3aed",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased min-h-screen bg-slate-950 text-slate-100 selection:bg-violet-500/30">
        <Providers>
          {children}
          <PwaSetup />
          <Toaster richColors position="top-right" />
        </Providers>
      </body>
    </html>
  );
}
