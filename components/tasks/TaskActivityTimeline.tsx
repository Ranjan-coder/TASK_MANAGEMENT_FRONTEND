"use client";

import { ActivityItem } from "@/types";
import { formatDateTime } from "@/lib/utils";
import { Clock } from "lucide-react";

export function TaskActivityTimeline({ activities }: { activities: ActivityItem[] }) {
  if (!activities || activities.length === 0) {
    return <p className="text-xs text-slate-400">No activity recorded yet.</p>;
  }

  return (
    <div className="space-y-4">
      {activities.map((item, index) => (
        <div key={item._id || index} className="flex items-start gap-3 text-xs">
          <div className="h-6 w-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 mt-0.5">
            <Clock className="h-3.5 w-3.5" />
          </div>
          <div className="flex-1 space-y-0.5">
            <p className="text-slate-800 dark:text-slate-200">
              <span className="font-semibold">{item.performedBy?.name || "System"}</span>{" "}
              <span className="text-slate-500">{item.action.replace("_", " ")}</span>
            </p>
            <p className="text-[11px] text-slate-400">{formatDateTime(item.timestamp)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
