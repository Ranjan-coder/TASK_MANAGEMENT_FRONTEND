"use client";

import { Message, ChatAttachment } from "@/types/chat";
import { cn } from "@/lib/utils";
import { format, isToday, isYesterday } from "date-fns";
import { Trash2, Lock, AlertCircle, Reply, Edit2, Check, X, SmilePlus } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { FilePreview } from "./FilePreview";
import { DeleteMessageDialog } from "./DeleteMessageDialog";
import { EmojiPicker } from "./EmojiPicker";

interface MessageBubbleProps {
  message: Message;
  isMine: boolean;
  prevMessage?: Message;
  sessionKey: CryptoKey | null;
  onReact?: (emoji: string) => void;
  /** Called with "everyone" (sender only) or "me" once the user confirms in the delete dialog. */
  onDelete?: (scope: "me" | "everyone") => void;
  onReply?: () => void;
  onEdit?: (newCiphertext: string, newIv: string) => Promise<void>;
  encryptFn?: (text: string) => Promise<{ ciphertext: string; iv: string }>;
}

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

// "Delete for everyone" is only offered within this window of sending — keep
// in sync with DELETE_FOR_EVERYONE_WINDOW_MS in the backend's chat.service.js.
// The backend is the source of truth; this only controls whether the option
// is shown, so the two can drift by a few seconds without causing bugs.
const DELETE_FOR_EVERYONE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

export function MessageBubble({
  message,
  isMine,
  prevMessage,
  sessionKey,
  onReact,
  onDelete,
  onReply,
  onEdit,
  encryptFn
}: MessageBubbleProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [showTouchActions, setShowTouchActions] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const bubbleContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showTouchActions) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (bubbleContainerRef.current && !bubbleContainerRef.current.contains(e.target as Node)) {
        setShowTouchActions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showTouchActions]);

  const showAvatar = !isMine && prevMessage?.sender._id !== message.sender._id;
  const showDateSeparator =
    !prevMessage ||
    !isSameDay(new Date(message.createdAt), new Date(prevMessage.createdAt));

  const timeStr = format(new Date(message.createdAt), "HH:mm");
  const displayText = message.decryptedContent ?? null;
  const decryptFailed = message.decryptionFailed;

  // ── System message ───────────────────────────────────────────────────────
  if (message.type === "system") {
    return (
      <div className="flex justify-center py-2">
        <span className="text-[11px] text-slate-500 bg-slate-800/50 px-3 py-1 rounded-full border border-slate-700/50">
          {message.content}
        </span>
      </div>
    );
  }

  // ── Deleted message ──────────────────────────────────────────────────────
  if (message.isDeleted) {
    return (
      <div className={cn("flex gap-2 mb-0.5", isMine && "flex-row-reverse")}>
        <div className="w-7 shrink-0" />
        <div className="max-w-xs px-4 py-2 rounded-2xl bg-slate-800/40 border border-slate-700/40 border-dashed">
          <span className="text-xs text-slate-500 italic">Message deleted</span>
        </div>
      </div>
    );
  }

  // ── Start edit mode ──────────────────────────────────────────────────────
  const startEdit = () => {
    setEditValue(displayText || "");
    setEditing(true);
    setTimeout(() => {
      editRef.current?.focus();
      editRef.current?.select();
    }, 50);
  };

  const saveEdit = async () => {
    const text = editValue.trim();
    if (!text || !encryptFn || !onEdit) return;
    setSaving(true);
    try {
      const { ciphertext, iv } = await encryptFn(text);
      await onEdit(ciphertext, iv);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Date separator */}
      {showDateSeparator && (
        <div className="flex items-center gap-3 py-3">
          <div className="flex-1 h-px bg-slate-800" />
          <span className="text-[10px] text-slate-500 font-medium shrink-0">
            {isToday(new Date(message.createdAt))
              ? "Today"
              : isYesterday(new Date(message.createdAt))
              ? "Yesterday"
              : format(new Date(message.createdAt), "d MMM yyyy")}
          </span>
          <div className="flex-1 h-px bg-slate-800" />
        </div>
      )}

      <div className={cn("group flex items-end gap-2 mb-0.5", isMine && "flex-row-reverse")}>
        {/* Avatar (others only) */}
        {!isMine && (
          <div className="shrink-0 w-7">
            {showAvatar ? (
              <div className="h-7 w-7 rounded-full bg-gradient-to-br from-violet-600/30 to-slate-600 flex items-center justify-center text-[10px] font-bold text-slate-300 border border-slate-700">
                {message.sender.name[0]?.toUpperCase()}
              </div>
            ) : null}
          </div>
        )}

        {/* Bubble + reply context */}
        <div
          ref={bubbleContainerRef}
          className={cn("relative max-w-[85%] sm:max-w-md lg:max-w-lg", isMine ? "items-end" : "items-start")}
        >
          {/* Sender name (group, others) */}
          {showAvatar && !isMine && (
            <p className="text-[10px] text-slate-400 font-medium mb-1 ml-1">
              {message.sender.name}
            </p>
          )}

          {/* Reply-to quoted snippet */}
          {message.replyTo && (
            <div
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-xl mb-1 border max-w-full",
                isMine
                  ? "bg-violet-800/20 border-violet-600/20 ml-auto"
                  : "bg-slate-700/30 border-slate-600/30"
              )}
            >
              <div className="w-0.5 rounded-full bg-violet-400 self-stretch shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] text-violet-300 font-semibold truncate">
                  {typeof message.replyTo === "object" ? message.replyTo.sender?.name : "Unknown"}
                </p>
                <p className="text-[11px] text-slate-400 truncate">
                  {typeof message.replyTo === "object"
                    ? message.replyTo.decryptedContent ||
                      message.replyTo.content ||
                      "🔒 Encrypted"
                    : "Message"}
                </p>
              </div>
            </div>
          )}

          {/* Main bubble */}
          <div
            onClick={() => !editing && setShowTouchActions((v) => !v)}
            className={cn(
              "relative px-4 py-2.5 rounded-2xl text-sm leading-relaxed cursor-pointer select-text",
              isMine
                ? "bg-violet-600/25 border border-violet-500/30 text-slate-100 rounded-br-sm"
                : "bg-slate-800 border border-slate-700/60 text-slate-200 rounded-bl-sm",
              decryptFailed && "border-rose-500/30 bg-rose-500/5"
            )}
          >
            {/* Attachments */}
            {message.attachments && message.attachments.length > 0 && (
              <div className="mb-2 space-y-2">
                {message.attachments.map((att, i) => (
                  <FilePreview key={i} attachment={att} sessionKey={sessionKey} />
                ))}
              </div>
            )}

            {/* Text content */}
            {editing ? (
              <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                <textarea
                  ref={editRef}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(); }
                    if (e.key === "Escape") setEditing(false);
                  }}
                  rows={2}
                  className="w-full bg-slate-700/60 border border-violet-500/40 rounded-xl px-3 py-2 text-sm text-white resize-none focus:outline-none focus:ring-1 focus:ring-violet-500/40"
                />
                <div className="flex gap-2">
                  <button
                    onClick={saveEdit}
                    disabled={saving}
                    className="flex-1 py-1 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium transition disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="flex-1 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : decryptFailed ? (
              <div className="flex items-center gap-1.5 text-rose-400">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span className="text-xs">{displayText}</span>
              </div>
            ) : displayText === null && message.type !== "file" && message.type !== "image" ? (
              <div className="flex items-center gap-1.5 text-slate-500">
                <Lock className="h-3 w-3 animate-pulse" />
                <span className="text-xs">Decrypting…</span>
              </div>
            ) : displayText ? (
              <span className="whitespace-pre-wrap break-words">{displayText}</span>
            ) : null}

            {/* Timestamp row */}
            <div className={cn("flex items-center gap-1.5 mt-1.5", isMine ? "justify-end" : "justify-start")}>
              {message.isEdited && <span className="text-[10px] text-slate-500 italic">edited</span>}
              <span className="text-[10px] text-slate-500">{timeStr}</span>
              {isMine && <Lock className="h-2.5 w-2.5 text-emerald-500/70" />}
            </div>

            {/* Reactions */}
            {message.reactions.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {message.reactions.map((r) => (
                  <button
                    key={r.emoji}
                    onClick={(e) => {
                      e.stopPropagation();
                      onReact?.(r.emoji);
                    }}
                    className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-slate-700/60 hover:bg-slate-600/60 border border-slate-600/40 text-xs transition"
                  >
                    <span>{r.emoji}</span>
                    <span className="text-slate-400 text-[10px]">{r.users.length}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Actions (desktop hover + mobile touch tap) */}
          {!editing && (
            <div
              className={cn(
                "absolute -top-8.5 z-20 flex items-center gap-1 transition-all duration-150 max-w-[calc(100vw-3rem)]",
                isMine ? "right-0" : "left-0",
                showTouchActions
                  ? "opacity-100 pointer-events-auto"
                  : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto"
              )}
            >
              {/* Quick reactions */}
              <div className="flex items-center gap-0.5 bg-slate-800/95 backdrop-blur-md border border-slate-700 rounded-xl px-1.5 py-0.5 shadow-xl shrink-0">
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowTouchActions(false);
                      onReact?.(emoji);
                    }}
                    className="h-6 w-6 rounded-lg flex items-center justify-center text-sm hover:bg-slate-700 transition"
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              {/* More reactions — full emoji picker, not just the 6 quick ones */}
              {onReact && (
                <div className="relative shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowReactionPicker((v) => {
                        const next = !v;
                        // Pin the toolbar open (independent of CSS :hover) while the
                        // picker is open, so moving the mouse toward it doesn't make
                        // the whole toolbar — and the picker inside it — fade out.
                        if (next) setShowTouchActions(true);
                        return next;
                      });
                    }}
                    className="h-6 w-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-violet-400 hover:bg-slate-700 transition bg-slate-800/95 backdrop-blur-md border border-slate-700 shadow-md shrink-0"
                    title="More reactions"
                  >
                    <SmilePlus className="h-3 w-3" />
                  </button>
                  {showReactionPicker && (
                    <EmojiPicker
                      onSelect={(emoji) => {
                        onReact(emoji);
                        setShowReactionPicker(false);
                        setShowTouchActions(false);
                      }}
                      onClose={() => setShowReactionPicker(false)}
                      anchorClassName={cn("top-8 z-50", isMine ? "right-0" : "left-0")}
                    />
                  )}
                </div>
              )}

              {/* Reply */}
              {onReply && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowTouchActions(false);
                    onReply();
                  }}
                  className="h-6 w-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition bg-slate-800/95 backdrop-blur-md border border-slate-700 shadow-md shrink-0"
                  title="Reply"
                >
                  <Reply className="h-3 w-3" />
                </button>
              )}

              {/* Edit (own messages only) */}
              {isMine && onEdit && !message.attachments?.length && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowTouchActions(false);
                    startEdit();
                  }}
                  className="h-6 w-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-violet-400 hover:bg-slate-700 transition bg-slate-800/95 backdrop-blur-md border border-slate-700 shadow-md shrink-0"
                  title="Edit message"
                >
                  <Edit2 className="h-3 w-3" />
                </button>
              )}

              {/* Delete (any message — "delete for me" is always available, "for everyone" only for own messages) */}
              {onDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowTouchActions(false);
                    setShowDeleteConfirm(true);
                  }}
                  className="h-6 w-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-slate-700 transition bg-slate-800/95 backdrop-blur-md border border-slate-700 shadow-md shrink-0"
                  title="Delete message"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {showDeleteConfirm && onDelete && (
        <DeleteMessageDialog
          isMine={isMine}
          canDeleteForEveryone={
            isMine && Date.now() - new Date(message.createdAt).getTime() <= DELETE_FOR_EVERYONE_WINDOW_MS
          }
          onDeleteForMe={() => {
            setShowDeleteConfirm(false);
            onDelete("me");
          }}
          onDeleteForEveryone={() => {
            setShowDeleteConfirm(false);
            onDelete("everyone");
          }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </>
  );
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
