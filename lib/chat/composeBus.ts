/**
 * lib/chat/composeBus.ts — "Ask in chat" (project-contacts-plan.md P5): puts
 * "@Name " into a chat's message box from anywhere (Group Info, Home).
 *
 * The draft (lib/chat/drafts.ts) is the one place the text lives: this writes
 * the mention into it, then pings an open composer for that chat to reload.
 * If no composer is open (e.g. from Home), the chat picks the draft up when it
 * opens. The mention is remembered as "picked", so it's sent as a real mention.
 */
import { getDraft, setDraft } from "./drafts";
import type { MentionPerson } from "./mentions";

type Listener = (key: string) => void;
const listeners = new Set<Listener>();

/** A composer subscribes for its own draft key. */
export const onComposeChange = (fn: Listener) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

/** Adds "@Name " at the start of the chat's draft (once) and tells the open composer. */
export const askInChat = (conversationId: string, person: MentionPerson) => {
  const d = getDraft(conversationId) ?? { text: "", picked: [] };
  const tag = `@${person.name} `;
  const text = d.text.includes(`@${person.name}`) ? d.text : tag + d.text;
  const picked = d.picked.some((p) => p.id === person.id) ? d.picked : [...d.picked, person];
  setDraft(conversationId, { text, picked });
  for (const fn of listeners) fn(conversationId);
};
