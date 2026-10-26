/**
 * lib/chat/drafts.ts — what someone was typing in each chat or thread
 * (chat-features-plan.md CH-P). Switching chats or reloading keeps it.
 *
 * Drafts never go to the server. In memory they're a Map; on this device
 * they're saved as one AES-GCM-encrypted blob (key made here, never
 * exported), half a second after typing stops.
 */
import { draftKey, loadDraftBlob, saveDraftBlob } from "@/lib/crypto/keyStore";
import type { MentionPerson } from "./mentions";

export interface Draft {
  text: string;
  /** People picked from the @ picker (so mentions survive the reload) */
  picked: MentionPerson[];
}

const MAX_DRAFTS = 100; // oldest dropped first
const MAX_LENGTH = 20_000;

let owner: string | null = null;
const drafts = new Map<string, Draft>(); // insertion order = least recently changed first
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let loading: Promise<void> | null = null;

const persist = async () => {
  if (!owner) return;
  const who = owner;
  try {
    if (!drafts.size) return await saveDraftBlob(who, null);
    const key = await draftKey(who);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify([...drafts])));
    if (owner === who) await saveDraftBlob(who, { iv, data });
  } catch {
    /* storage unavailable (private mode): drafts stay in memory */
  }
};

/** Loads this person's saved drafts (once per sign-in). */
export const initDrafts = (userId: string): Promise<void> => {
  if (owner === userId && loading) return loading;
  resetDrafts();
  owner = userId;
  loading = (async () => {
    try {
      const blob = await loadDraftBlob(userId);
      if (!blob || owner !== userId) return;
      const key = await draftKey(userId);
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: blob.iv }, key, blob.data);
      for (const [k, d] of JSON.parse(new TextDecoder().decode(plain)) as [string, Draft][]) {
        if (typeof k === "string" && typeof d?.text === "string" && !drafts.has(k)) drafts.set(k, { text: d.text, picked: Array.isArray(d.picked) ? d.picked : [] });
      }
    } catch {
      /* unreadable (new key, other device): start empty */
    }
  })();
  return loading;
};

export const getDraft = (key: string): Draft | null => drafts.get(key) ?? null;

/** Resolves once saved drafts are loaded (immediately if nothing is loading). */
export const draftsReady = (): Promise<void> => loading ?? Promise.resolve();

/** Saves (or clears, when empty) the draft for a chat (`conversationId`) or thread (`thread:<rootId>`). */
export const setDraft = (key: string, draft: Draft | null) => {
  drafts.delete(key); // re-inserting moves it to the newest end
  if (draft && draft.text.trim()) {
    drafts.set(key, { text: draft.text.slice(0, MAX_LENGTH), picked: draft.picked });
    while (drafts.size > MAX_DRAFTS) drafts.delete(drafts.keys().next().value!);
  }
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 500);
};

/** Sign-out: forget drafts in memory (storage is wiped with the keys). */
export const resetDrafts = () => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  drafts.clear();
  owner = null;
  loading = null;
};
