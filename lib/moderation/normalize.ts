/**
 * Text normalisation for the on-device abuse check. This is a copy of
 * backend/src/utils/moderationText.js — keep the two identical (the server
 * stores word-list terms in this form).
 */

const INVISIBLE = /[​-‍⁠﻿­]/g;
const LEET: Record<string, string> = { "@": "a", "4": "a", "3": "e", "1": "i", "!": "i", "0": "o", $: "s", "5": "s", "7": "t" };
const LEET_RE = /[@4310!$57]/g;
const HAS_LETTER = /\p{L}/u;
const NON_LETTER = /[^\p{L}\p{M}]+/u;
const REPEATS = /(\p{L}\p{M}*)\1+/gu;

export const SEVERITY_RANK: Record<string, number> = { mild: 1, abusive: 2, threat: 3 };
export type Severity = "mild" | "abusive" | "threat";

export function normalizeToWords(input: string): string[] {
  const text = String(input || "").normalize("NFKC").toLowerCase().replace(INVISIBLE, "");
  const words: string[] = [];
  for (const chunk of text.split(/\s+/)) {
    if (!chunk || !HAS_LETTER.test(chunk)) continue;
    const unleet = chunk.replace(LEET_RE, (c) => LEET[c]);
    for (const part of unleet.split(NON_LETTER)) if (part) words.push(part);
  }

  // Spelled-out words: 3+ single letters in a row become one word
  const merged: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length >= 3) merged.push(run.join(""));
    else merged.push(...run);
    run = [];
  };
  for (const w of words) {
    if ([...w].length === 1) run.push(w);
    else {
      flush();
      merged.push(w);
    }
  }
  flush();

  return merged.map((w) => w.replace(REPEATS, "$1"));
}

export interface ScanResult {
  hitCount: number;
  severity: Severity | null;
}

/** Word-list matches in a message; overlapping matches count once (longest wins). */
export function scanText(text: string, lexicon: { term: string; severity: Severity }[]): ScanResult {
  const words = normalizeToWords(text);
  const spans: { start: number; end: number; severity: Severity }[] = [];
  for (const { term, severity } of lexicon) {
    const parts = term ? term.split(" ") : [];
    if (!parts.length) continue;
    for (let i = 0; i + parts.length <= words.length; i++) {
      if (parts.every((p, k) => words[i + k] === p)) spans.push({ start: i, end: i + parts.length, severity });
    }
  }
  spans.sort((a, b) => b.end - b.start - (a.end - a.start) || SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
  const taken = new Array(words.length).fill(false);
  let hitCount = 0;
  let severity: Severity | null = null;
  for (const sp of spans) {
    let free = true;
    for (let i = sp.start; i < sp.end; i++) if (taken[i]) free = false;
    if (!free) continue;
    for (let i = sp.start; i < sp.end; i++) taken[i] = true;
    hitCount += 1;
    if (!severity || SEVERITY_RANK[sp.severity] > SEVERITY_RANK[severity]) severity = sp.severity;
  }
  return { hitCount, severity };
}
