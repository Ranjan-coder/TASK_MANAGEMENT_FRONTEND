"use client";

import { Comment } from "@/types";
import { formatDateTime } from "@/lib/utils";
import { Paperclip } from "lucide-react";

export function CommentList({ comments }: { comments: Comment[] }) {
  if (!comments || comments.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-slate-400">
        No comments yet. Start the conversation below.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {comments.map((comment) => (
        <div
          key={comment._id}
          className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200 font-bold text-xs flex items-center justify-center">
                {comment.author?.name?.[0] || "U"}
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  {comment.author?.name}
                </span>
                <span className="text-[11px] text-slate-400 ml-2">
                  {formatDateTime(comment.createdAt)}
                </span>
              </div>
            </div>
            {comment.isEdited && (
              <span className="text-[10px] text-slate-400 italic">(edited)</span>
            )}
          </div>

          <div
            className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: comment.text }}
          />

          {comment.attachments && comment.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              {comment.attachments.map((att) => (
                <a
                  key={att._id}
                  href={att.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 dark:bg-slate-800 rounded-md text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <Paperclip className="h-3 w-3" />
                  <span>{att.originalName}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
