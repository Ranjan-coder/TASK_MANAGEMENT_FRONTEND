"use client";

import { useEffect, useState } from "react";
import { CalendarCheck, NotebookPen, ListTodo, AlarmClock, Video } from "lucide-react";
import { PlannerGate } from "@/components/planner/PlannerGate";
import { NotesTab } from "@/components/planner/NotesTab";
import { TodosTab } from "@/components/planner/TodosTab";
import { RemindersTab } from "@/components/planner/RemindersTab";
import { MeetingsTab } from "@/components/planner/MeetingsTab";
import { usePlannerSync } from "@/hooks/usePlanner";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "notes", label: "Notes", icon: NotebookPen },
  { key: "todos", label: "Todos", icon: ListTodo },
  { key: "reminders", label: "Reminders", icon: AlarmClock },
  { key: "meetings", label: "Meetings", icon: Video }
] as const;
type Tab = (typeof TABS)[number]["key"];

/** Planner: private notes, todo lists, reminders and meeting invites (end-to-end encrypted). */
export default function PlannerPage() {
  const [tab, setTab] = useState<Tab>("notes");
  usePlannerSync(); // changes from the person's other devices appear here

  // Deep links from notifications: /planner?tab=reminders
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (TABS.some((x) => x.key === t)) setTab(t as Tab);
  }, []);
  const select = (t: Tab) => {
    setTab(t);
    window.history.replaceState(null, "", `/planner?tab=${t}`);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
          <CalendarCheck className="h-5 w-5 text-violet-300" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Planner</h1>
          <p className="text-sm text-slate-400">Notes, todos, reminders and meetings, just for you.</p>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto" role="tablist">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => select(key)}
            className={cn("inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border text-sm whitespace-nowrap", tab === key ? "bg-violet-600/25 border-violet-500/50 text-white" : "border-slate-700 text-slate-300")}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      <PlannerGate>
        {(key) => (
          <div role="tabpanel">
            {tab === "notes" && <NotesTab vaultKey={key} />}
            {tab === "todos" && <TodosTab vaultKey={key} />}
            {tab === "reminders" && <RemindersTab vaultKey={key} />}
            {tab === "meetings" && <MeetingsTab />}
          </div>
        )}
      </PlannerGate>
    </div>
  );
}
