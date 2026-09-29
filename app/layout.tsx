import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "sonner";
import { Providers } from "./providers";
import { PwaSetup } from "@/components/shared/PwaSetup";

export const metadata: Metadata = {
  title: "Bonito Designs",
  description: "Your interior design projects, offers and designer chat.",
  applicationName: "Bonito",
  appleWebApp: { capable: true, title: "Bonito", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" }
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
