"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

// Emoji data — grouped by category (no external lib needed)
const EMOJI_GROUPS: Record<string, string[]> = {
  "😀 Smileys": ["😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😊","😇","🥰","😍","🤩","😘","😗","😚","😙","🥲","😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫","🤔","🤐","🤨","😐","😑","😶","😏","😒","🙄","😬","🤥","😌","😔","😪","🤤","😴","😷","🤒","🤕","🤢","🤧","🥵","🥶","🥴","😵","🤯","🤠","🥳","🥸","😎","🤓","🧐","😕","😟","🙁","😮","😯","😲","😳","🥺","😦","😧","😨","😰","😥","😢","😭","😱","😖","😣","😞","😓","😩","😫","🥱","😤","😡","😠","🤬","😈","👿","💀","☠️"],
  "👍 Gestures": ["👋","🤚","🖐️","✋","🖖","👌","🤌","🤏","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","🖕","👇","☝️","👍","👎","✊","👊","🤛","🤜","👏","🙌","👐","🤲","🤝","🙏"],
  "❤️ Hearts": ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟","☮️","✝️","☪️","🕉️","✡️","🔯","🕎","☯️","☦️","🛐","⛎"],
  "🎉 Celebration": ["🎉","🎊","🎈","🎁","🎀","🎗️","🎟️","🎫","🎖️","🏆","🥇","🥈","🥉","🏅","🎯","🎳","🎮","🎲","🧩","♟️","🎭","🎨","🖼️","🎬","🎤","🎧","🎼","🎵","🎶","🎹","🥁","🎷","🎺","🎸","🪕","🎻"],
  "🔥 Popular": ["🔥","💯","✨","⭐","🌟","💫","⚡","🌈","☀️","🌙","❄️","🌊","💨","🌸","🌺","🌹","🌻","🌼","🍀","🌴","🎋","🌵","🍁","🍄","🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐙","🦋"],
  "😋 Food": ["🍕","🍔","🌮","🌯","🥗","🍜","🍱","🍣","🍰","🎂","🧁","🍩","🍪","🍫","🍬","🍭","🍦","☕","🧋","🍵","🧃","🥤","🍺","🥂","🍷","🥃"],
};

const CATEGORY_ICONS = Object.keys(EMOJI_GROUPS);

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  /** Overrides the popover's position classes. Defaults to anchoring above a bottom input bar (MessageInput's use case). */
  anchorClassName?: string;
  /** Rendered inside another panel (the message menu): no own position, border or outside-click handling */
  inline?: boolean;
}

export function EmojiPicker({ onSelect, onClose, anchorClassName, inline = false }: EmojiPickerProps) {
  const [activeCategory, setActiveCategory] = useState(CATEGORY_ICONS[0]);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click (the host panel handles this when inline)
  useEffect(() => {
    if (inline) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose, inline]);

  const displayEmojis = EMOJI_GROUPS[activeCategory] || [];

  return (
    <div
      ref={ref}
      className={cn(
        inline
          ? "w-full"
          : cn(
              "absolute z-50 w-[calc(100vw-3rem)] sm:w-72 max-w-[320px] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden",
              anchorClassName || "bottom-14 left-2 sm:left-4"
            )
      )}
    >
      {/* Category tabs (the old search box only ever showed the first 40 emojis, whatever was typed) */}
      <div role="tablist" aria-label="Emoji categories" className="flex gap-0.5 px-2 pt-2 overflow-x-auto scrollbar-none">
        {CATEGORY_ICONS.map((cat) => (
          <button
            key={cat}
            role="tab"
            aria-selected={activeCategory === cat}
            aria-label={cat.split(" ").slice(1).join(" ")}
            onClick={() => setActiveCategory(cat)}
            className={cn(
              "shrink-0 h-8 w-8 rounded-lg text-base flex items-center justify-center transition",
              activeCategory === cat ? "bg-violet-600/25 ring-1 ring-violet-500/40" : "hover:bg-slate-800"
            )}
          >
            {cat.split(" ")[0]}
          </button>
        ))}
      </div>

      {/* Emoji grid */}
      <div className="p-2 grid grid-cols-8 gap-0.5 max-h-52 overflow-y-auto">
        {displayEmojis.map((emoji, i) => (
          <button
            key={`${emoji}-${i}`}
            onClick={() => {
              onSelect(emoji);
              onClose();
            }}
            aria-label={emoji}
            className="h-8 w-8 flex items-center justify-center text-lg rounded-lg hover:bg-slate-700 transition"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
