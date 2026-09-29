import { apiClient } from "@/lib/api/client";
import { scanText, type ScanResult, type Severity } from "./normalize";

/**
 * The abuse word list, downloaded from the server and cached (memory +
 * localStorage, revalidated with an ETag). The check runs entirely on this
 * device; message text never leaves it unencrypted.
 */
interface Lexicon {
  version: string;
  terms: { term: string; severity: Severity }[];
}

const STORE_KEY = "bonito:moderation-lexicon";
const REFRESH_MS = 10 * 60 * 1000;
let current: Lexicon | null = null;
let fetchedAt = 0;
let inflight: Promise<Lexicon | null> | null = null;

const readStored = (): Lexicon | null => {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Lexicon) : null;
  } catch {
    return null;
  }
};

export async function loadLexicon(): Promise<Lexicon | null> {
  if (current && Date.now() - fetchedAt < REFRESH_MS) return current;
  if (inflight) return inflight;
  current = current || readStored();
  inflight = (async () => {
    try {
      const res = await apiClient.get("/moderation/lexicon", {
        headers: current ? { "If-None-Match": `"${current.version}"` } : {},
        validateStatus: (s) => s === 200 || s === 304
      });
      if (res.status === 200) {
        const data = res.data.data as { version: string; terms: { t: string; s: Severity }[] };
        current = { version: data.version, terms: data.terms.map((x) => ({ term: x.t, severity: x.s })) };
        try {
          localStorage.setItem(STORE_KEY, JSON.stringify(current));
        } catch {
          /* storage full or blocked: memory copy is enough */
        }
      }
      fetchedAt = Date.now();
    } catch {
      /* offline: use whatever copy we have */
    } finally {
      inflight = null;
    }
    return current;
  })();
  return inflight;
}

/** Checks a message against the word list. Returns zero hits if the list isn't available. */
export async function checkMessage(text: string): Promise<ScanResult> {
  const lex = await loadLexicon();
  return lex ? scanText(text, lex.terms) : { hitCount: 0, severity: null };
}

/** Anonymous counter: the sender chose not to send after the warning. */
export function recordPrevented() {
  apiClient.post("/moderation/prevented", {}).catch(() => {});
}
