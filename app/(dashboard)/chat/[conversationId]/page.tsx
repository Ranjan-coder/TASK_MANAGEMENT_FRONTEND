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
import {
  deriveSessionKey,
  encryptMessage,
  decryptMessage,
  unwrapGroupKey,
  computeFingerprint
} from "@/lib/crypto/e2e";
import {
  loadPrivateKey,
  ensureUserKeys,
  getCachedSessionKey,
  setCachedSessionKey,
  dmCacheKey,
  groupCacheKey
} from "@/lib/crypto/keyStore";
import { useJoinConversation, useSendTyping } from "@/hooks/useChat";
import { MessageBubble } from "../components/MessageBubble";
import { MessageInput } from "../components/MessageInput";
import { FileUploadPreview } from "../components/FileUploadPreview";
import { GroupInfoPanel } from "../components/GroupInfoPanel";
import { KeySetupWizard } from "../components/KeySetupWizard";
import { SafetyNumbersDialog } from "../components/SafetyNumbersDialog";
import { Conversation, Message } from "@/types/chat";
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
  const [sessionKey, setSessionKey] = useState<CryptoKey | null>(null);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [showKeySetup, setShowKeySetup] = useState(false);
  const [showSafetyNumbers, setShowSafetyNumbers] = useState(false);
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);

  useJoinConversation(conversationId);
  const sendTyping = useSendTyping(conversationId);

  const convMessages = messages[conversationId] || [];
  const typing = typingUsers[conversationId];
  const typingNames = typing ? Array.from(typing) : [];

  // ── Derive session key ──────────────────────────────────────────────────────
  const deriveKey = useCallback(
    async (conversation: Conversation): Promise<CryptoKey | null> => {
      if (!user) return null;
      let myPrivateKey = await loadPrivateKey(user._id);
      if (!myPrivateKey) {
        try {
          const ensured = await ensureUserKeys(user._id);
          myPrivateKey = ensured.privateKey;
        } catch {
          return null;
        }
      }
      if (!myPrivateKey) return null;

      if (conversation.type === "dm") {
        const other = conversation.members.find((m) => m.user._id !== user._id);
        if (!other) return null;
        let otherPubKey = other.user.publicKey;
        if (!otherPubKey) {
          try {
            const { fetchPublicKey } = await import("@/lib/api/chat.api");
            const keyInfo = await fetchPublicKey(other.user._id);
            otherPubKey = keyInfo?.publicKey;
          } catch {}
        }
        if (!otherPubKey) return null;
        const cacheKey = dmCacheKey(other.user._id);
        const cached = getCachedSessionKey(cacheKey);
        if (cached) return cached;
        const key = await deriveSessionKey(myPrivateKey, otherPubKey);
        setCachedSessionKey(cacheKey, key);
        return key;
      } else {
        const cacheKey = groupCacheKey(conversation._id);
        const cached = getCachedSessionKey(cacheKey);
        if (cached) return cached;

        const myWrappedKey = conversation.groupKeys?.[user._id];
        if (!myWrappedKey) return null;

        const creatorMember = conversation.members.find((m) => m.user._id === conversation.createdBy);
        let creatorPublicKey = creatorMember?.user?.publicKey;
        if (!creatorPublicKey && conversation.createdBy === user._id) {
          try {
            const ensured = await ensureUserKeys(user._id);
            creatorPublicKey = ensured.publicKeyB64;
          } catch {}
        }
        if (!creatorPublicKey) return null;

        const creatorSession = await deriveSessionKey(myPrivateKey, creatorPublicKey);
        const groupKey = await unwrapGroupKey(myWrappedKey, creatorSession);
        setCachedSessionKey(cacheKey, groupKey);
        return groupKey;
      }
    },
    [user]
  );

  // ── Decrypt all messages ────────────────────────────────────────────────────
  const decryptAll = useCallback(
    async (msgs: Message[], key: CryptoKey): Promise<Message[]> =>
      Promise.all(
        msgs.map(async (msg) => {
          if (msg.type === "system" || msg.isDeleted || !msg.ciphertext || !msg.iv) return msg;
          try {
            const plain = await decryptMessage(msg.ciphertext, msg.iv, key);
            return { ...msg, decryptedContent: plain };
          } catch {
            return { ...msg, decryptedContent: "🔒 Unable to decrypt", decryptionFailed: true };
          }
        })
      ),
    []
  );

  // ── Load conversation + messages ────────────────────────────────────────────
  useEffect(() => {
    if (!conversationId) return;
    setActiveConversation(conversationId);
    setReplyTo(null);
    setShowFileUpload(false);

    (async () => {
      setLoading(true);
      try {
        const [convData, msgData] = await Promise.all([
          fetchConversation(conversationId),
          fetchMessages(conversationId)
        ]);
        setConv(convData);

        const key = await deriveKey(convData);
        if (!key) {
          // Check if it's because private key doesn't exist
          const privKey = await loadPrivateKey(user!._id);
          if (!privKey) setShowKeySetup(true);
        }
        setSessionKey(key);

        const decrypted = key ? await decryptAll(msgData.messages, key) : msgData.messages;
        setMessages(conversationId, decrypted);
        setHasMore(msgData.hasMore);
        setNextCursor(msgData.nextCursor);

        if (decrypted.length > 0) {
          markRead(decrypted[decrypted.length - 1]._id).catch(() => {});
          markConversationRead(conversationId);
        }
      } catch {
        toast.error("Failed to load conversation");
      } finally {
        setLoading(false);
      }
    })();
  }, [conversationId]);

  // ── Scroll to bottom on new messages ───────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [convMessages.length]);

  // ── IntersectionObserver for infinite scroll ───────────────────────────────
  useEffect(() => {
    if (!topSentinelRef.current || !hasMore) return;
    const observer = new IntersectionObserver(
      async ([entry]) => {
        if (!entry.isIntersecting || loadingMore || !nextCursor) return;
        setLoadingMore(true);
        try {
          const data = await fetchMessages(conversationId, nextCursor);
          const decrypted = sessionKey ? await decryptAll(data.messages, sessionKey) : data.messages;
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
  }, [hasMore, nextCursor, loadingMore, sessionKey, conversationId]);

  // ── Send message ────────────────────────────────────────────────────────────
  const handleSend = useCallback(
    async (text: string) => {
      if (!text.trim() || !sessionKey || !user) return;
      try {
        const { ciphertext, iv } = await encryptMessage(text.trim(), sessionKey);
        await sendMessage(conversationId, {
          ciphertext,
          iv,
          type: "text",
          replyTo: replyTo?._id
        });
        setReplyTo(null);
      } catch {
        toast.error("Failed to send message");
      }
    },
    [sessionKey, conversationId, user, replyTo]
  );

  // ── Edit message ────────────────────────────────────────────────────────────
  const handleEdit = useCallback(
    async (msgId: string, ciphertext: string, iv: string) => {
      await editMessage(msgId, ciphertext, iv);
      // Optimistically update store with decrypted content
      const msgs = messages[conversationId] || [];
      const msg = msgs.find((m) => m._id === msgId);
      if (msg && sessionKey) {
        try {
          const plain = await decryptMessage(ciphertext, iv, sessionKey);
          updateMessage(conversationId, { ...msg, ciphertext, iv, decryptedContent: plain, isEdited: true });
        } catch {}
      }
    },
    [conversationId, messages, sessionKey, updateMessage]
  );

  // ── Encrypt helper (passed to MessageBubble for edit) ───────────────────────
  const encryptFn = useCallback(
    async (text: string) => {
      if (!sessionKey) throw new Error("No session key");
      return encryptMessage(text, sessionKey);
    },
    [sessionKey]
  );

  // ── Header helpers ──────────────────────────────────────────────────────────
  const getLabel = () => {
    if (!conv) return "";
    if (conv.type === "group") return conv.name || "Group";
    return conv.members.find((m) => m.user._id !== user?._id)?.user.name || "Unknown";
  };

  const getSubtitle = () => {
    if (!conv) return "";
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
      {/* Key setup wizard overlay */}
      {showKeySetup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md">
            <KeySetupWizard onComplete={() => { setShowKeySetup(false); window.location.reload(); }} />
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

        {/* Key not set up warning banner */}
        {!sessionKey && !showKeySetup && (
          <div className="mx-4 mt-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-3">
            {conv?.type === "dm" && !otherMember?.user.publicKey ? (
              <>
                <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-amber-300 font-medium">
                    Waiting for {otherMember?.user.name || "coworker"}&apos;s encryption keys
                  </p>
                  <p className="text-xs text-amber-400/70">
                    This user has not yet initialized chat encryption. Once they open Chat, encrypted messaging will be ready.
                  </p>
                </div>
              </>
            ) : (
              <>
                <Key className="h-4 w-4 text-amber-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-amber-300 font-medium">Encryption keys required</p>
                  <p className="text-xs text-amber-400/70">Set up your encryption keys to send and read messages</p>
                </div>
                <button
                  onClick={() => setShowKeySetup(true)}
                  className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-300 text-xs font-medium transition"
                >
                  Set Up
                </button>
              </>
            )}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div ref={topSentinelRef} className="h-1" />
          {loadingMore && (
            <div className="flex justify-center py-2">
              <div className="animate-spin h-4 w-4 rounded-full border-2 border-violet-500 border-t-transparent" />
            </div>
          )}

          {convMessages.map((msg, idx) => (
            <MessageBubble
              key={msg._id}
              message={msg}
              isMine={msg.sender._id === user?._id}
              prevMessage={convMessages[idx - 1]}
              sessionKey={sessionKey}
              onReact={(emoji) => reactToMessage(msg._id, emoji)}
              onDelete={msg.sender._id === user?._id ? () => deleteMessage(msg._id) : undefined}
              onReply={() => setReplyTo(msg)}
              onEdit={msg.sender._id === user?._id ? (ct, iv) => handleEdit(msg._id, ct, iv) : undefined}
              encryptFn={encryptFn}
            />
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
            sessionKey={sessionKey}
            onUploaded={() => setShowFileUpload(false)}
            onCancel={() => setShowFileUpload(false)}
          />
        )}

        {/* Message input */}
        <MessageInput
          onSend={handleSend}
          onTyping={sendTyping}
          onAttachClick={() => setShowFileUpload((v) => !v)}
          disabled={!sessionKey}
          placeholder={
            sessionKey
              ? "Type a message…"
              : conv?.type === "dm" && !otherMember?.user.publicKey
              ? `Waiting for ${otherMember?.user.name || "user"} to initialize keys…`
              : "Set up encryption to chat…"
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
