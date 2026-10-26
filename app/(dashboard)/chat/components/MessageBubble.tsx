"use client";

import { toast } from "sonner";
import { Message, ChatAttachment, KeyRef } from "@/types/chat";
import { EditCancelledError, type EncryptedText } from "@/lib/crypto/conversationKeys";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNowStrict, isToday, isYesterday } from "date-fns";
import { Lock, AlertCircle, Check, CheckCheck, Clock, MessagesSquare, Pin, PinOff, Star, Forward, ChevronDown, Reply, Copy, Info, FileCheck2, Edit2, Trash2 } from "lucide-react";
import type { Tick } from "@/lib/chat/receipts";
import { useState, useRef, useEffect } from "react";
import { FilePreview } from "./FilePreview";
import { DeleteMessageDialog } from "./DeleteMessageDialog";
import { MessageText } from "./MessageText";
import { useMessageMenu, type MenuItem } from "@/lib/chat/messageMenu";
import { useMentions } from "./MentionContext";
import { encodeMentions, mentionedIn, mentionsToPlain } from "@/lib/chat/mentions";

interface MessageBubbleProps {
  message: Message;
  isMine: boolean;
  prevMessage?: Message;
  sessionKey: CryptoKey | null;
  onReact?: (emoji: string) => void;
  /** Called with "everyone" (sender only) or "me" once the user confirms in the delete dialog. */
  onDelete?: (scope: "me" | "everyone") => void;
  onReply?: () => void;
  onEdit?: (encrypted: EncryptedText) => Promise<void>;
  encryptFn?: (text: string) => Promise<EncryptedText>;
  /** Project chats: ask the customer to approve this design (staff, image/file messages) */
  onRequestApproval?: () => void;
  /** Rendered under the attachment, e.g. the design approval card */
  footer?: React.ReactNode;
  /** A message typed here that the server refused or never got */
  onRetry?: () => void;
  onDiscard?: () => void;
  /** My messages: ✓ sent, ✓✓ delivered, blue ✓✓ seen (lib/chat/receipts.ts) */
  tick?: Tick;
  tickTitle?: string;
  /** Groups: how many have seen it so far (shown until everyone has) */
  seenBy?: number;
  /** Staff, own messages in groups: who has seen it */
  onInfo?: () => void;
  /** Open this message's thread (reply in thread / "N replies") */
  onOpenThread?: () => void;
  /** Pinned in this chat; onTogglePin only for people who may pin */
  pinned?: boolean;
  onTogglePin?: () => void;
  /** Save for later (private ★) */
  onToggleStar?: () => void;
  /** Just jumped to: briefly outlined so the eye finds it */
  highlighted?: boolean;
  /** Staff: forward to other chats */
  onForward?: () => void;
}


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
  encryptFn,
  onRequestApproval,
  footer,
  onRetry,
  onDiscard,
  tick,
  tickTitle,
  seenBy,
  onInfo,
  onOpenThread,
  pinned,
  onTogglePin,
  onToggleStar,
  highlighted,
  onForward
}: MessageBubbleProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const bubbleContainerRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  // Is the chat's menu (lib/chat/messageMenu.ts) open for this message? A boolean
  // selector: opening a menu re-renders only the old and the new message.
  const menuOpen = useMessageMenu((st) => st.open?.messageId === message._id);

  const showAvatar = !isMine && prevMessage?.sender._id !== message.sender._id;
  const showDateSeparator =
    !prevMessage ||
    !isSameDay(new Date(message.createdAt), new Date(prevMessage.createdAt));

  const mentionInfo = useMentions();
  // Someone else's message that pings me (by name, @everyone or @here)
  const mentionsMe =
    !isMine && Boolean(mentionInfo.myId) && (Boolean(message.mentionsAll) || Boolean(message.mentions?.includes(mentionInfo.myId!)));

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

  // ── Copy: the text as shown (mentions as "@Name"), decrypted on this device ──
  const copyText = async () => {
    const text = mentionsToPlain(displayText || "", mentionInfo.nameOf);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Older browsers / no permission: copy through a temporary, off-screen text box
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      if (!ok) return toast.error("Couldn't copy");
    }
    toast.success("Copied");
  };

  // ── Options menu: the list is built on click, then handed to the one shared menu ──
  const openMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    const r = bubbleRef.current?.getBoundingClientRect();
    if (!r) return;
    const items = [
      onReply && { label: "Reply", icon: Reply, run: onReply },
      onOpenThread && { label: "Reply in thread", icon: MessagesSquare, run: onOpenThread },
      displayText && !decryptFailed && { label: "Copy", icon: Copy, run: copyText },
      onForward && { label: "Forward", icon: Forward, run: onForward },
      onToggleStar && { label: message.starred ? "Unstar" : "Star", icon: Star, run: onToggleStar, active: message.starred },
      onTogglePin && { label: pinned ? "Unpin" : "Pin", icon: pinned ? PinOff : Pin, run: onTogglePin },
      onInfo && { label: "Message info", icon: Info, run: onInfo },
      onRequestApproval && { label: "Ask for approval", icon: FileCheck2, run: onRequestApproval },
      isMine && onEdit && !message.attachments?.length && { label: "Edit", icon: Edit2, run: startEdit },
      onDelete && { label: "Delete", icon: Trash2, run: () => setShowDeleteConfirm(true), danger: true }
    ].filter(Boolean) as MenuItem[];
    useMessageMenu.getState().show({
      messageId: message._id,
      anchor: { top: r.top, bottom: r.bottom, left: r.left, right: r.right },
      alignRight: isMine,
      onReact,
      items
    });
  };

  // ── Start edit mode ──────────────────────────────────────────────────────
  const startEdit = () => {
    // Mention tokens are shown as "@Name" while editing and turned back on save
    setEditValue(mentionsToPlain(displayText || "", mentionInfo.nameOf));
    setEditing(true);
    setTimeout(() => {
      editRef.current?.focus();
      editRef.current?.select();
    }, 50);
  };

  const saveEdit = async () => {
    const typed = editValue.trim();
    if (!typed || !encryptFn || !onEdit) return;
    // People mentioned before stay mentioned (an edit doesn't notify anyone again)
    const kept = mentionedIn(displayText || "").map((id) => ({ id, name: mentionInfo.nameOf(id) ?? "" })).filter((p) => p.name);
    const text = encodeMentions(typed, kept, Boolean(message.mentionsAll)).text;
    setSaving(true);
    try {
      await onEdit(await encryptFn(text));
      setEditing(false);
    } catch (err) {
      // Cancelled at the "Send anyway?" prompt: keep editing
      if (!(err instanceof EditCancelledError)) throw err;
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

      <div className={cn("group/msg relative flex items-end gap-2 mb-0.5", isMine && "flex-row-reverse")}>
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
                    ? (message.replyTo.decryptedContent && mentionsToPlain(message.replyTo.decryptedContent, mentionInfo.nameOf)) ||
                      message.replyTo.content ||
                      "🔒 Encrypted"
                    : "Message"}
                </p>
              </div>
            </div>
          )}

          {/* Main bubble */}
          <div
            ref={bubbleRef}
            className={cn(
              "relative px-4 py-2.5 rounded-2xl text-sm leading-relaxed select-text",
              isMine
                ? "bg-violet-600/25 border border-violet-500/30 text-slate-100 rounded-br-sm"
                : "bg-slate-800 border border-slate-700/60 text-slate-200 rounded-bl-sm",
              mentionsMe && "border-amber-400/40 ring-1 ring-amber-400/20",
              highlighted && "ring-2 ring-sky-400/70 transition-shadow",
              decryptFailed && "border-rose-500/30 bg-rose-500/5"
            )}
          >
            {/* Options button: shown by CSS on hover / keyboard focus (always on touch screens); opens the chat's one menu */}
            {!editing && !message.localStatus && (
              <button
                type="button"
                data-menu-trigger={message._id}
                onClick={openMenu}
                aria-label="Message options"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className={cn(
                  // Just outside the bubble, at its end: never covers the text
                  "absolute top-1/2 -translate-y-1/2 z-10 h-7 w-7 rounded-full flex items-center justify-center text-slate-300 hover:text-white transition-opacity border border-slate-700",
                  isMine ? "right-full mr-1.5" : "left-full ml-1.5",
                  "bg-slate-800 hover:bg-slate-700",
                  menuOpen
                    ? "opacity-100"
                    : "opacity-0 group-hover/msg:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-70"
                )}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            )}
            {message.forwarded && (
              <p className="flex items-center gap-1 text-[10px] italic text-slate-400 mb-1">
                <Forward className="h-3 w-3" aria-hidden /> Forwarded
              </p>
            )}

            {/* Attachments */}
            {message.attachments && message.attachments.length > 0 && (
              <div className="mb-2 space-y-2">
                {message.attachments.map((att, i) => (
                  <FilePreview key={i} attachment={att} sessionKey={sessionKey} />
                ))}
              </div>
            )}
            {footer}

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
              <MessageText text={displayText} />
            ) : null}

            {/* Timestamp row */}
            <div className={cn("flex items-center gap-1.5 mt-1.5", isMine ? "justify-end" : "justify-start")}>
              {pinned && <Pin className="h-2.5 w-2.5 text-violet-400" aria-label="Pinned" />}
              {message.starred && <Star className="h-2.5 w-2.5 text-amber-400 fill-amber-400" aria-label="Starred" />}
              {message.isEdited && <span className="text-[10px] text-slate-500 italic">edited</span>}
              {/* The text doesn't match what the sender's app committed to: it can't be reported with proof */}
              {message.type === "text" && message.franking?.commitment && message.frankVerified === false && !message.decryptionFailed && (
                <span className="text-[10px] text-amber-400" title="This message's proof didn't check out. If it's a problem, report it with a screenshot.">⚠ couldn't verify</span>
              )}
              {message.localStatus === "sending" ? (
                <span className="flex items-center gap-1 text-[10px] text-slate-500" title="Sending — it will go as soon as you're connected">
                  <Clock className="h-2.5 w-2.5" aria-hidden />
                  Sending…
                </span>
              ) : (
                <span className="text-[10px] text-slate-500">{timeStr}</span>
              )}
              {isMine && !message.localStatus && <Lock className="h-2.5 w-2.5 text-emerald-500/70" />}
              {isMine && !message.localStatus && tick && (
                <span title={tickTitle} aria-label={tickTitle} className="inline-flex items-center gap-0.5">
                  {tick === "read" || seenBy ? (
                    <CheckCheck className="h-3 w-3 text-sky-400" />
                  ) : tick === "delivered" ? (
                    <CheckCheck className="h-3 w-3 text-slate-500" />
                  ) : (
                    <Check className="h-3 w-3 text-slate-500" />
                  )}
                  {/* Groups: some but not all have seen it */}
                  {tick !== "read" && seenBy ? <span className="text-[10px] text-sky-400 tabular-nums">{seenBy} seen</span> : null}
                </span>
              )}
            </div>

            {/* Not sent: say why, and offer to try again or drop it */}
            {message.localStatus === "failed" && (
              <div className="flex flex-wrap items-center justify-end gap-2 mt-1.5" onClick={(e) => e.stopPropagation()}>
                <span className="flex items-center gap-1 text-[10px] text-rose-400" role="alert">
                  <AlertCircle className="h-3 w-3" aria-hidden />
                  {message.localError || "Not sent"}
                </span>
                {onRetry && (
                  <button onClick={onRetry} className="text-[10px] font-semibold text-violet-300 hover:text-violet-200 underline-offset-2 hover:underline">
                    Retry
                  </button>
                )}
                {onDiscard && (
                  <button onClick={onDiscard} className="text-[10px] font-semibold text-slate-400 hover:text-slate-200 underline-offset-2 hover:underline">
                    Discard
                  </button>
                )}
              </div>
            )}

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

          {/* Thread summary: "3 replies · 5 min ago" */}
          {onOpenThread && (message.threadReplyCount || 0) > 0 && (
            <button
              onClick={onOpenThread}
              className={cn(
                "mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-violet-300 hover:text-violet-200 hover:underline underline-offset-2",
                isMine && "ml-auto"
              )}
            >
              <MessagesSquare className="h-3 w-3" aria-hidden />
              {message.threadReplyCount} {message.threadReplyCount === 1 ? "reply" : "replies"}
              {message.threadLastReplyAt && (
                <span className="font-normal text-slate-500">· {formatDistanceToNowStrict(new Date(message.threadLastReplyAt))} ago</span>
              )}
            </button>
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
