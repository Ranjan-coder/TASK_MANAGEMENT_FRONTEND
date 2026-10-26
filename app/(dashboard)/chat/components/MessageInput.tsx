"use client";

import { useRef, useCallback, KeyboardEvent, useState, useId, useEffect } from "react";
import { draftsReady, getDraft, setDraft } from "@/lib/chat/drafts";
import { Send, Paperclip, Smile, X, Reply, AtSign, Users, CalendarClock } from "lucide-react";
import { VoiceRecorder } from "./VoiceRecorder";
import { SchedulePicker } from "./SchedulePicker";
import { cn } from "@/lib/utils";
import { activeMentionQuery, mentionsToPlain, type MentionPerson } from "@/lib/chat/mentions";
import { EmojiPicker } from "./EmojiPicker";
import { QuickReplyButton } from "./QuickReplies";
import { useMentions } from "./MentionContext";
import { Message } from "@/types/chat";

/** One row of the @ picker: a person, or @everyone / @here */
type PickerItem = { kind: "person"; person: MentionPerson } | { kind: "all"; which: "everyone" | "here" };

interface MessageInputProps {
  /**
   * `text` is what was typed; `picked` are the people chosen from the @ picker
   * (lib/chat/mentions.ts turns them into tokens). Return false to keep the
   * text in the box (e.g. the sender cancelled at the "Send anyway?" prompt).
   */
  onSend: (text: string, picked: MentionPerson[]) => Promise<void | boolean> | void | boolean;
  /** Higher = spoke more recently: the @ picker lists them first */
  mentionRecency?: (userId: string) => number;
  /** Shown above the input row (e.g. "Also send to the chat" in a thread) */
  extraControls?: React.ReactNode;
  /** Keeps unsent text per chat / thread (lib/chat/drafts.ts) */
  draftKey?: string;
  /** Voice notes (shows the mic button) */
  onVoiceNote?: (blob: Blob, durationSec: number, mimeType: string) => Promise<void>;
  /** Scheduled send (shows the clock button); same return rule as onSend */
  onSchedule?: (text: string, picked: MentionPerson[], sendAt: Date) => Promise<void | boolean>;
  onTyping?: () => void;
  onAttachClick?: () => void;
  disabled?: boolean;
  placeholder?: string;
  replyTo?: Message | null;
  onCancelReply?: () => void;
  /** Staff: show quick-reply templates; fills {customer}/{designer} placeholders */
  quickReplyFill?: (text: string) => string;
}

export function MessageInput({
  onSend,
  onTyping,
  onAttachClick,
  disabled,
  placeholder,
  replyTo,
  onCancelReply,
  quickReplyFill,
  mentionRecency,
  extraControls,
  draftKey,
  onVoiceNote,
  onSchedule
}: MessageInputProps) {
  const [showSchedule, setShowSchedule] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const mentionInfo = useMentions();
  const pickerId = useId(); // unique per composer (the chat and a thread can both be open)
  // People chosen from the picker for the text being written
  const pickedRef = useRef<MentionPerson[]>([]);
  const [picker, setPicker] = useState<{ start: number; items: PickerItem[]; active: number } | null>(null);

  /** Opens, updates or closes the @ picker for the text before the caret. */
  const refreshPicker = useCallback(() => {
    const el = textareaRef.current;
    if (!el || el.selectionStart !== el.selectionEnd) return setPicker(null);
    const q = activeMentionQuery(el.value, el.selectionStart);
    if (!q) return setPicker(null);
    const items: PickerItem[] = mentionInfo.index.search(q.query, 8, mentionRecency).map((person) => ({ kind: "person", person }));
    if (mentionInfo.canMentionAll) {
      for (const which of ["everyone", "here"] as const) if (which.startsWith(q.query.toLowerCase())) items.push({ kind: "all", which });
    }
    setPicker(items.length ? { start: q.start, items, active: 0 } : null);
  }, [mentionInfo, mentionRecency]);

  const fitHeight = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  // Drafts: put back what was being typed in this chat / thread
  useEffect(() => {
    if (!draftKey) return;
    let live = true;
    // Switched chats in the same composer: the last chat's text is saved as its draft already
    const box = textareaRef.current;
    if (box) {
      box.value = "";
      pickedRef.current = [];
      fitHeight(box);
    }
    const fill = () => {
      const el = textareaRef.current;
      const d = getDraft(draftKey);
      if (!live || !el || !d || el.value) return;
      el.value = d.text;
      pickedRef.current = d.picked;
      fitHeight(el);
    };
    fill();
    draftsReady().then(fill); // saved drafts may still be loading after a reload
    return () => {
      live = false;
    };
  }, [draftKey]);

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    fitHeight(el);
    refreshPicker();
    if (draftKey) setDraft(draftKey, { text: el.value, picked: pickedRef.current });
    onTyping?.();
  };

  /** Replaces "@que" before the caret with "@Full Name " and remembers who was picked. */
  const choose = (item: PickerItem) => {
    const el = textareaRef.current;
    if (!el || !picker) return;
    const label = item.kind === "person" ? item.person.name : item.which;
    const before = el.value.slice(0, picker.start);
    const after = el.value.slice(el.selectionStart);
    const insert = `@${label} `;
    el.value = before + insert + after;
    el.selectionStart = el.selectionEnd = before.length + insert.length;
    if (item.kind === "person" && !pickedRef.current.some((p) => p.id === item.person.id)) pickedRef.current.push(item.person);
    setPicker(null);
    el.focus();
    handleInput();
  };

  const handleSend = useCallback(async () => {
    const el = textareaRef.current;
    if (!el) return;
    const text = el.value.trim();
    if (!text || disabled) return;
    const picked = pickedRef.current;
    el.value = "";
    el.style.height = "auto";
    pickedRef.current = [];
    setPicker(null);
    if (draftKey) setDraft(draftKey, null);
    const sent = await onSend(text, picked);
    if (sent === false && textareaRef.current) {
      textareaRef.current.value = text;
      pickedRef.current = picked;
      if (draftKey) setDraft(draftKey, { text, picked });
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
      textareaRef.current.focus();
    }
  }, [onSend, disabled, draftKey]);

  /** Sends the text later instead of now (clears the box like a send). */
  const scheduleAt = async (sendAt: Date) => {
    const el = textareaRef.current;
    if (!el || !onSchedule) return;
    const text = el.value.trim();
    if (!text) {
      setShowSchedule(false);
      return;
    }
    const picked = pickedRef.current;
    el.value = "";
    fitHeight(el);
    pickedRef.current = [];
    setShowSchedule(false);
    if (draftKey) setDraft(draftKey, null);
    const ok = await onSchedule(text, picked, sendAt);
    if (ok === false && textareaRef.current) {
      textareaRef.current.value = text;
      pickedRef.current = picked;
      if (draftKey) setDraft(draftKey, { text, picked });
      fitHeight(textareaRef.current);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (picker) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const step = e.key === "ArrowDown" ? 1 : -1;
        setPicker({ ...picker, active: (picker.active + step + picker.items.length) % picker.items.length });
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        choose(picker.items[picker.active]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setPicker(null);
        return;
      }
    }
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

  const replyPreview = replyTo?.decryptedContent
    ? mentionsToPlain(replyTo.decryptedContent, mentionInfo.nameOf)
    : replyTo?.content || "🔒 Encrypted message";
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

      {extraControls}

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

          {quickReplyFill && (
            <QuickReplyButton
              disabled={disabled}
              fill={quickReplyFill}
              currentText={() => textareaRef.current?.value ?? ""}
              onPick={(text) => {
                const el = textareaRef.current;
                if (!el) return;
                el.value = text;
                el.focus();
                el.selectionStart = el.selectionEnd = text.length;
                handleInput();
              }}
            />
          )}

          {/* Text area */}
          <textarea
            ref={textareaRef}
            disabled={disabled}
            placeholder={placeholder || "Type a message…"}
            rows={1}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onClick={refreshPicker}
            onBlur={() => setTimeout(() => setPicker(null), 150)}
            role="combobox"
            aria-expanded={Boolean(picker)}
            aria-controls={`${pickerId}-list`}
            aria-autocomplete="list"
            aria-activedescendant={picker ? `${pickerId}-opt-${picker.active}` : undefined}
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

          {onVoiceNote && <VoiceRecorder disabled={disabled} onSend={onVoiceNote} />}

          {/* Schedule for later */}
          {onSchedule && (
            <button
              disabled={disabled}
              onClick={() => setShowSchedule((v) => !v)}
              title="Send later"
              aria-label="Send later"
              aria-expanded={showSchedule}
              className={cn(
                "h-8 w-8 shrink-0 flex items-center justify-center rounded-lg transition",
                showSchedule ? "bg-violet-600/25 text-violet-400" : "text-slate-500 hover:text-slate-300 hover:bg-slate-700"
              )}
            >
              <CalendarClock className="h-4 w-4" />
            </button>
          )}

          {/* Send */}
          <button
            onClick={handleSend}
            disabled={disabled}
            className="h-8 w-8 shrink-0 flex items-center justify-center rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition shadow-md shadow-violet-600/20"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* @ picker: people in this chat, most recent speakers first */}
        {picker && (
          <ul
            id={`${pickerId}-list`}
            role="listbox"
            aria-label="Mention someone"
            className="absolute bottom-full left-2.5 sm:left-4 mb-1 w-64 max-w-[calc(100%-1.25rem)] max-h-72 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900/95 backdrop-blur-md shadow-2xl py-1 z-30"
          >
            {picker.items.map((item, i) => (
              <li
                key={item.kind === "person" ? item.person.id : item.which}
                id={`${pickerId}-opt-${i}`}
                role="option"
                aria-selected={i === picker.active}
                // mousedown, not click: the textarea would lose focus (and close the list) first
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(item);
                }}
                onMouseEnter={() => setPicker({ ...picker, active: i })}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 cursor-pointer text-sm",
                  i === picker.active ? "bg-violet-600/25 text-white" : "text-slate-300"
                )}
              >
                {item.kind === "person" ? (
                  <>
                    <span className="h-6 w-6 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                      {item.person.name[0]?.toUpperCase()}
                    </span>
                    <span className="truncate">{item.person.name}</span>
                  </>
                ) : (
                  <>
                    <span className="h-6 w-6 rounded-full bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0">
                      {item.which === "everyone" ? <Users className="h-3 w-3" /> : <AtSign className="h-3 w-3" />}
                    </span>
                    <span className="truncate">@{item.which}</span>
                    <span className="ml-auto text-[10px] text-slate-500">
                      {item.which === "everyone" ? "notify everyone" : "people online now"}
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {showSchedule && <SchedulePicker onPick={scheduleAt} onClose={() => setShowSchedule(false)} />}

        {/* Emoji picker */}
        {showEmoji && (
          <EmojiPicker onSelect={insertEmoji} onClose={() => setShowEmoji(false)} />
        )}
      </div>

      {/* One line, desktop only (phones have no Shift+Enter and little room) */}
      <p className="hidden sm:block truncate px-4 text-[10px] text-slate-600 pb-2 text-center">
        🔒 Encrypted · Enter to send · Shift+Enter new line · **bold** _italic_ `code`
      </p>
    </div>
  );
}
