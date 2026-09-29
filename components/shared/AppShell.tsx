"use client";

import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { AccountGate } from "./AccountGate";
import { LiveConnection } from "./LiveConnection";
import { ReplyReminderPopup } from "./ReplyReminder";
import { CustomerShell } from "@/components/customer/CustomerShell";
import { useAuth } from "@/hooks/useAuth";

/**
 * Picks the frame for the signed-in user: the customer portal (Home + Chat)
 * or the staff app (sidebar + topbar). Pages such as /chat are shared, so the
 * frame is chosen by role rather than by route.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading && !user) {
    return (
      <div className="flex h-[100dvh] w-screen items-center justify-center bg-slate-950" aria-busy="true">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-violet-500" />
        <span className="sr-only">Loading</span>
      </div>
    );
  }

  if (user?.role === "customer") {
    return (
      <>
        <AccountGate />
        <LiveConnection />
        <CustomerShell>{children}</CustomerShell>
      </>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      <AccountGate />
      <LiveConnection />
      {user && ["superadmin", "admin", "user"].includes(user.role) && <ReplyReminderPopup />}
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden bg-slate-950">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6 md:p-8 min-w-0 bg-slate-950">{children}</main>
      </div>
    </div>
  );
}
