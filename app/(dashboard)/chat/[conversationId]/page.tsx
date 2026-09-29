"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useChatStore } from "@/store/chatStore";
import { useAuthStore } from "@/store/authStore";
import {
  fetchConversation,
  fetchMessages,
  sendMessage,
  markRead,
  reactToMessage,
  deleteMessage,
  editMessage
} from "@/lib/api/chat.api";
import { encryptTextWith, decryptTextWith, type EncryptedText } from "@/lib/crypto/conversationKeys";
import { ChatKeysLockedError } from "@/lib/crypto/keyStore";
import {
  ConversationCrypto,
  registerConversationCrypto,
  rotateConversationGroupKey,
  type SendKey
} from "@/lib/crypto/conversationKeys";
import { useJoinConversation, useSendTyping, CHAT_KEYS_UPDATED_EVENT } from "@/hooks/useChat";
import { MessageBubble } from "../components/MessageBubble";
import { MessageInput } from "../components/MessageInput";
import { FileUploadPreview } from "../components/FileUploadPreview";
import { GroupInfoPanel } from "../components/GroupInfoPanel";
import { KeySetupWizard } from "../components/KeySetupWizard";
import { ChatUnlock } from "../components/ChatUnlock";
import { SafetyNumbersDialog } from "../components/SafetyNumbersDialog";
import { ProjectChatActions, RatingPrompt } from "../components/ProjectChatActions";
import { useProjectApprovals, useProjectStage, ApprovalCard, RequestApprovalDialog } from "../components/ProjectWorkflow";
import { extrasApi, stageLabel, type Timeline } from "@/lib/api/projectExtras.api";
import { useOffensiveConfirm, ModerationWarningPopup } from "../components/ModerationUI";
import { checkMessage, recordPrevented, loadLexicon } from "@/lib/moderation/lexicon";
import { EditCancelledError, type ModerationFlag } from "@/lib/crypto/conversationKeys";
import { Conversation, Message, KeyRef } from "@/types/chat";
import { cn } from "@/lib/utils";
import { ArrowLeft, Users, Lock, Info, ShieldCheck, ShieldAlert, Key } from "lucide-react";
import { toast } from "sonner";

export default function ConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const router = useRouter();
  const { user } = useAuthStore();
  const {
    messages,
    setMessages,
    prependMessages,
    updateMessage,
    setActiveConversation,
    markConversationRead,
    conversations,
    typingUsers,
    onlineUsers
  } = useChatStore();

  const [conv, setConv] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  // Resolves the right key for each message (versioned keys, see conversationKeys.ts)
  const [convCrypto, setConvCrypto] = useState<ConversationCrypto | null>(null);
  // Key for new messages; null while this user has no key for the conversation yet
  const [sendKey, setSendKey] = useState<SendKey | null>(null);
  const [keysLocked, setKeysLocked] = useState(false);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [showKeySetup, setShowKeySetup] = useState(false);
  const [showSafetyNumbers, setShowSafetyNumbers] = useState(false);
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  /** First unread message's id for this viewing session — renders the "New messages" divider and is the initial scroll target. Null once there's nothing unread (or after a remount, since opening already marks read). */
  const [unreadMarkerId, setUnreadMarkerId] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const unreadDividerRef = useRef<HTMLDivElement>(null);

  useJoinConversation(conversationId);
  const sendTyping = useSendTyping(conversationId);

  const convMessages = messages[conversationId] || [];
  const typing = typingUsers[conversationId];
  const typingNames = typing ? Array.from(typing) : [];

  // ── Build conversation crypto ───────────────────────────────────────────────
  const buildCrypto = useCallback(
    async (conversation: Conversation): Promise<ConversationCrypto | null> => {
      if (!user) return null;
      try {
        const c = await ConversationCrypto.create(conversation, user._id);
        registerConversationCrypto(c);
        setKeysLocked(false);
        return c;
      } catch (err) {
        if (err instanceof ChatKeysLockedError) setKeysLocked(true);
        return null;
      }
    },
    [user]
  );

  // ── Decrypt all messages ────────────────────────────────────────────────────
  const decryptAll = useCallback(
    async (msgs: Message[], c: ConversationCrypto | null): Promise<Message[]> =>
      c ? Promise.all(msgs.map((m) => c.decrypt(m))) : msgs,
    []
  );

  // ── Load conversation + messages ────────────────────────────────────────────
  useEffect(() => {
    // Wait for the authenticated user to be resolved (e.g. on a hard refresh,
    // /auth/me is still in flight) — otherwise deriveKey() runs with user=null,
    // the session key permanently fails to derive, and never retries because
    // this effect doesn't depend on `user`.
    if (!conversationId || !user) return;
    setActiveConversation(conversationId);
    setReplyTo(null);
    setShowFileUpload(false);
    setUnreadMarkerId(null);

    (async () => {
      setLoading(true);
      try {
        const [convData, msgData] = await Promise.all([
          fetchConversation(conversationId),
          fetchMessages(conversationId)
        ]);
        setConv(convData);

        const c = await buildCrypto(convData);
        setConvCrypto(c);
        setSendKey(c ? await c.sendKey() : null);

        const decrypted = await decryptAll(msgData.messages, c);
        setMessages(conversationId, decrypted);
        setHasMore(msgData.hasMore);
        setNextCursor(msgData.nextCursor);
        setUnreadMarkerId(msgData.unreadMarkerId);

        if (decrypted.length > 0) {
          markRead(decrypted[decrypted.length - 1]._id).catch(() => {});
          markConversationRead(conversationId);
        }

        // Give group keys to members who lack them (new members, new devices,
        // password resets). Runs quietly in the background.
        if (c && convData.type === "group") {
          c.healGroupKeys().catch((err) => console.warn("Group key sharing skipped:", err));
        }

        // Project chats start with a key made by the admin who set them up (not
        // a member), and get a new key after someone is removed. The first staff
        // member of the team to open the chat replaces it, so only the team can
        // read what's sent from then on. Everyone gets it via "chat:rekey".
        const mine = convData.members.find((m) => m.user._id === user._id);
        if (c && convData.project && convData.rekeyRequested && mine?.role === "admin" && user.role !== "customer") {
          rotateConversationGroupKey(
            convData,
            user._id,
            convData.members.map((m) => ({ _id: m.user._id, publicKey: m.user.publicKey, keyVersion: m.user.keyVersion }))
          ).catch((err) => {
            // 409: another team member replaced it first — fine
            if (err?.response?.status !== 409) console.warn("Project key replacement failed:", err);
          });
        }
      } catch {
        toast.error("Failed to load conversation");
      } finally {
        setLoading(false);
      }
    })();
  }, [conversationId, user?._id, keysLocked]);

  // ── Keys changed (rotation, or someone shared a key with us) ────────────────
  useEffect(() => {
    const onKeysUpdated = async (e: Event) => {
      if ((e as CustomEvent).detail?.conversationId !== conversationId || !user) return;
      try {
        const fresh = await fetchConversation(conversationId);
        setConv(fresh);
        const c = await buildCrypto(fresh);
        setConvCrypto(c);
        setSendKey(c ? await c.sendKey() : null);
        if (c) {
          // Retry messages we couldn't read before
          const current = useChatStore.getState().messages[conversationId] || [];
          const retried = await Promise.all(current.map((m) => (m.decryptionFailed ? c.decrypt(m) : m)));
          setMessages(conversationId, retried);
        }
      } catch {}
    };
    window.addEventListener(CHAT_KEYS_UPDATED_EVENT, onKeysUpdated);
    return () => window.removeEventListener(CHAT_KEYS_UPDATED_EVENT, onKeysUpdated);
  }, [conversationId, user, buildCrypto, setMessages]);

  // ── Scroll on new messages ──────────────────────────────────────────────────
  // Jump instantly when a conversation is first opened (avoids animating through
  // the whole loaded history), but animate smoothly for messages that arrive
  // while already viewing the conversation. If there's an unread marker, the
  // first jump lands at the start of the unread section instead of the very
  // bottom, so nothing unread scrolls past unseen.
  const lastScrolledConvRef = useRef<string | null>(null);
  useEffect(() => {
    // Skip the trivial empty-array render on mount (before messages load) —
    // otherwise it consumes the "first scroll" flag before there's anything
    // to scroll to, and the real initial load ends up animating instead of
    // jumping instantly.
    if (convMessages.length === 0) return;

    const isFirstScrollForConv = lastScrolledConvRef.current !== conversationId;
    lastScrolledConvRef.current = conversationId;

    if (isFirstScrollForConv && unreadMarkerId && unreadDividerRef.current) {
      unreadDividerRef.current.scrollIntoView({ behavior: "auto", block: "start" });
      return;
    }

    bottomRef.current?.scrollIntoView({ behavior: isFirstScrollForConv ? "auto" : "smooth" });
  }, [convMessages.length, conversationId, unreadMarkerId]);

  // ── IntersectionObserver for infinite scroll ───────────────────────────────
  useEffect(() => {
    if (!topSentinelRef.current || !hasMore) return;
    const observer = new IntersectionObserver(
      async ([entry]) => {
        if (!entry.isIntersecting || loadingMore || !nextCursor) return;
        setLoadingMore(true);
        try {
          const data = await fetchMessages(conversationId, nextCursor);
          const decrypted = await decryptAll(data.messages, convCrypto);
          prependMessages(conversationId, decrypted);
          setHasMore(data.hasMore);
          setNextCursor(data.nextCursor);
        } finally {
          setLoadingMore(false);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(topSentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, nextCursor, loadingMore, convCrypto, conversationId]);

  // ── Send message ────────────────────────────────────────────────────────────
  // Sends are chained onto this ref so they hit the server strictly in the
  // order the user triggered them. Without this, firing off several
  // messages quickly lets their encrypt+POST round trips race independently
  // — whichever one's request finishes first gets written (and
  // server-timestamped) first, which visibly reorders messages. Sorting on
  // display can't fix that after the fact, since the server itself recorded
  // the wrong order — the sends have to be serialized at the source.
  const sendQueueRef = useRef<Promise<void>>(Promise.resolve());
  const { confirmOffensive, offensiveDialog } = useOffensiveConfirm();

  // ── Project workflow: live stage + design approvals ─────────────────────────
  const isCustomer = user?.role === "customer";
  const refOf = (v: unknown) => (!v ? null : typeof v === "string" ? v : (v as { _id?: string })._id ?? null);
  const isTeamLead = Boolean(
    conv?.project && user && [conv.project.leadDesigner, conv.project.backupDesigner, conv.project.manager].some((u) => refOf(u) === user._id)
  );
  const { approvalFor, putApproval } = useProjectApprovals(conversationId, Boolean(conv?.project));
  const [approvalTarget, setApprovalTarget] = useState<Message | null>(null);
  useProjectStage(
    conversationId,
    useCallback((t: Timeline) => setConv((c) => (c?.project ? { ...c, project: { ...c.project, ...t } } : c)), [])
  );
  const isProjectChat = Boolean(conv?.project);
  useEffect(() => {
    if (isProjectChat) loadLexicon(); // warm the word list so the first send isn't delayed
  }, [isProjectChat]);

  const handleSend = useCallback(
    async (text: string): Promise<boolean | void> => {
      if (!text.trim() || !sendKey || !user) return;
      const plaintext = text.trim();
      const currentReplyTo = replyTo;

      // Project chats: on-device abuse check before anything is encrypted or sent
      let moderation: ModerationFlag | undefined;
      if (conv?.project) {
        const scan = await checkMessage(plaintext);
        if (scan.hitCount > 0 && scan.severity) {
          if (!(await confirmOffensive(scan))) {
            recordPrevented();
            return false; // keep the text in the box
          }
          moderation = { flagged: true, severity: scan.severity, hitCount: Math.min(scan.hitCount, 20) };
        }
      }

      const next = sendQueueRef.current.catch(() => {}).then(async () => {
        try {
          const { ciphertext, iv, keyRef, franking, frankingKey } = await encryptTextWith(sendKey, plaintext);
          const saved = await sendMessage(conversationId, {
            ciphertext,
            iv,
            type: "text",
            replyTo: currentReplyTo?._id,
            keyRef,
            franking,
            moderation
          });

          // Show it immediately using the server's confirmed response instead
          // of waiting for the chat:message socket event to round-trip back to
          // us — that echo is what was causing the couple-second delay before
          // your own sent messages appeared. We already have the plaintext (we
          // just encrypted it), so there's nothing left to decrypt either.
          // appendMessage dedups by _id, so the later socket echo of this same
          // message is a harmless no-op.
          useChatStore.getState().appendMessage(conversationId, {
            ...saved,
            decryptedContent: plaintext,
            cryptoKey: sendKey.key,
            frankingKey,
            frankVerified: Boolean(saved.franking?.commitment)
          });
          if (conv) {
            useChatStore.getState().upsertConversation({
              ...conv,
              lastMessage: saved,
              lastActivityAt: saved.createdAt
            });
          }

          setReplyTo(null);
        } catch {
          toast.error("Failed to send message");
        }
      });

      sendQueueRef.current = next;
      await next;
    },
    [sendKey, conversationId, user, replyTo, conv, confirmOffensive]
  );

  // ── Edit message ────────────────────────────────────────────────────────────
  const handleEdit = useCallback(
    async (msgId: string, encrypted: EncryptedText) => {
      const { ciphertext, iv, keyRef, franking, moderation } = encrypted;
      await editMessage(msgId, ciphertext, iv, keyRef, franking, moderation);
      // Optimistically update store with decrypted content
      const msgs = messages[conversationId] || [];
      const msg = msgs.find((m) => m._id === msgId);
      if (msg && sendKey) {
        try {
          const opened = await decryptTextWith(sendKey.key, ciphertext, iv, franking.commitment);
          updateMessage(conversationId, {
            ...msg,
            ciphertext,
            iv,
            keyRef,
            franking,
            decryptedContent: opened.text,
            frankingKey: opened.frankingKey,
            frankVerified: opened.verified,
            isEdited: true
          });
        } catch {}
      }
    },
    [conversationId, messages, sendKey, updateMessage]
  );

  // ── Delete message ──────────────────────────────────────────────────────────
  const handleDelete = useCallback(
    async (msgId: string, scope: "me" | "everyone") => {
      const msgs = messages[conversationId] || [];
      const original = msgs.find((m) => m._id === msgId);
      if (!original) return;

      // Optimistic: update immediately instead of waiting on the
      // chat:message:deleted / chat:message:deletedForMe socket round-trip,
      // which previously made deletes look like they silently did nothing.
      if (scope === "everyone") {
        useChatStore.getState().removeMessage(conversationId, msgId);
      } else {
        useChatStore.getState().hideMessageForMe(conversationId, msgId);
      }

      try {
        await deleteMessage(msgId, scope);
      } catch (err: any) {
        // Revert — the delete didn't actually happen server-side.
        if (scope === "everyone") {
          updateMessage(conversationId, original);
        } else {
          useChatStore.getState().appendMessage(conversationId, original);
        }
        // Surface the real reason when we have one (e.g. the 10-minute
        // "delete for everyone" window has passed since this was opened).
        toast.error(err?.response?.data?.message || "Failed to delete message");
      }
    },
    [conversationId, messages, updateMessage]
  );

  // ── Encrypt helper (passed to MessageBubble for edit) ───────────────────────
  const encryptFn = useCallback(
    async (text: string) => {
      if (!sendKey) throw new Error("No key for this conversation yet");
      // Edits are checked again (a cancelled edit stays open for changes)
      let moderation: ModerationFlag | undefined;
      if (conv?.project) {
        const scan = await checkMessage(text);
        if (scan.hitCount > 0 && scan.severity) {
          if (!(await confirmOffensive(scan))) {
            recordPrevented();
            throw new EditCancelledError();
          }
          moderation = { flagged: true, severity: scan.severity, hitCount: Math.min(scan.hitCount, 20) };
        }
      }
      return { ...(await encryptTextWith(sendKey, text)), moderation };
    },
    [sendKey, conv, confirmOffensive]
  );

  // ── Header helpers ──────────────────────────────────────────────────────────
  const getLabel = () => {
    if (!conv) return "";
    if (conv.type === "group") return conv.name || "Group";
    return conv.members.find((m) => m.user._id !== user?._id)?.user.name || "Unknown";
  };

  const getSubtitle = () => {
    if (!conv) return "";
    if (conv.project) {
      const status = { active: "", on_hold: " · On hold", completed: " · Completed" }[conv.project.status];
      return `${stageLabel(conv.project.stage)} · ${conv.members.length} people${status}`;
    }
    if (conv.type === "group") return `${conv.members.length} members`;
    const other = conv.members.find((m) => m.user._id !== user?._id);
    return onlineUsers.has(other?.user._id || "") ? "● Online" : "Offline";
  };

  const otherMember = conv?.members.find((m) => m.user._id !== user?._id);
  const myMember = conv?.members.find((m) => m.user._id === user?._id);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-950">
        <div className="animate-spin h-6 w-6 rounded-full border-2 border-violet-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex min-w-0 h-full overflow-hidden">
      {keysLocked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <ChatUnlock onUnlocked={() => setKeysLocked(false)} />
        </div>
      )}

      {offensiveDialog}
      {approvalTarget && (
        <RequestApprovalDialog
          fileName={approvalTarget.attachments?.[0]?.originalName}
          onCancel={() => setApprovalTarget(null)}
          onSubmit={async (title) => {
            try {
              putApproval(await extrasApi.requestApproval(conversationId, approvalTarget._id, title));
              toast.success("Approval requested — the customer has been notified");
              setApprovalTarget(null);
            } catch (err) {
              toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Couldn't ask for approval");
            }
          }}
        />
      )}
      {conv?.project && (
        <ModerationWarningPopup conversationId={conv._id} warningAt={conv.moderation?.warningAt} active={Boolean(conv.moderation?.openIncident)} />
      )}

      {/* Key setup wizard overlay */}
      {showKeySetup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md">
            <KeySetupWizard onClose={() => setShowKeySetup(false)} />
          </div>
        </div>
      )}

      {/* Safety numbers dialog */}
      {showSafetyNumbers && conv?.type === "dm" && otherMember?.user.publicKey && (
        <SafetyNumbersDialog
          myPublicKey={myMember?.user.publicKey || user?.publicKey || ""}
          theirPublicKey={otherMember.user.publicKey}
          theirName={otherMember.user.name}
          onClose={() => setShowSafetyNumbers(false)}
        />
      )}

      {/* Main chat column */}
      <div className="flex-1 flex flex-col bg-slate-950 min-w-0 h-full">
        {/* Header */}
        <div className="h-14 px-3 sm:px-4 flex items-center gap-2 sm:gap-3 border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm shrink-0">
          <button
            onClick={() => router.push("/chat")}
            className="md:hidden h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition shrink-0"
            aria-label="Back to conversations"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-600/30 to-blue-600/30 border border-violet-500/25 flex items-center justify-center font-bold text-sm text-violet-300 shrink-0">
            {conv?.type === "group" ? <Users className="h-4 w-4" /> : getLabel()[0]?.toUpperCase()}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{getLabel()}</p>
            <p className={cn("text-[11px] truncate", getSubtitle().startsWith("●") ? "text-emerald-400" : "text-slate-400")}>
              {getSubtitle()}
            </p>
          </div>

          {/* Header action buttons */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {/* Project chats: rate / report (customers), flag a customer (staff) */}
            {conv?.project && user && (
              <ProjectChatActions conversation={conv} myUserId={user._id} isCustomer={user.role === "customer"} />
            )}

            {/* Safety numbers (DM only) */}
            {conv?.type === "dm" && otherMember?.user.publicKey && (
              <button
                onClick={() => setShowSafetyNumbers(true)}
                title="Verify safety numbers"
                className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition"
              >
                <ShieldCheck className="h-4 w-4" />
              </button>
            )}

            {/* Key setup */}
            <button
              onClick={() => setShowKeySetup(true)}
              title="Manage encryption keys"
              className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-violet-400 hover:bg-slate-800 transition"
            >
              <Key className="h-4 w-4" />
            </button>

            {/* Group info */}
            {conv?.type === "group" && (
              <button
                onClick={() => setShowGroupInfo((v) => !v)}
                className={cn(
                  "h-8 w-8 rounded-lg flex items-center justify-center transition",
                  showGroupInfo ? "bg-violet-600/25 text-violet-400" : "text-slate-400 hover:text-white hover:bg-slate-800"
                )}
              >
                <Info className="h-4 w-4" />
              </button>
            )}

            {/* E2E lock badge */}
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <Lock className="h-3 w-3 text-emerald-400" />
              <span className="text-[10px] text-emerald-400 font-medium hidden sm:block">E2E</span>
            </div>
          </div>
        </div>

        {conv?.project && user?.role === "customer" && <RatingPrompt conversationId={conv._id} />}

        {/* No key for this conversation yet */}
        {!sendKey && !keysLocked && (
          <div className="mx-4 mt-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-3">
            <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0" />
            <div className="flex-1 min-w-0">
              {conv?.type === "dm" && !otherMember?.user.publicKey ? (
                <>
                  <p className="text-sm text-amber-300 font-medium">
                    Waiting for {otherMember?.user.name || "this person"} to open Chat
                  </p>
                  <p className="text-xs text-amber-400/70">
                    Messages will be end-to-end encrypted once they sign in to chat for the first time.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm text-amber-300 font-medium">Getting access to this chat</p>
                  <p className="text-xs text-amber-400/70">
                    The next member who opens this chat will share its encryption key with you automatically.
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Messages */}
        {/* flex-col anchors short conversations to the bottom via mt-auto on
            the first child (below), not `justify-end` on this container —
            justify-end + overflow-y-auto is a well-known flexbox trap: once
            content overflows, browsers fail to expose the scrollable region
            above the fold, so you get stuck and can't reach the true top.
            mt-auto on the first child achieves the same bottom-anchoring for
            short content without that overflow bug, since justify-content
            here stays at its normal default (flex-start). */}
        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col">
          <div ref={topSentinelRef} className="h-1 mt-auto" />
          {loadingMore && (
            <div className="flex justify-center py-2">
              <div className="animate-spin h-4 w-4 rounded-full border-2 border-violet-500 border-t-transparent" />
            </div>
          )}

          {convMessages.map((msg, idx) => (
            <div key={msg._id}>
              {msg._id === unreadMarkerId && (
                <div ref={unreadDividerRef} className="flex items-center gap-3 py-3">
                  <div className="flex-1 h-px bg-rose-500/30" />
                  <span className="text-[10px] text-rose-400 font-semibold uppercase tracking-wider shrink-0">
                    New messages
                  </span>
                  <div className="flex-1 h-px bg-rose-500/30" />
                </div>
              )}
              <MessageBubble
                message={msg}
                isMine={msg.sender._id === user?._id}
                prevMessage={convMessages[idx - 1]}
                sessionKey={msg.cryptoKey ?? null}
                onReact={(emoji) => reactToMessage(msg._id, emoji)}
                onDelete={(scope) => handleDelete(msg._id, scope)}
                onReply={() => setReplyTo(msg)}
                onEdit={msg.sender._id === user?._id ? (encrypted) => handleEdit(msg._id, encrypted) : undefined}
                encryptFn={encryptFn}
                onRequestApproval={
                  conv?.project && !isCustomer && ["image", "file"].includes(msg.type) && !msg.isDeleted &&
                  (!approvalFor(msg._id) || approvalFor(msg._id)!.status === "withdrawn")
                    ? () => setApprovalTarget(msg)
                    : undefined
                }
                footer={
                  approvalFor(msg._id) ? (
                    <ApprovalCard
                      approval={approvalFor(msg._id)!}
                      canDecide={isCustomer}
                      canWithdraw={!isCustomer && (approvalFor(msg._id)!.requestedBy?._id === user?._id || isTeamLead)}
                      onChange={putApproval}
                    />
                  ) : undefined
                }
              />
            </div>
          ))}

          {/* Typing indicator */}
          {typingNames.length > 0 && (
            <div className="flex items-end gap-2 pl-9 mt-1">
              <div className="bg-slate-800 border border-slate-700 rounded-2xl rounded-bl-sm px-4 py-2.5">
                <div className="flex items-center gap-1">
                  <span className="text-xs text-slate-400">
                    {typingNames.slice(0, 2).join(", ")} {typingNames.length === 1 ? "is" : "are"} typing
                  </span>
                  <span className="flex gap-0.5 ml-1">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* File upload preview */}
        {showFileUpload && (
          <FileUploadPreview
            conversationId={conversationId}
            sendKey={sendKey}
            onUploaded={() => setShowFileUpload(false)}
            onCancel={() => setShowFileUpload(false)}
          />
        )}

        {/* Message input */}
        <MessageInput
          onSend={handleSend}
          quickReplyFill={
            user && user.role !== "customer" && user.role !== "marketing"
              ? (text) => {
                  const customer = conv?.members.find((m) => conv.project?.customers.some((c) => refOf(c) === m.user._id))?.user.name;
                  const other = conv?.type === "dm" ? conv.members.find((m) => m.user._id !== user._id)?.user.name : undefined;
                  return text
                    .split("{customer}").join((customer || other || "there").split(" ")[0])
                    .split("{designer}").join(user.name.split(" ")[0]);
                }
              : undefined
          }
          onTyping={sendTyping}
          onAttachClick={() => setShowFileUpload((v) => !v)}
          disabled={!sendKey}
          placeholder={
            sendKey
              ? "Type a message…"
              : conv?.type === "dm" && !otherMember?.user.publicKey
              ? `Waiting for ${otherMember?.user.name || "user"} to open Chat…`
              : "Waiting for access to this chat…"
          }
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
        />
      </div>

      {/* Group info panel (drawer on mobile/tablet, side panel on desktop) */}
      {showGroupInfo && conv?.type === "group" && (
        <>
          {/* Mobile backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden animate-in fade-in duration-200"
            onClick={() => setShowGroupInfo(false)}
          />

          {/* Panel container */}
          <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-80 shadow-2xl lg:static lg:w-80 lg:z-auto lg:shadow-none shrink-0 h-full flex flex-col animate-in slide-in-from-right duration-200">
            <GroupInfoPanel
              conversation={conv}
              onClose={() => setShowGroupInfo(false)}
              onConversationUpdated={setConv}
            />
          </div>
        </>
      )}
    </div>
  );
}
