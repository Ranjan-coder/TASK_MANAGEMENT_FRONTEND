/**
 * lib/chat/mentions.ts — @mentions in the browser (chat-features-plan.md CH-M).
 *
 * Inside the encrypted text a mention is a token: <@userId>, <@everyone>,
 * <@here>. Names are looked up when shown, so a renamed person shows their
 * new name in old messages. The plain list of ids sent next to the ciphertext
 * (so the server can notify) is built from the same tokens.
 *
 *  - picker:    trie over lower-cased name words, O(k) to find a k-letter
 *               prefix, top results by recency with a bounded heap
 *  - rendering: one-pass tokenizer into text / mention segments; it never
 *               produces HTML, so a message can't inject markup
 */

export interface MentionPerson {
  id: string;
  name: string;
}

export type MentionAll = "everyone" | "here";

export type Segment =
  | { kind: "text"; text: string }
  | { kind: "mention"; userId: string }
  | { kind: "all"; which: MentionAll };

const TOKEN_RE = /<@([a-f0-9]{24}|everyone|here)>/g;

/** Folds case and accents ("Zoë" → "zoe") so the picker matches what people type. */
export const fold = (s: string): string =>
  s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

// ── Picker index ────────────────────────────────────────────────────────────

interface TrieNode {
  children: Map<string, TrieNode>;
  /** People with a name word ending exactly here */
  ids: string[];
}
const node = (): TrieNode => ({ children: new Map(), ids: [] });

/**
 * Prefix index over the members of one chat. Every word of a name is indexed
 * (and the full name), so "rao" finds "Asha Rao" as well as "Rao Mehta".
 */
export class MentionIndex {
  private readonly root = node();
  private readonly people = new Map<string, MentionPerson>();

  constructor(people: MentionPerson[]) {
    for (const p of people) {
      this.people.set(p.id, p);
      const full = fold(p.name).trim();
      const words = new Set([full, ...full.split(/\s+/).filter(Boolean)]);
      for (const w of words) this.insert(w, p.id);
    }
  }

  private insert(word: string, id: string) {
    let n = this.root;
    for (const ch of word) {
      let next = n.children.get(ch);
      if (!next) n.children.set(ch, (next = node()));
      n = next;
    }
    if (!n.ids.includes(id)) n.ids.push(id);
  }

  /** Everyone with a name word starting with `prefix` (unordered, no duplicates). */
  private matchAll(prefix: string): Set<string> {
    let n: TrieNode | undefined = this.root;
    for (const ch of fold(prefix)) {
      n = n.children.get(ch);
      if (!n) return new Set();
    }
    const out = new Set<string>();
    const stack: TrieNode[] = [n];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const id of cur.ids) out.add(id);
      for (const child of cur.children.values()) stack.push(child);
    }
    return out;
  }

  /**
   * Up to `limit` people matching `prefix`, best first: most recent speakers
   * first (rank from `recency`, higher = more recent), then by name.
   * A min-heap of size `limit` keeps this O(m log limit) for m matches.
   */
  search(prefix: string, limit = 8, recency: (id: string) => number = () => 0): MentionPerson[] {
    const ids = this.matchAll(prefix.trim());
    const better = (a: string, b: string) => {
      const ra = recency(a);
      const rb = recency(b);
      if (ra !== rb) return ra > rb;
      return this.people.get(a)!.name.localeCompare(this.people.get(b)!.name) < 0;
    };
    const heap = new BoundedHeap<string>(limit, better);
    for (const id of ids) heap.offer(id);
    return heap.sortedBest().map((id) => this.people.get(id)!);
  }

  get(id: string): MentionPerson | undefined {
    return this.people.get(id);
  }
}

/** Keeps the best `capacity` items; the root is the worst kept item (min-heap by `better`). */
class BoundedHeap<T> {
  private readonly items: T[] = [];
  constructor(
    private readonly capacity: number,
    private readonly better: (a: T, b: T) => boolean
  ) {}

  offer(x: T) {
    if (this.capacity <= 0) return;
    if (this.items.length < this.capacity) {
      this.items.push(x);
      this.up(this.items.length - 1);
    } else if (this.better(x, this.items[0])) {
      this.items[0] = x;
      this.down(0);
    }
  }

  sortedBest(): T[] {
    return [...this.items].sort((a, b) => (this.better(a, b) ? -1 : this.better(b, a) ? 1 : 0));
  }

  // "worse" floats to the root
  private worse(i: number, j: number) {
    return this.better(this.items[j], this.items[i]);
  }
  private up(i: number) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.worse(i, p)) break;
      [this.items[i], this.items[p]] = [this.items[p], this.items[i]];
      i = p;
    }
  }
  private down(i: number) {
    const n = this.items.length;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < n && this.worse(l, m)) m = l;
      if (r < n && this.worse(r, m)) m = r;
      if (m === i) return;
      [this.items[i], this.items[m]] = [this.items[m], this.items[i]];
      i = m;
    }
  }
}

// ── Composer ────────────────────────────────────────────────────────────────

/** The "@query" being typed just before the caret, if any. */
export const activeMentionQuery = (text: string, caret: number): { start: number; query: string } | null => {
  const before = text.slice(0, caret);
  const m = /(?:^|[\s(])@([\p{L}\p{N}._'-]{0,30})$/u.exec(before);
  if (!m) return null;
  return { start: caret - m[1].length - 1, query: m[1] };
};

const isWordChar = (ch: string | undefined) => !!ch && /[\p{L}\p{N}_]/u.test(ch);

/**
 * Turns what the person typed into the text to encrypt plus the metadata to
 * send. "@Asha Rao" becomes <@id> only for people picked from the list (so a
 * stray "@" in a sentence stays text); "@everyone"/"@here" only when allowed.
 * Longer names are matched first, so "@Asha Rao" wins over "@Asha".
 */
export const encodeMentions = (
  typed: string,
  picked: MentionPerson[],
  allowAll: boolean
): { text: string; mentions: string[]; mentionsAll: MentionAll | null } => {
  const names = [...new Map(picked.map((p) => [p.id, p])).values()].sort((a, b) => b.name.length - a.name.length);
  const mentions = new Set<string>();
  let mentionsAll: MentionAll | null = null;
  let out = "";
  let i = 0;
  while (i < typed.length) {
    const atStart = typed[i] === "@" && !isWordChar(typed[i - 1]);
    if (atStart) {
      const rest = typed.slice(i + 1);
      const person = names.find((p) => rest.startsWith(p.name) && !isWordChar(rest[p.name.length]));
      if (person) {
        out += `<@${person.id}>`;
        mentions.add(person.id);
        i += 1 + person.name.length;
        continue;
      }
      if (allowAll) {
        const all = (["everyone", "here"] as const).find((w) => rest.toLowerCase().startsWith(w) && !isWordChar(rest[w.length]));
        if (all) {
          out += `<@${all}>`;
          // @everyone covers @here
          mentionsAll = mentionsAll === "everyone" ? "everyone" : all;
          i += 1 + all.length;
          continue;
        }
      }
    }
    out += typed[i];
    i += 1;
  }
  return { text: out, mentions: [...mentions], mentionsAll };
};

// ── Rendering ───────────────────────────────────────────────────────────────

/** Splits decrypted text into plain text and mention segments, in one pass. */
export const parseMentions = (text: string): Segment[] => {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ kind: "text", text: text.slice(last, at) });
    const v = m[1];
    out.push(v === "everyone" || v === "here" ? { kind: "all", which: v } : { kind: "mention", userId: v });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
};

/** Readable text with "@Name" in place of tokens (reply previews, editing). */
export const mentionsToPlain = (text: string, nameOf: (id: string) => string | undefined): string =>
  text.replace(TOKEN_RE, (_, v: string) => (v === "everyone" || v === "here" ? `@${v}` : `@${nameOf(v) ?? "someone"}`));

/** People named in a text (for editing: they count as picked again). */
export const mentionedIn = (text: string): string[] =>
  parseMentions(text).flatMap((s) => (s.kind === "mention" ? [s.userId] : []));
