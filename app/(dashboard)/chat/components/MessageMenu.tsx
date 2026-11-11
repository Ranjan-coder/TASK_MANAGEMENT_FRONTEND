"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { MENU_WIDTH, PICKER_HEIGHT, PICKER_WIDTH, menuHeight, placeMenu, useMessageMenu } from "@/lib/chat/messageMenu";
import { EmojiPicker } from "./EmojiPicker";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

/**
 * The chat screen's single message menu (lib/chat/messageMenu.ts): opened from
 * a bubble's "⌄" button, placed next to that bubble, closed by an outside
 * click, Esc, scrolling or resizing. Arrow keys move between items.
 */
export function MessageMenu() {
  const req = useMessageMenu((s) => s.open);
  const close = useMessageMenu((s) => s.close);
  const ref = useRef<HTMLDivElement>(null);
  const [picker, setPicker] = useState(false);

  useEffect(() => setPicker(false), [req?.messageId]);

  // Close on outside click / Esc / scroll / resize while open
  useEffect(() => {
    if (!req) return;
    const outside = (e: MouseEvent) => {
      const t = e.target as Element;
      // The bubble's own button toggles it (handled there)
      if (ref.current?.contains(t) || t.closest?.(`[data-menu-trigger="${req.messageId}"]`)) return;
      close();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        document.querySelector<HTMLElement>(`[data-menu-trigger="${req.messageId}"]`)?.focus();
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') || [])];
      if (!items.length) return;
      e.preventDefault();
      const i = items.indexOf(document.activeElement as HTMLElement);
      const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
      items[next].focus();
    };
    // The bubble moved: the menu would float in the wrong place
    const scroll = (e: Event) => !ref.current?.contains(e.target as Node) && close();
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", close);
    };
  }, [req, close]);

  // Keyboard users land on the first action
  useLayoutEffect(() => {
    if (req) ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
  }, [req]);

  if (!req || typeof document === "undefined") return null;
  // The panel's size is known from its content (list or picker), so placing it
  // needs no measurement, and the picker is kept on screen the same way as the list
  const width = picker ? PICKER_WIDTH : MENU_WIDTH;
  const height = picker ? PICKER_HEIGHT : menuHeight(req.items.length, Boolean(req.onReact));
  const pos = placeMenu(req.anchor, req.alignRight, height, { width: window.innerWidth, height: window.innerHeight }, width);
  const run = (fn: () => void) => () => {
    close();
    fn();
  };

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label="Message options"
      style={{ top: pos.top, left: pos.left, width }}
      className="fixed z-[60] rounded-xl border border-slate-700 bg-slate-900/95 backdrop-blur-md shadow-2xl py-2"
    >
      {picker && req.onReact ? (
        // Full emoji picker inside the menu (it used to pop out and could run off the screen)
        <div>
          <div className="flex items-center gap-2 px-2 pb-1">
            <button
              onClick={() => setPicker(false)}
              aria-label="Back to message options"
              className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <span className="text-xs font-semibold text-slate-300">Choose a reaction</span>
          </div>
          <EmojiPicker
            inline
            onSelect={(emoji) => {
              close();
              req.onReact!(emoji);
            }}
            onClose={() => setPicker(false)}
          />
        </div>
      ) : (
        <>
      {req.onReact && (
        <div className="relative flex items-center justify-between gap-0.5 px-2 pb-2 mb-1 border-b border-slate-800">
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              onClick={run(() => req.onReact!(emoji))}
              aria-label={`React ${emoji}`}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-base hover:bg-slate-800 hover:scale-110 transition"
            >
              {emoji}
            </button>
          ))}
          <button
            onClick={() => setPicker(true)}
            aria-label="More reactions"
            className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      )}
      {req.items.map(({ label, icon: Icon, run: fn, danger, active }) => (
        <button
          key={label}
          role="menuitem"
          onClick={run(fn)}
          className={cn(
            "w-full h-9 flex items-center gap-3 px-3 text-sm text-left outline-none transition",
            danger ? "text-rose-300 hover:bg-rose-500/10 focus:bg-rose-500/10" : "text-slate-200 hover:bg-slate-800 focus:bg-slate-800"
          )}
        >
          <Icon className={cn("h-4 w-4 shrink-0", danger ? "text-rose-400" : "text-slate-400", active && "fill-amber-400 text-amber-400")} aria-hidden />
          {label}
        </button>
      ))}
        </>
      )}
    </div>,
    document.body
  );
}
