/**
 * In-browser full-text search for the Planner (planner-module-plan.md). Content is
 * end-to-end encrypted, so the server can't search it; the decrypted text is
 * indexed here, in memory only, and never leaves the device.
 *
 * Inverted index: token → Set<docId>. A query is split into tokens; each token
 * matches every indexed token it is a PREFIX of (so "kit" finds "kitchen"), and
 * the results of all tokens are intersected (AND).
 *   - add / update / remove: O(tokens in that document)
 *   - search: O(matching tokens), using a sorted token array + binary search to
 *     find the prefix range instead of scanning every token.
 */
const tokenize = (text: string): string[] =>
  Array.from(
    new Set(
      text
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "") // é → e
        .split(/[^\p{L}\p{N}]+/u)
        .filter((t) => t.length > 0)
    )
  );

export class SearchIndex {
  private postings = new Map<string, Set<string>>(); // token → doc ids
  private docTokens = new Map<string, string[]>(); // doc id → its tokens (for updates)
  private sorted: string[] | null = null; // lazily rebuilt sorted token list

  /** Adds or replaces a document's text. */
  set(id: string, text: string) {
    this.remove(id);
    const tokens = tokenize(text);
    this.docTokens.set(id, tokens);
    for (const t of tokens) {
      let set = this.postings.get(t);
      if (!set) {
        set = new Set();
        this.postings.set(t, set);
        this.sorted = null;
      }
      set.add(id);
    }
  }

  remove(id: string) {
    const tokens = this.docTokens.get(id);
    if (!tokens) return;
    for (const t of tokens) {
      const set = this.postings.get(t);
      set?.delete(id);
      if (set && set.size === 0) {
        this.postings.delete(t);
        this.sorted = null;
      }
    }
    this.docTokens.delete(id);
  }

  clear() {
    this.postings.clear();
    this.docTokens.clear();
    this.sorted = null;
  }

  /** First index in the sorted token list whose token is >= prefix (binary search). */
  private lowerBound(prefix: string): number {
    const arr = this.sorted!;
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (arr[mid] < prefix) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** Ids of documents containing every query token (as a prefix). Empty query → null (= all). */
  search(query: string): Set<string> | null {
    const tokens = tokenize(query);
    if (!tokens.length) return null;
    if (!this.sorted) this.sorted = Array.from(this.postings.keys()).sort();
    let result: Set<string> | null = null;
    for (const q of tokens) {
      const hits = new Set<string>();
      for (let i = this.lowerBound(q); i < this.sorted.length && this.sorted[i].startsWith(q); i++) {
        for (const id of this.postings.get(this.sorted[i])!) hits.add(id);
      }
      if (result === null) result = hits;
      else {
        // AND: walk the smaller set, look up in the larger (O(min(|a|, |b|)))
        const current: Set<string> = result;
        const [small, big]: [Set<string>, Set<string>] = current.size <= hits.size ? [current, hits] : [hits, current];
        result = new Set([...small].filter((id) => big.has(id)));
      }
      if (result.size === 0) break;
    }
    return result;
  }

  get size() {
    return this.docTokens.size;
  }
}
