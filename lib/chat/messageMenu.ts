/**
 * lib/chat/messageMenu.ts — the one message menu of the chat screen.
 *
 * Instead of every message carrying its own toolbar, each bubble has a small
 * "⌄" button (shown by CSS on hover, so hovering runs no code). Clicking it
 * writes { which message, where it is, what it can do } here, and a single
 * <MessageMenu/> renders that. Opening or closing is one store write; each
 * row only subscribes to "is my menu open?" (a boolean), so just the old and
 * new message re-render.
 */
import { create } from "zustand";
import type { LucideIcon } from "lucide-react";

export interface MenuItem {
  label: string;
  icon: LucideIcon;
  run: () => void;
  danger?: boolean;
  /** Filled icon state (e.g. "Unstar") */
  active?: boolean;
}

export interface MenuRequest {
  messageId: string;
  /** Bubble position on screen when opened (the menu is placed next to it) */
  anchor: { top: number; bottom: number; left: number; right: number };
  /** Own messages sit on the right: the menu lines up with the bubble's right edge */
  alignRight: boolean;
  onReact?: (emoji: string) => void;
  items: MenuItem[];
}

interface MenuState {
  open: MenuRequest | null;
  show: (req: MenuRequest) => void;
  close: () => void;
}

export const useMessageMenu = create<MenuState>((set, get) => ({
  open: null,
  // Clicking the same message's button again closes it (toggle)
  show: (req) => set({ open: get().open?.messageId === req.messageId ? null : req }),
  close: () => {
    if (get().open) set({ open: null });
  }
}));

// ── Placement (pure, testable) ──────────────────────────────────────────────

export const MENU_WIDTH = 224;
/** "+" swaps the list for the full emoji picker inside the menu: its fixed size */
export const PICKER_WIDTH = 288;
export const PICKER_HEIGHT = 44 + 40 + 224 + 8; // back header + category tabs + grid + padding
const REACTIONS_ROW = 48;
const ITEM_HEIGHT = 36;
const PADDING = 8;
const GAP = 6;
const EDGE = 8;

/** Height from the item count, so placing it needs no DOM measurement. */
export const menuHeight = (items: number, withReactions: boolean) =>
  (withReactions ? REACTIONS_ROW : 0) + items * ITEM_HEIGHT + PADDING * 2;

/**
 * Where the menu goes for a bubble: below it, or above when there isn't room
 * below (but there is above); lined up with the bubble's outer edge; always
 * kept inside the window. O(1).
 */
export const placeMenu = (
  anchor: MenuRequest["anchor"],
  alignRight: boolean,
  height: number,
  viewport: { width: number; height: number },
  width: number = MENU_WIDTH
): { top: number; left: number; above: boolean } => {
  const spaceBelow = viewport.height - anchor.bottom - EDGE;
  const spaceAbove = anchor.top - EDGE;
  const above = spaceBelow < height + GAP && spaceAbove > spaceBelow;
  let top = above ? anchor.top - GAP - height : anchor.bottom + GAP;
  top = Math.max(EDGE, Math.min(top, viewport.height - height - EDGE));
  let left = alignRight ? anchor.right - width : anchor.left;
  left = Math.max(EDGE, Math.min(left, viewport.width - width - EDGE));
  return { top, left, above };
};
