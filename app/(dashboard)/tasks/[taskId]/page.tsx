"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { tasksApi } from "../../../../lib/api/tasks.api";
import { commentsApi } from "../../../../lib/api/comments.api";
import { TaskActivityTimeline } from "../../../../components/tasks/TaskActivityTimeline";
import { CommentList } from "../../../../components/comments/CommentList";
import { CommentEditor } from "../../../../components/comments/CommentEditor";
import { FileUploader } from "../../../../components/uploads/FileUploader";
import { FilePreview } from "../../../../components/uploads/FilePreview";
import type { Task, Comment, TaskStatus, Attachment } from "../../../../types";
import Link from "next/link";
import { Check, ChevronDown, ArrowLeft } from "lucide-react";

const STATUS_OPTIONS: TaskStatus[] = [
  "todo", "in_progress", "in_review", "completed", "blocked", "cancelled"
];

const STATUS_CONFIG: Record<TaskStatus, { label: string; badge: string; dot: string }> = {
  todo: {
    label: "Todo",
    badge: "bg-slate-500/20 text-slate-300 border-slate-600/40 hover:bg-slate-500/30",
    dot: "bg-slate-400"
  },
  in_progress: {
    label: "In Progress",
    badge: "bg-blue-500/20 text-blue-300 border-blue-500/40 hover:bg-blue-500/30",
    dot: "bg-blue-400"
  },
  in_review: {
    label: "In Review",
    badge: "bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30",
    dot: "bg-amber-400"
  },
  completed: {
    label: "Completed",
    badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30",
    dot: "bg-emerald-400"
  },
  blocked: {
    label: "Blocked",
    badge: "bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30",
    dot: "bg-rose-400"
  },
  cancelled: {
    label: "Cancelled",
    badge: "bg-slate-700/40 text-slate-400 border-slate-600/30 hover:bg-slate-700/60",
    dot: "bg-slate-500"
  }
};

const PRIORITY_COLOR: Record<string, string> = {
  critical: "text-red-400",
  high: "text-orange-400",
  medium: "text-amber-400",
  low: "text-slate-400"
};

export default function TaskDetailPage() {
  const params = useParams();
  const taskId = params.taskId as string;
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"comments" | "activity" | "files">("comments");

  const { data: task, isLoading } = useQuery<Task>({
    queryKey: ["task", taskId],
    queryFn: () => tasksApi.getTask(taskId).then((r) => r.data.data)
  });

  const { data: comments } = useQuery<Comment[]>({
    queryKey: ["comments", taskId],
    queryFn: () => commentsApi.getComments(taskId).then((r) => r.data.data)
  });

  const { data: activity } = useQuery({
    queryKey: ["task-activity", taskId],
    queryFn: () => tasksApi.getTaskActivity(taskId).then((r) => r.data.data),
    enabled: activeTab === "activity"
  });

  const statusMutation = useMutation({
    mutationFn: (status: TaskStatus) => tasksApi.updateStatus(taskId, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["task", taskId] })
  });

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse max-w-6xl">
        <div className="h-10 w-2/3 rounded-xl bg-slate-800" />
        <div className="h-64 rounded-2xl bg-slate-800" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="max-w-6xl space-y-4">
        <Link
          href="/tasks"
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Tasks</span>
        </Link>
        <div className="text-slate-400">Task not found.</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl space-y-6 pb-16">
      {/* Top navigation / Back button */}
      <div>
        <Link
          href="/tasks"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-white transition-colors group w-fit"
        >
          <div className="h-8 w-8 rounded-xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-400 group-hover:text-white group-hover:border-slate-600 transition">
            <ArrowLeft className="h-4 w-4" />
          </div>
          <span>Back to Tasks</span>
        </Link>
      </div>

      {/* Task Header */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4 justify-between">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-white mb-2 leading-tight">{task.title}</h1>
            <div className="flex flex-wrap gap-2">
              {task.category && (
                <span className="text-xs px-2.5 py-1 rounded-full bg-slate-700 text-slate-300">{task.category}</span>
              )}
              {task.tags?.map((tag) => (
                <span key={tag} className="text-xs px-2.5 py-1 rounded-full bg-violet-500/10 text-violet-400">{tag}</span>
              ))}
            </div>
          </div>
          {/* Status selector */}
          <StatusDropdown
            value={task.status}
            onChange={(s) => statusMutation.mutate(s)}
            disabled={statusMutation.isPending}
          />
        </div>

        {/* Meta grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <MetaItem
            label="Priority"
            value={<span className={`font-semibold capitalize ${PRIORITY_COLOR[task.priority]}`}>{task.priority}</span>}
          />
          <MetaItem
            label="Due Date"
            value={task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "—"}
          />
          <MetaItem
            label="Assigned By"
            value={(task.assignedBy as { name: string })?.name ?? "—"}
          />
          <MetaItem
            label="Assignees"
            value={
              <div className="flex -space-x-2">
                {(task.assignedTo as { _id: string; name: string }[])?.map((u) => (
                  <div
                    key={u._id}
                    className="w-6 h-6 rounded-full bg-violet-600 border-2 border-slate-800 flex items-center justify-center text-xs text-white"
                    title={u.name}
                  >
                    {u.name?.[0]}
                  </div>
                ))}
              </div>
            }
          />
        </div>

        {/* Description */}
        {task.description && (
          <div className="mt-5 pt-5 border-t border-slate-700">
            <p className="text-slate-500 text-xs font-medium uppercase tracking-wider mb-2">Description</p>
            <div
              className="text-slate-300 text-sm leading-relaxed prose prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: task.description }}
            />
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800/50 p-1 rounded-xl border border-slate-700 w-fit">
        {(["comments", "activity", "files"] as const).map((tab) => (
          <button
            key={tab}
            id={`tab-${tab}`}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${activeTab === tab ? "bg-violet-600 text-white" : "text-slate-400 hover:text-white"}`}
          >
            {tab}
            {tab === "comments" && comments && (
              <span className="ml-1.5 text-xs opacity-70">({comments.length})</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "comments" && (
        <div className="space-y-4">
          <CommentList comments={comments ?? []} />
          <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-5">
            <p className="text-sm font-medium text-slate-300 mb-3">Add a comment</p>
            <CommentEditor
              onSubmit={async (text) => {
                await commentsApi.addComment(taskId, { text });
                queryClient.invalidateQueries({ queryKey: ["comments", taskId] });
              }}
            />
          </div>
        </div>
      )}

      {activeTab === "activity" && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
          <TaskActivityTimeline activities={activity ?? []} />
        </div>
      )}

      {activeTab === "files" && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 space-y-4">
          <p className="text-white font-semibold">Attachments</p>
          <FilePreview
            attachments={(task.attachments as Attachment[]) ?? []}
            canDelete={true}
            onDelete={(id) => {
              console.log("delete attachment", id);
              queryClient.invalidateQueries({ queryKey: ["task", taskId] });
            }}
          />
          <FileUploader
            entityType="task"
            entityId={taskId}
            onUploaded={() => queryClient.invalidateQueries({ queryKey: ["task", taskId] })}
          />
        </div>
      )}
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-slate-500 text-xs font-medium uppercase tracking-wider mb-1">{label}</p>
      <div className="text-slate-200 text-sm">{value}</div>
    </div>
  );
}

interface StatusDropdownProps {
  value: TaskStatus;
  onChange: (status: TaskStatus) => void;
  disabled?: boolean;
}

function StatusDropdown({ value, onChange, disabled }: StatusDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentConfig = STATUS_CONFIG[value] ?? {
    label: value.replace("_", " "),
    badge: "bg-slate-700 text-slate-300 border-slate-600",
    dot: "bg-slate-400"
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`px-3 py-1.5 rounded-xl text-sm font-medium border flex items-center gap-2 cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-violet-500/50 ${currentConfig.badge} ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${currentConfig.dot}`} />
        <span>{currentConfig.label}</span>
        <ChevronDown className={`w-3.5 h-3.5 opacity-70 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1.5 w-44 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl p-1 z-50">
          <div className="space-y-0.5">
            {STATUS_OPTIONS.map((status) => {
              const config = STATUS_CONFIG[status];
              const isSelected = status === value;
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => {
                    onChange(status);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors text-left ${
                    isSelected
                      ? "bg-slate-800 text-white font-semibold"
                      : "text-slate-300 hover:text-white hover:bg-slate-800/60"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${config.dot}`} />
                    <span className="capitalize">{config.label}</span>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-violet-400" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
