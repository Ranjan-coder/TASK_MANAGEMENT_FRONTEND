"use client";

import { memo } from "react";
import type { EncryptedText } from "@/lib/crypto/conversationKeys";
import type { DesignApproval } from "@/lib/api/projectExtras.api";
import type { Message } from "@/types/chat";
import type { Tick } from "@/lib/chat/receipts";
import { MessageBubble } from "./MessageBubble";
import { ApprovalCard } from "./ProjectWorkflow";

/** Stable callbacks for message rows (the page passes ones that read its latest handlers through a ref). */
export interface RowActions {
  react: (id: string, emoji: string) => void;
  del: (id: string, scope: "me" | "everyone") => void;
  reply: (msg: Message) => void;
  edit: (id: string, encrypted: EncryptedText) => Promise<void>;
  requestApproval: (msg: Message) => void;
  putApproval: (a: DesignApproval) => void;
  /** Unsent messages (lib/chat/chatOutbox.ts) */
  retry: (msg: Message) => void;
  discard: (msg: Message) => void;
  /** Threads and "Message info" (P2) */
  openThread: (msg: Message) => void;
  info: (msg: Message) => void;
  /** Pins and stars (P3) */
  togglePin: (msg: Message, pinned: boolean) => void;
  toggleStar: (msg: Message) => void;
  /** P4 */
  forward: (msg: Message) => void;
}

/**
 * One message row. Memoized: a typing, presence or reaction event elsewhere
 * re-renders only the rows whose props actually changed.
 */
export const MessageRow = memo(function MessageRow({
  msg,
  prevMessage,
  isMine,
  showUnreadMarker,
  encryptFn,
  actions,
  approval,
  canRequestApproval,
  canDecide,
  canWithdraw,
  tick,
  tickTitle,
  seenBy,
  canInfo = false,
  inThread = false,
  pinned = false,
  canPin = false,
  highlighted = false,
  canForward = false
}: {
  /** Staff only (customers can't forward) */
  canForward?: boolean;
  pinned?: boolean;
  /** May pin / unpin in this chat (thread-only replies can't be pinned) */
  canPin?: boolean;
  highlighted?: boolean;
  tick?: Tick;
  tickTitle?: string;
  seenBy?: number;
  /** Show "Message info" (staff, own message, group chat) */
  canInfo?: boolean;
  /** Rendered inside a thread panel: no "reply in thread" there (one level only) */
  inThread?: boolean;
  msg: Message;
  prevMessage?: Message;
  isMine: boolean;
  showUnreadMarker: boolean;
  encryptFn: (text: string) => Promise<EncryptedText>;
  actions: RowActions;
  approval?: DesignApproval;
  canRequestApproval: boolean;
  canDecide: boolean;
  canWithdraw: boolean;
}) {
  // Not on the server yet: nothing to react to, reply to, edit or delete there
  const pending = Boolean(msg.localStatus);
  return (
    <>
      {showUnreadMarker && (
        <div className="flex items-center gap-3 py-3">
          <div className="flex-1 h-px bg-rose-500/30" />
          <span className="text-[10px] text-rose-400 font-semibold uppercase tracking-wider shrink-0">
            New messages
          </span>
          <div className="flex-1 h-px bg-rose-500/30" />
        </div>
      )}
      <MessageBubble
        message={msg}
        isMine={isMine}
        prevMessage={prevMessage}
        sessionKey={msg.cryptoKey ?? null}
        onReact={pending ? undefined : (emoji) => actions.react(msg._id, emoji)}
        onDelete={pending ? undefined : (scope) => actions.del(msg._id, scope)}
        onReply={pending ? undefined : () => actions.reply(msg)}
        onEdit={isMine && !pending ? (encrypted) => actions.edit(msg._id, encrypted) : undefined}
        encryptFn={encryptFn}
        onRequestApproval={canRequestApproval && !pending ? () => actions.requestApproval(msg) : undefined}
        onRetry={msg.localStatus === "failed" ? () => actions.retry(msg) : undefined}
        onDiscard={msg.localStatus === "failed" ? () => actions.discard(msg) : undefined}
        tick={tick}
        tickTitle={tickTitle}
        seenBy={seenBy}
        onInfo={canInfo && !pending ? () => actions.info(msg) : undefined}
        onOpenThread={!inThread && !pending && !msg.threadRoot && !msg.isDeleted ? () => actions.openThread(msg) : undefined}
        pinned={pinned}
        onTogglePin={
          canPin && !pending && !msg.isDeleted && msg.type !== "system" && (!msg.threadRoot || msg.alsoInChat)
            ? () => actions.togglePin(msg, pinned)
            : undefined
        }
        onToggleStar={!pending && !msg.isDeleted && msg.type !== "system" ? () => actions.toggleStar(msg) : undefined}
        highlighted={highlighted}
        onForward={canForward && !pending && !msg.isDeleted && msg.type !== "system" ? () => actions.forward(msg) : undefined}
        footer={
          approval ? (
            <ApprovalCard approval={approval} canDecide={canDecide} canWithdraw={canWithdraw} onChange={actions.putApproval} />
          ) : undefined
        }
      />
    </>
  );
});
