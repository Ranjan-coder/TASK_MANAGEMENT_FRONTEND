"use client";

import Link from "next/link";
import { Task } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, Paperclip, MessageSquare } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface TaskCardProps {
  task: Task;
}

export function TaskCard({ task }: TaskCardProps) {
  const priorityColors = {
    low: "secondary",
    medium: "default",
    high: "warning",
    critical: "destructive"
  } as const;

  return (
    <Link href={`/tasks/${task._id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer border-slate-200 dark:border-slate-800">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Badge variant={priorityColors[task.priority] || "secondary"} className="capitalize text-[10px]">
              {task.priority}
            </Badge>
            <span className="text-[11px] text-slate-400 font-mono">#{task._id.slice(-4)}</span>
          </div>

          <h4 className="font-semibold text-sm line-clamp-2 text-slate-900 dark:text-slate-100">
            {task.title}
          </h4>

          {task.description && (
            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
              {task.description.replace(/<[^>]*>?/gm, "")}
            </p>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
            <div className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              <span>{formatDate(task.dueDate)}</span>
            </div>

            <div className="flex items-center gap-3">
              {task.attachments && task.attachments.length > 0 && (
                <div className="flex items-center gap-0.5">
                  <Paperclip className="h-3.5 w-3.5" />
                  <span>{task.attachments.length}</span>
                </div>
              )}

              <div className="flex -space-x-1.5 overflow-hidden">
                {task.assignedTo?.slice(0, 3).map((assignee) => (
                  <div
                    key={assignee._id}
                    title={assignee.name}
                    className="inline-block h-5 w-5 rounded-full bg-blue-500 ring-2 ring-white dark:ring-slate-900 text-[9px] font-bold text-white flex items-center justify-center"
                  >
                    {assignee.name?.[0] || "U"}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
