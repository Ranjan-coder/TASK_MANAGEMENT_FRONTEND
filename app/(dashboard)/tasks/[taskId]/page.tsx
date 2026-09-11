"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { tasksApi } from "../../../../lib/api/tasks.api";
import { commentsApi } from "../../../../lib/api/comments.api";
import { TaskActivityTimeline } from "../../../../components/tasks/TaskActivityTimeline";
import { CommentList } from "../../../../components/comments/CommentList";
import { CommentEditor } from "../../../../components/comments/CommentEditor";
import { FileUploader } from "../../../../components/uploads/FileUploader";
import { FilePreview } from "../../../../components/uploads/FilePreview";
import type { Task, Comment, TaskStatus, Attachment } from "../../../../types";

const STATUS_OPTIONS: TaskStatus[] = [
  "todo", "in_progress", "in_review", "completed", "blocked", "cancelled"
];

const STATUS_COLOR: Record<string, string> = {
  todo: "bg-slate-500/20 text-slate-300",
  in_progress: "bg-blue-500/20 text-blue-300",
  in_review: "bg-amber-500/20 text-amber-300",
  completed: "bg-green-500/20 text-green-300",
  blocked: "bg-red-500/20 text-red-300",
  cancelled: "bg-slate-700/30 text-slate-500"
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

  if (!task) return <div className="text-slate-400">Task not found.</div>;

  return (
    <div className="max-w-6xl space-y-6 pb-16">
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
          <select
            value={task.status}
            onChange={(e) => statusMutation.mutate(e.target.value as TaskStatus)}
            disabled={statusMutation.isPending}
            className={`px-3 py-1.5 rounded-xl text-sm font-medium border-0 focus:ring-2 focus:ring-violet-500 cursor-pointer ${STATUS_COLOR[task.status] ?? "bg-slate-700 text-slate-300"}`}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s.replace("_", " ")}</option>
            ))}
          </select>
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
