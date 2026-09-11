import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "TaskManager — Enterprise Task & Operations Management",
  description: "Secure, role-based task and operations management platform."
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
          <Toaster richColors position="top-right" />
        </Providers>
      </body>
    </html>
  );
}
