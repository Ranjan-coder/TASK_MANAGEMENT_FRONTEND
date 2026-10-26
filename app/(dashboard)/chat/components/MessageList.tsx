"use client";

/**
 * Virtualised message list (chat-features-plan.md CH-V): only the rows on
 * screen, plus a margin, are in the DOM, so a chat with thousands of messages
 * scrolls like one with twenty.
 *
 * Rows have different heights, measured as they render (ResizeObserver) and
 * kept in a Fenwick tree (lib/chat/fenwick.ts): "which row is at scroll
 * offset y" and "where does row i start" are both O(log n).
 *
 * Scroll anchoring: the list remembers the first visible row and how far into
 * it the view is. When anything above it changes size (older messages loaded,
 * an image finishing) the scroll position is corrected, so the text being
 * read never jumps. At the bottom, the list stays pinned to the newest message.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Fenwick } from "@/lib/chat/fenwick";
import { LruKeys } from "@/lib/chat/messageStore";

const ESTIMATED_ROW = 72; // px, until a row has been measured
const OVERSCAN = 800; // px rendered above and below the visible area
const BOTTOM_SLACK = 80; // px: closer than this to the end counts as "at the bottom"
const TOP_LOAD_AT = 400; // px from the top: ask for older messages

// Measured heights survive switching chats (bounded: last 20 conversations)
const heightCache = new Map<string, Map<string, number>>();
const heightLru = new LruKeys(20);
const heightsFor = (listId: string) => {
  for (const gone of heightLru.touch(listId)) heightCache.delete(gone);
  let m = heightCache.get(listId);
  if (!m) {
    m = new Map();
    heightCache.set(listId, m);
  }
  return m;
};

export interface MessageListHandle {
  /** Scrolls so the row with this key is at the top (false if it isn't loaded). */
  scrollToKey: (key: string, align?: "start" | "center") => boolean;
  scrollToBottom: () => void;
}

interface Props<T> {
  /** Identifies the list (conversation id): heights are remembered per list */
  listId: string;
  items: readonly T[];
  getKey: (item: T) => string;
  renderRow: (item: T, index: number) => React.ReactNode;
  /** Where to start the first time this list is shown; the bottom when absent */
  initialKey?: string | null;
  hasMore?: boolean;
  loadingMore?: boolean;
  onReachTop?: () => void;
  /** After a jump into older history: newer messages exist below what's loaded */
  hasNewer?: boolean;
  loadingNewer?: boolean;
  onReachBottom?: () => void;
  /** Rendered after the rows (typing indicator) */
  footer?: React.ReactNode;
  className?: string;
}

function MessageListInner<T>(
  { listId, items, getKey, renderRow, initialKey, hasMore, loadingMore, onReachTop, hasNewer, loadingNewer, onReachBottom, footer, className }: Props<T>,
  ref: React.ForwardedRef<MessageListHandle>
) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const heights = useMemo(() => heightsFor(listId), [listId]);

  const keys = useMemo(() => items.map(getKey), [items, getKey]);
  const indexByKey = useMemo(() => new Map(keys.map((k, i) => [k, i])), [keys]);
  // Rebuilt in O(n) when the list changes; row measurements update it in O(log n)
  const tree = useMemo(() => new Fenwick(keys.map((k) => heights.get(k) ?? ESTIMATED_ROW)), [keys, heights]);
  const treeRef = useRef(tree);
  treeRef.current = tree;
  const keysRef = useRef(keys);
  keysRef.current = keys;
  const indexRef = useRef(indexByKey);
  indexRef.current = indexByKey;

  const [range, setRange] = useState<[number, number]>([0, 0]);
  const rangeRef = useRef(range);
  rangeRef.current = range;

  // Where the reader is: pinned to the bottom, or anchored on a row
  const atBottomRef = useRef(!initialKey);
  const anchorRef = useRef<{ key: string; offset: number } | null>(initialKey ? { key: initialKey, offset: -8 } : null);
  const adjustingRef = useRef(false);
  const reachTopRef = useRef(onReachTop);
  reachTopRef.current = onReachTop;
  const canLoadRef = useRef(false);
  canLoadRef.current = Boolean(hasMore) && !loadingMore;
  const reachBottomRef = useRef(onReachBottom);
  reachBottomRef.current = onReachBottom;
  const hasNewerRef = useRef(false);
  hasNewerRef.current = Boolean(hasNewer);
  const canLoadNewerRef = useRef(false);
  canLoadNewerRef.current = Boolean(hasNewer) && !loadingNewer;

  /** Offset of the rows block inside the scroller (padding, content above it). */
  const base = () => innerRef.current?.offsetTop ?? 0;

  /** Sizes the spacer and moves the rendered block to its place (no React render). */
  const applyGeometry = useCallback(() => {
    const t = treeRef.current;
    if (innerRef.current) innerRef.current.style.height = `${t.total()}px`;
    if (windowRef.current) windowRef.current.style.transform = `translateY(${t.prefix(rangeRef.current[0])}px)`;
  }, []);

  /** Which rows should be in the DOM for the current scroll position. */
  const updateRange = useCallback(() => {
    const el = scrollerRef.current;
    const t = treeRef.current;
    if (!el) return;
    if (t.size === 0) {
      if (rangeRef.current[0] !== 0 || rangeRef.current[1] !== 0) setRange([0, 0]);
      return;
    }
    const top = el.scrollTop - base();
    const start = t.indexAt(top - OVERSCAN);
    const end = Math.min(t.size, t.indexAt(top + el.clientHeight + OVERSCAN) + 1);
    const [s, e] = rangeRef.current;
    if (s !== start || e !== end) {
      rangeRef.current = [start, end];
      setRange([start, end]);
    }
  }, []);

  /** Restores the reader's place after the geometry changed. */
  const restorePosition = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    applyGeometry();
    let target: number | null = null;
    if (atBottomRef.current) {
      target = el.scrollHeight - el.clientHeight;
    } else if (anchorRef.current) {
      const i = indexRef.current.get(anchorRef.current.key);
      if (i !== undefined) target = base() + treeRef.current.prefix(i) + anchorRef.current.offset;
    }
    if (target !== null && Math.abs(el.scrollTop - target) > 0.5) {
      adjustingRef.current = true;
      el.scrollTop = target;
    }
    updateRange();
  }, [applyGeometry, updateRange]);

  // Reader scrolled: remember the place, render the right rows, maybe load older ones
  const onScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    if (adjustingRef.current) {
      adjustingRef.current = false;
    } else {
      const t = treeRef.current;
      // Not "at the bottom" while newer messages are still missing: stay anchored as they load
      atBottomRef.current = !hasNewerRef.current && el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_SLACK;
      if (t.size > 0) {
        const y = el.scrollTop - base();
        const i = t.indexAt(y);
        anchorRef.current = { key: keysRef.current[i], offset: y - t.prefix(i) };
      }
    }
    updateRange();
    if (el.scrollTop < TOP_LOAD_AT && canLoadRef.current) reachTopRef.current?.();
    if (el.scrollHeight - el.scrollTop - el.clientHeight < TOP_LOAD_AT && canLoadNewerRef.current) reachBottomRef.current?.();
  }, [updateRange]);

  // The list changed (new, older or edited messages): keep the reader's place
  useLayoutEffect(() => {
    restorePosition();
  }, [tree, restorePosition]);

  // The rendered window changed: move the block to its place
  useLayoutEffect(() => {
    applyGeometry();
  }, [range, applyGeometry]);

  // Measure rendered rows; a size change above the anchor is absorbed by restorePosition.
  // Created on first use: row refs attach before effects run.
  const heightsRef = useRef(heights);
  heightsRef.current = heights;
  const restoreRef = useRef(restorePosition);
  restoreRef.current = restorePosition;
  const observerRef = useRef<ResizeObserver | null>(null);
  const observer = () =>
    (observerRef.current ??= new ResizeObserver((entries) => {
      let changed = false;
      for (const entry of entries) {
        const el = entry.target as HTMLElement;
        const key = el.dataset.key;
        if (!key) continue;
        const h = entry.borderBoxSize?.[0]?.blockSize ?? el.offsetHeight;
        if (!h || heightsRef.current.get(key) === h) continue; // 0 = just removed from the page
        heightsRef.current.set(key, h);
        const i = indexRef.current.get(key);
        if (i !== undefined) {
          treeRef.current.set(i, h);
          changed = true;
        }
      }
      if (changed) restoreRef.current();
    }));
  useEffect(() => () => observerRef.current?.disconnect(), []);

  const measure = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const ro = observer();
    ro.observe(el);
    return () => ro.unobserve(el); // row scrolled out of the window: stop watching it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A short chat that doesn't fill the screen can't scroll up to load more: ask now
  useEffect(() => {
    const el = scrollerRef.current;
    if (el && hasMore && !loadingMore && el.scrollHeight <= el.clientHeight + TOP_LOAD_AT) onReachTop?.();
  }, [hasMore, loadingMore, items.length, onReachTop]);

  // Window resized, or the footer (typing indicator) came or went: keep the place
  const footerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => restorePosition());
    ro.observe(el);
    if (footerRef.current) ro.observe(footerRef.current);
    return () => ro.disconnect();
  }, [restorePosition]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToKey: (key, align = "start") => {
        const i = indexRef.current.get(key);
        const el = scrollerRef.current;
        if (i === undefined || !el) return false;
        atBottomRef.current = false;
        const centre = align === "center" ? (el.clientHeight - treeRef.current.get(i)) / 2 : 8;
        anchorRef.current = { key, offset: -centre };
        restorePosition();
        return true;
      },
      scrollToBottom: () => {
        atBottomRef.current = true;
        restorePosition();
      }
    }),
    [restorePosition]
  );

  const [start, end] = range;
  const rows: React.ReactNode[] = [];
  for (let i = start; i < end && i < items.length; i++) {
    rows.push(
      // flow-root keeps the row's margins inside it, so the measured height is exact
      <div key={keys[i]} data-key={keys[i]} ref={measure} className="flow-root">
        {renderRow(items[i], i)}
      </div>
    );
  }

  return (
    <div
      ref={scrollerRef}
      onScroll={onScroll}
      role="log"
      aria-label="Messages"
      className={className ?? "relative flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 flex flex-col"}
      style={{ overflowAnchor: "none" }}
    >
      {/* Short chats sit at the bottom, like every messenger */}
      <div className="mt-auto" />
      {/* Out of the flow, so showing it doesn't push the messages down */}
      {loadingMore && (
        <div className="absolute top-2 inset-x-0 z-10 flex justify-center pointer-events-none" aria-label="Loading earlier messages">
          <div className="animate-spin h-4 w-4 rounded-full border-2 border-violet-500 border-t-transparent" />
        </div>
      )}
      <div ref={innerRef} className="relative shrink-0">
        <div ref={windowRef} className="absolute inset-x-0 top-0">
          {rows}
        </div>
      </div>
      <div ref={footerRef} className="shrink-0">
        {footer}
      </div>
    </div>
  );
}

export const MessageList = forwardRef(MessageListInner) as <T>(
  props: Props<T> & { ref?: React.Ref<MessageListHandle> }
) => ReturnType<typeof MessageListInner>;
