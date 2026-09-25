"use client";

import { useRef, useCallback, KeyboardEvent, useState } from "react";
import { Send, Paperclip, Smile, X, Reply } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmojiPicker } from "./EmojiPicker";
import { Message } from "@/types/chat";

interface MessageInputProps {
  onSend: (text: string) => Promise<void> | void;
  onTyping?: () => void;
  onAttachClick?: () => void;
  disabled?: boolean;
  placeholder?: string;
  replyTo?: Message | null;
  onCancelReply?: () => void;
}

export function MessageInput({
  onSend,
  onTyping,
  onAttachClick,
  disabled,
  placeholder,
  replyTo,
  onCancelReply
}: MessageInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showEmoji, setShowEmoji] = useState(false);

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    onTyping?.();
  };

  const handleSend = useCallback(async () => {
    const el = textareaRef.current;
    if (!el) return;
    const text = el.value.trim();
    if (!text || disabled) return;
    el.value = "";
    el.style.height = "auto";
    await onSend(text);
  }, [onSend, disabled]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    el.value = el.value.slice(0, start) + emoji + el.value.slice(end);
    el.selectionStart = el.selectionEnd = start + emoji.length;
    el.focus();
    handleInput();
  };

  const replyPreview = replyTo?.decryptedContent || replyTo?.content || "🔒 Encrypted message";
  const replyName = replyTo?.sender?.name || "Unknown";

  return (
    <div className="border-t border-slate-800 bg-slate-900/60 shrink-0">
      {/* Reply-to banner */}
      {replyTo && (
        <div className="px-4 pt-2 flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-violet-600/10 border border-violet-500/25 min-w-0">
            <Reply className="h-3.5 w-3.5 text-violet-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-violet-300">{replyName}</p>
              <p className="text-xs text-slate-400 truncate">{replyPreview}</p>
            </div>
          </div>
          <button
            onClick={onCancelReply}
            className="h-7 w-7 shrink-0 rounded-lg flex items-center justify-center text-slate-500 hover:text-white hover:bg-slate-700 transition"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Input row */}
      <div className="px-2.5 sm:px-4 py-2 sm:py-3 relative">
        <div
          className={cn(
            "flex items-end gap-1.5 sm:gap-2 bg-slate-800/80 border rounded-2xl px-2.5 sm:px-3 py-1.5 sm:py-2 transition",
            disabled
              ? "border-slate-700/40 opacity-60 cursor-not-allowed"
              : "border-slate-700 focus-within:border-violet-500/50 focus-within:ring-1 focus-within:ring-violet-500/20"
          )}
        >
          {/* Attachment */}
          <button
            disabled={disabled}
            onClick={onAttachClick}
            title="Attach file (E2E encrypted)"
            className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-700 transition"
          >
            <Paperclip className="h-4 w-4" />
          </button>

          {/* Text area */}
          <textarea
            ref={textareaRef}
            disabled={disabled}
            placeholder={placeholder || "Type a message…"}
            rows={1}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 resize-none focus:outline-none py-1 max-h-40 disabled:cursor-not-allowed"
          />

          {/* Emoji */}
          <button
            disabled={disabled}
            onClick={() => setShowEmoji((v) => !v)}
            title="Emoji"
            className={cn(
              "h-8 w-8 shrink-0 flex items-center justify-center rounded-lg transition",
              showEmoji
                ? "bg-violet-600/25 text-violet-400"
                : "text-slate-500 hover:text-slate-300 hover:bg-slate-700"
            )}
          >
            <Smile className="h-4 w-4" />
          </button>

          {/* Send */}
          <button
            onClick={handleSend}
            disabled={disabled}
            className="h-8 w-8 shrink-0 flex items-center justify-center rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition shadow-md shadow-violet-600/20"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Emoji picker */}
        {showEmoji && (
          <EmojiPicker onSelect={insertEmoji} onClose={() => setShowEmoji(false)} />
        )}
      </div>

      <p className="text-[10px] text-slate-600 pb-2 text-center">
        🔒 End-to-end encrypted · Enter to send · Shift+Enter for new line
      </p>
    </div>
  );
}
