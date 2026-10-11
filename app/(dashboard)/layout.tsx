import type { Metadata } from "next";
import { AppShell } from "../../components/shared/AppShell";

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APP_NAME || "Serenx",
  description: "Projects, offers and chat with your design team"
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
