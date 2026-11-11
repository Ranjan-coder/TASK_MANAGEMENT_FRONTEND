/**
 * lib/chat/format.ts — light message formatting (P4), parsed in the browser.
 *
 *   **bold**   _italic_   ~strike~   `code`
 *   ```            > quote        - item / * item
 *   code block
 *   ```
 *
 * Produces plain data (blocks → lines → inline spans) that React renders as
 * elements; nothing ever becomes HTML, so a message can't inject markup.
 * Underscores and tildes inside words (snake_case, file~1) stay as typed.
 * One pass per line: O(n) in the message length.
 */

export type Inline = { kind: "text" | "bold" | "italic" | "strike" | "code"; text: string };

export type Block =
  | { kind: "code"; text: string }
  | { kind: "quote"; lines: Inline[][] }
  | { kind: "list"; items: Inline[][] }
  | { kind: "para"; lines: Inline[][] };

// Alternatives tried left to right at each position; word-boundary rules keep snake_case intact
const INLINE_RE =
  /`([^`\n]+)`|\*\*([^*\n]+?)\*\*|(?<![\p{L}\p{N}_])_([^_\n]+?)_(?![\p{L}\p{N}_])|(?<![\p{L}\p{N}~])~([^~\n]+?)~(?![\p{L}\p{N}~])/gu;

/** Inline spans of one line. */
export const parseInline = (line: string): Inline[] => {
  const out: Inline[] = [];
  let last = 0;
  for (const m of line.matchAll(INLINE_RE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ kind: "text", text: line.slice(last, at) });
    if (m[1] !== undefined) out.push({ kind: "code", text: m[1] });
    else if (m[2] !== undefined) out.push({ kind: "bold", text: m[2] });
    else if (m[3] !== undefined) out.push({ kind: "italic", text: m[3] });
    else out.push({ kind: "strike", text: m[4] });
    last = at + m[0].length;
  }
  if (last < line.length) out.push({ kind: "text", text: line.slice(last) });
  return out;
};

const QUOTE_RE = /^>\s?(.*)$/;
const ITEM_RE = /^\s*[-*•]\s+(.*)$/;

/** Splits a message into blocks (code fences, quotes, lists, paragraphs). */
export const parseFormatting = (text: string): Block[] => {
  const blocks: Block[] = [];
  const lines = text.split("\n");
  let i = 0;
  const push = (kind: "quote" | "list" | "para", line: Inline[]) => {
    const prev = blocks[blocks.length - 1];
    if (kind === "list") {
      if (prev?.kind === "list") prev.items.push(line);
      else blocks.push({ kind: "list", items: [line] });
    } else if (prev?.kind === kind) prev.lines.push(line);
    else blocks.push({ kind, lines: [line] } as Block);
  };
  while (i < lines.length) {
    const line = lines[i];
    if (line.trimStart().startsWith("```")) {
      // Fenced code: everything up to the closing fence, untouched (an unclosed fence runs to the end)
      const body: string[] = [];
      const firstRest = line.trimStart().slice(3);
      if (firstRest.trim() && !firstRest.includes("```")) body.push(firstRest);
      i += 1;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) body.push(lines[i++]);
      i += 1; // closing fence
      blocks.push({ kind: "code", text: body.join("\n") });
      continue;
    }
    const q = QUOTE_RE.exec(line);
    const item = q ? null : ITEM_RE.exec(line);
    if (q) push("quote", parseInline(q[1]));
    else if (item) push("list", parseInline(item[1]));
    else push("para", parseInline(line));
    i += 1;
  }
  return blocks;
};

/** True when a message uses any formatting (plain messages skip the block layout). */
export const hasFormatting = (text: string): boolean => /[`*_~]|^\s*>|^\s*[-*•]\s/m.test(text);
