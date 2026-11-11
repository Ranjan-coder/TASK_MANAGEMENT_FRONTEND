"use client";

import { createContext, useContext, useMemo } from "react";
import { MentionIndex, type MentionPerson } from "@/lib/chat/mentions";
import type { Conversation } from "@/types/chat";
import type { User } from "@/types";

/** What message rows and the composer need to know about mentions in the open chat. */
export interface MentionInfo {
  myId: string | null;
  index: MentionIndex;
  /** Who I may mention (customers: only the project team) */
  candidates: MentionPerson[];
  /** May I use @everyone / @here here? (decision CH-D2; the server checks again) */
  canMentionAll: boolean;
  nameOf: (id: string) => string | undefined;
}

const empty: MentionInfo = { myId: null, index: new MentionIndex([]), candidates: [], canMentionAll: false, nameOf: () => undefined };
const Ctx = createContext<MentionInfo>(empty);

export const useMentions = () => useContext(Ctx);

const refId = (v: unknown) => (!v ? null : typeof v === "string" ? v : (v as { _id?: string })._id ?? null);

/** Mention info for a chat (the page computes it once and provides it to rows and the composer). */
export function useMentionInfo(conv: Conversation | null, user: User | null): MentionInfo {
  return useMemo<MentionInfo>(() => {
    if (!conv || !user) return empty;
    const everyone = conv.members.filter((m) => m.user).map((m) => ({ id: m.user._id, name: m.user.name }));
    const customers = new Set((conv.project?.customers || []).map(refId).filter(Boolean) as string[]);
    const isCustomer = user.role === "customer";
    const candidates = everyone.filter((p) => p.id !== user._id && !(isCustomer && customers.has(p.id)));
    const mine = conv.members.find((m) => m.user?._id === user._id);
    const canMentionAll = conv.type === "group" && !isCustomer && (Boolean(conv.project) || mine?.role === "admin");
    const names = new Map(everyone.map((p) => [p.id, p.name]));
    return {
      myId: user._id,
      index: new MentionIndex(candidates),
      candidates,
      canMentionAll,
      nameOf: (id) => names.get(id)
    };
  }, [conv?._id, conv?.members, conv?.project, conv?.type, user]);
}

export function MentionProvider({ value, children }: { value: MentionInfo; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
