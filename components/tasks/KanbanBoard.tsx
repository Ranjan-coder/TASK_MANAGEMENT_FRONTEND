"use client";

import { Task, TaskStatus } from "@/types";
import { TaskCard } from "./TaskCard";

interface KanbanBoardProps {
  tasks: Task[];
  onStatusChange?: (taskId: string, status: TaskStatus) => void;
}

const COLUMNS: { id: TaskStatus; label: string; dotColor: string }[] = [
  { id: "todo", label: "To Do", dotColor: "bg-slate-400" },
  { id: "in_progress", label: "In Progress", dotColor: "bg-blue-500" },
  { id: "in_review", label: "In Review", dotColor: "bg-amber-500" },
  { id: "completed", label: "Completed", dotColor: "bg-emerald-500" }
];

export function KanbanBoard({ tasks }: KanbanBoardProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-start">
      {COLUMNS.map((column) => {
        const columnTasks = tasks.filter((t) => t.status === column.id);

        return (
          <div
            key={column.id}
            className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 border border-slate-200 dark:border-slate-800 flex flex-col space-y-4 min-h-[500px]"
          >
            {/* Column Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${column.dotColor}`} />
                <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                  {column.label}
                </h3>
              </div>
              <span className="text-xs font-semibold px-2 py-0.5 bg-white dark:bg-slate-800 rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400">
                {columnTasks.length}
              </span>
            </div>

            {/* Task List */}
            <div className="space-y-3 flex-1 overflow-y-auto max-h-[700px]">
              {columnTasks.map((task) => (
                <TaskCard key={task._id} task={task} />
              ))}

              {columnTasks.length === 0 && (
                <div className="h-32 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-lg flex items-center justify-center text-xs text-slate-400">
                  No tasks
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
