/**
 * lib/chat/chatSearch.ts — search inside a chat, in the browser only
 * (chat-features-plan.md CH-S). Messages are end-to-end encrypted, so the
 * server can't search them; the decrypted text on this device is indexed in
 * memory (lib/search/searchIndex.ts: inverted index, prefix match by binary
 * search) and never leaves it.
 *
 * The index is kept in step with the message list incrementally: each sync
 * compares the text already indexed per message and only re-tokenises new or
 * edited ones, so typing a query over thousands of messages stays instant.
 */
import { SearchIndex } from "@/lib/search/searchIndex";
import type { Message } from "@/types/chat";

export interface SearchFilters {
  /** Only messages from this person */
  from?: string | null;
  /** Only messages with files or images */
  hasFile?: boolean;
  /** Only messages that mention me (by name, @everyone or @here) */
  mentionsMe?: boolean;
}

export class ChatSearch {
  private readonly index = new SearchIndex();
  private readonly indexed = new Map<string, string>(); // message id → text that was indexed

  /** Brings the index up to date with `messages`. O(n) to compare, tokenising only what changed. */
  sync(messages: readonly Message[], textOf: (m: Message) => string) {
    const live = new Set<string>();
    for (const m of messages) {
      if (m.localStatus || m.type === "system") continue;
      live.add(m._id);
      const text = m.isDeleted ? "" : textOf(m);
      if (this.indexed.get(m._id) === text) continue;
      this.index.set(m._id, text);
      this.indexed.set(m._id, text);
    }
    for (const id of this.indexed.keys()) {
      if (!live.has(id)) {
        this.index.remove(id);
        this.indexed.delete(id);
      }
    }
  }

  /** Matching messages, newest first (at most `limit`). An empty query with no filters finds nothing. */
  search(query: string, filters: SearchFilters, messages: readonly Message[], myId: string, limit = 200): Message[] {
    const hasFilter = Boolean(filters.from || filters.hasFile || filters.mentionsMe);
    const hits = this.index.search(query);
    if (hits === null && !hasFilter) return [];
    const out: Message[] = [];
    for (let i = messages.length - 1; i >= 0 && out.length < limit; i--) {
      const m = messages[i];
      if (m.localStatus || m.type === "system" || m.isDeleted) continue;
      if (hits && !hits.has(m._id)) continue;
      if (filters.from && m.sender._id !== filters.from) continue;
      if (filters.hasFile && !m.attachments?.length) continue;
      if (filters.mentionsMe && !(m.sender._id !== myId && (m.mentionsAll || m.mentions?.includes(myId)))) continue;
      out.push(m);
    }
    return out;
  }

  get size() {
    return this.indexed.size;
  }
}
