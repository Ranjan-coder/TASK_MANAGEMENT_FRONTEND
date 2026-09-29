import type { Metadata } from "next";
import { AppShell } from "../../components/shared/AppShell";

export const metadata: Metadata = {
  title: "Bonito",
  description: "Bonito Interiors — projects, offers and chat with your design team"
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
