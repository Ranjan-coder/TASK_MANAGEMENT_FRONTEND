import type { Metadata } from "next";
import { Sidebar } from "../../components/shared/Sidebar";
import { Topbar } from "../../components/shared/Topbar";

export const metadata: Metadata = {
  title: "TaskManager — Dashboard",
  description: "Manage your organization tasks efficiently"
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content area */}
      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden bg-slate-950">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6 md:p-8 min-w-0 bg-slate-950">
          {children}
        </main>
      </div>
    </div>
  );
}
