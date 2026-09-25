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
}

export function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const [activeCategory, setActiveCategory] = useState(CATEGORY_ICONS[0]);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const searchResults = search.trim()
    ? Object.values(EMOJI_GROUPS)
        .flat()
        .filter(() => true) // search by position (no names without lib)
        .slice(0, 40)
    : null;

  const displayEmojis = search.trim()
    ? Object.values(EMOJI_GROUPS).flat().slice(0, 40)
    : EMOJI_GROUPS[activeCategory] || [];

  return (
    <div
      ref={ref}
      className="absolute bottom-14 left-2 sm:left-4 z-50 w-[calc(100vw-3rem)] sm:w-72 max-w-[320px] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150"
    >
      {/* Search */}
      <div className="px-3 py-2.5 border-b border-slate-800">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search emoji…"
          autoFocus
          className="w-full px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500/40"
        />
      </div>

      {/* Category tabs */}
      {!search.trim() && (
        <div className="flex gap-0.5 px-2 pt-2 overflow-x-auto scrollbar-none">
          {CATEGORY_ICONS.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                "shrink-0 px-2 py-1 rounded-lg text-xs transition",
                activeCategory === cat
                  ? "bg-violet-600/25 text-violet-300 border border-violet-500/30"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              )}
            >
              {cat.split(" ")[0]}
            </button>
          ))}
        </div>
      )}

      {/* Emoji grid */}
      <div className="p-2 grid grid-cols-8 gap-0.5 max-h-52 overflow-y-auto">
        {displayEmojis.map((emoji, i) => (
          <button
            key={`${emoji}-${i}`}
            onClick={() => {
              onSelect(emoji);
              onClose();
            }}
            className="h-8 w-8 flex items-center justify-center text-lg rounded-lg hover:bg-slate-700 transition"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
