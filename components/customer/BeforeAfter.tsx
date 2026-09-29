"use client";

import { useState } from "react";
import { sizedImage } from "@/lib/utils";

/** Drag-to-compare "before / after" photo (R6). Keyboard accessible via the range input. */
export function BeforeAfter({ before, after, alt }: { before: string; after: string; alt: string }) {
  const [pos, setPos] = useState(50);
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-slate-800 select-none">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={sizedImage(after, 900)} loading="lazy" decoding="async" alt={`${alt} — after`} className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 overflow-hidden" style={{ width: `${pos}%` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={sizedImage(before, 900)} loading="lazy" decoding="async" alt={`${alt} — before`} className="absolute inset-0 h-full w-full max-w-none object-cover" style={{ width: `${10000 / Math.max(pos, 1)}%` }} />
      </div>
      <div className="absolute inset-y-0 w-0.5 bg-white/90 shadow" style={{ left: `${pos}%` }} aria-hidden>
        <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-8 w-8 rounded-full bg-white text-slate-900 text-xs font-bold flex items-center justify-center shadow-lg">⇆</span>
      </div>
      <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/60 text-white text-[10px] font-semibold">Before</span>
      <span className="absolute top-2 right-2 px-2 py-0.5 rounded bg-black/60 text-white text-[10px] font-semibold">After</span>
      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label="Compare before and after"
        className="absolute inset-0 h-full w-full opacity-0 cursor-ew-resize"
      />
    </div>
  );
}
