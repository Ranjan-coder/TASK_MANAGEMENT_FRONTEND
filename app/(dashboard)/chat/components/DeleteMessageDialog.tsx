"use client";

import { Trash2, Users, EyeOff, X, Clock } from "lucide-react";

interface DeleteMessageDialogProps {
  /** Whether the current viewer sent this message. */
  isMine: boolean;
  /** isMine AND still within the 10-minute "delete for everyone" window. */
  canDeleteForEveryone: boolean;
  onDeleteForMe: () => void;
  onDeleteForEveryone: () => void;
  onCancel: () => void;
}

export function DeleteMessageDialog({
  isMine,
  canDeleteForEveryone,
  onDeleteForMe,
  onDeleteForEveryone,
  onCancel
}: DeleteMessageDialogProps) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-rose-400" />
            <span className="font-semibold text-white text-sm">Delete message?</span>
          </div>
          <button
            onClick={onCancel}
            className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-2.5">
          {canDeleteForEveryone ? (
            <button
              onClick={onDeleteForEveryone}
              className="w-full flex items-start gap-3 px-4 py-3 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-sm font-medium transition text-left"
            >
              <Users className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                <span className="block">Delete for everyone</span>
                <span className="block text-[11px] text-rose-400/70 font-normal mt-0.5">
                  Removes this message for all participants
                </span>
              </span>
            </button>
          ) : (
            isMine && (
              <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-slate-800 bg-slate-800/30 text-slate-500 text-xs">
                <Clock className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>
                  This message is more than 10 minutes old, so it can no longer be deleted for
                  everyone — only for you.
                </span>
              </div>
            )
          )}

          <button
            onClick={onDeleteForMe}
            className="w-full flex items-start gap-3 px-4 py-3 rounded-xl border border-slate-700 bg-slate-800/60 hover:bg-slate-800 text-slate-200 text-sm font-medium transition text-left"
          >
            <EyeOff className="h-4 w-4 shrink-0 mt-0.5 text-slate-400" />
            <span>
              <span className="block">Delete for me</span>
              <span className="block text-[11px] text-slate-500 font-normal mt-0.5">
                Only removes it from your view — others can still see it
              </span>
            </span>
          </button>

          <button
            onClick={onCancel}
            className="w-full py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 text-sm font-medium transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
