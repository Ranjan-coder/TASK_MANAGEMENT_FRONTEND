"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { getSocket } from "@/lib/socket";
import { findIndexById } from "@/lib/chat/messageStore";
import {
  fetchMessagesAround,
  fetchMessagesAfter,
  fetchPins,
  pinMessage,
  unpinMessage,
  starMessage,
  unstarMessage,
  type PinnedItem
} from "@/lib/api/chat.api";
import { PinnedBar } from "../components/PinnedBar";
import { ServiceBanner } from "../components/ServiceBanner";
import { FilesPanel } from "../components/FilesPanel";
import { ForwardDialog } from "../components/ForwardDialog";
import { MessageMenu } from "../components/MessageMenu";
import { useMessageMenu } from "@/lib/chat/messageMenu";
import { ScheduledList, type ScheduledListHandle } from "../components/ScheduledList";
import { sendEncryptedFile } from "@/lib/chat/files";
import { scheduleMessage, openTeamNotes } from "@/lib/api/chat.api";
import { createInitialGroupKeys } from "@/lib/crypto/conversationKeys";
import { NotebookPen } from "lucide-react";
import { SearchPanel } from "../components/SearchPanel";
import { ArrowDown } from "lucide-react";
import { useChatStore } from "@/store/chatStore";
import { useAuthStore } from "@/store/authStore";
import {
  fetchConversation,
  fetchMessages,
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
import { queueMessage, retryMessage, discardMessage } from "@/lib/chat/chatOutbox";
import { localIdFor } from "@/lib/chat/messageStore";
import { useJoinConversation, useSendTyping, CHAT_KEYS_UPDATED_EVENT } from "@/hooks/useChat";
import { MessageInput } from "../components/MessageInput";
import { FileUploadPreview } from "../components/FileUploadPreview";
import { GroupInfoPanel } from "../components/GroupInfoPanel";
import { KeySetupWizard } from "../components/KeySetupWizard";
import { ChatUnlock } from "../components/ChatUnlock";
import { SafetyNumbersDialog } from "../components/SafetyNumbersDialog";
import { RatingPrompt } from "../components/ProjectChatActions";
import { useProjectApprovals, useProjectStage, RequestApprovalDialog } from "../components/ProjectWorkflow";
import { ChatHeader } from "../components/ChatHeader";
import { NoKeyBanner, TypingIndicator } from "../components/ChatNotices";
import { MessageList, type MessageListHandle } from "../components/MessageList";
import { MessageRow, type RowActions } from "../components/MessageRow";
import { MentionProvider, useMentionInfo } from "../components/MentionContext";
import { encodeMentions, type MentionPerson } from "@/lib/chat/mentions";
import { receiptStateFrom, ticksForPage, type TickInfo } from "@/lib/chat/receipts";
import { ThreadPanel } from "../components/ThreadPanel";
import { MessageInfoDialog } from "../components/MessageInfoDialog";
import { AtSign } from "lucide-react";
import { extrasApi, type Timeline } from "@/lib/api/projectExtras.api";
import { useOffensiveConfirm, ModerationWarningPopup } from "../components/ModerationUI";
import { checkMessage, recordPrevented, loadLexicon } from "@/lib/moderation/lexicon";
import { hasModule, orgHasModule } from "@/lib/modules";
import { EditCancelledError, type ModerationFlag } from "@/lib/crypto/conversationKeys";
import { Conversation, Message } from "@/types/chat";
import { toast } from "sonner";

const NO_MESSAGES: Message[] = [];
const messageKey = (m: Message) => m._id;

// Conversations fully loaded by this page during this visit. Reopening one shows the
// cached (already decrypted) messages at once and refreshes quietly in the background.
const loadedThisSession = new Set<string>();
const convCache = new Map<string, Conversation>();

/** Reuse an earlier decryption when the server copy hasn't changed (same ciphertext). */
function reuseDecrypted(server: Message, cached?: Message): Message | null {
  if (!cached || cached.decryptionFailed || cached.decryptedContent === undefined) return null;
  if (cached.ciphertext !== server.ciphertext || cached.iv !== server.iv || cached.isDeleted !== server.isDeleted) return null;
  return {
    ...server, // fresh reactions, read state, edit flags …
    decryptedContent: cached.decryptedContent,
    cryptoKey: cached.cryptoKey,
    frankingKey: cached.frankingKey,
    frankVerified: cached.frankVerified
  };
}

export default function ConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  // Narrow subscriptions: only this conversation's messages/typing, not the whole store
  const convMessages = useChatStore((s) => s.messages[conversationId]) ?? NO_MESSAGES;
  const typing = useChatStore((s) => s.typingUsers[conversationId]);
  const setMessages = useChatStore((s) => s.setMessages);
  const prependMessages = useChatStore((s) => s.prependMessages);
  const replaceWindow = useChatStore((s) => s.replaceWindow);
  const appendPage = useChatStore((s) => s.appendPage);
  const updateMessage = useChatStore((s) => s.updateMessage);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const markConversationRead = useChatStore((s) => s.markConversationRead);

  const [conv, setConv] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  // Also in a ref: search loads several older pages in a row, faster than re-renders
  const nextCursorRef = useRef<string | null>(null);
  const setCursor = useCallback((c: string | null) => {
    nextCursorRef.current = c;
    setNextCursor(c);
  }, []);
  // After a jump into older history: newer messages to load below
  const [hasNewer, setHasNewer] = useState(false);
  const newerCursorRef = useRef<string | null>(null);
  const [loadingNewer, setLoadingNewer] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [pendingJump, setPendingJump] = useState<string | null>(null);
  const [pins, setPins] = useState<PinnedItem[]>([]);
  const [canPin, setCanPin] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null);
  const scheduledRef = useRef<ScheduledListHandle>(null);
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
  /** First unread message's id for this viewing session — renders the "New messages" divider and is the initial scroll target. */
  const [unreadMarkerId, setUnreadMarkerId] = useState<string | null>(null);

  const listRef = useRef<MessageListHandle>(null);
  const mentionInfo = useMentionInfo(conv, user);
  const [openThread, setOpenThread] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<Message | null>(null);

  useJoinConversation(conversationId);
  const sendTyping = useSendTyping(conversationId);

  const typingNames = useMemo(() => (typing ? Array.from(typing) : []), [typing]);

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
    async (msgs: Message[], c: ConversationCrypto | null, cached: Message[] = []): Promise<Message[]> => {
      if (!c) return msgs;
      const byId = new Map(cached.map((m) => [m._id, m]));
      return Promise.all(msgs.map((m) => reuseDecrypted(m, byId.get(m._id)) ?? c.decrypt(m)));
    },
    []
  );

  // ── Load conversation + messages ────────────────────────────────────────────
  useEffect(() => {
    // Wait for the authenticated user (on a hard refresh /auth/me is still in flight),
    // otherwise the keys would be derived for nobody and never retried.
    if (!conversationId || !user) return;
    setActiveConversation(conversationId);
    setReplyTo(null);
    setShowFileUpload(false);
    setUnreadMarkerId(null);
    setMentionQueue([]);
    setOpenThread(null);
    setInfoMessage(null);
    setShowSearch(false);
    setShowFiles(false);
    useMessageMenu.getState().close();
    setForwardMsg(null);
    setHasNewer(false);
    newerCursorRef.current = null;
    setPins([]);
    setHighlightId(null);

    // Reopening a chat seen earlier in this visit: show what we have immediately
    const cached = useChatStore.getState().messages[conversationId] || [];
    const cachedConv = convCache.get(conversationId);
    const quick = loadedThisSession.has(conversationId) && cached.length > 0 && Boolean(cachedConv);
    if (quick) {
      setConv(cachedConv!);
      setLoading(false);
    }

    (async () => {
      if (!quick) setLoading(true);
      try {
        const [convData, msgData] = await Promise.all([fetchConversation(conversationId), fetchMessages(conversationId)]);
        setConv(convData);
        convCache.set(conversationId, convData);
        // Others' delivered / read times for the ticks (customers: the team's only)
        useChatStore
          .getState()
          .initReceipts(conversationId, receiptStateFrom(convData, user._id, user.role === "customer" && Boolean(convData.project)));

        const c = await buildCrypto(convData);
        setConvCrypto(c);
        setSendKey(c ? await c.sendKey() : null);

        // Only new or changed messages are decrypted again
        const decrypted = await decryptAll(msgData.messages, c, useChatStore.getState().messages[conversationId] || []);
        setMessages(conversationId, decrypted);
        loadedThisSession.add(conversationId);
        setHasMore(msgData.hasMore);
        setCursor(msgData.nextCursor);
        setUnreadMarkerId(msgData.unreadMarkerId);
        // Unread messages that ping me, oldest first (before opening marks them read)
        const firstUnread = msgData.unreadMarkerId ? decrypted.findIndex((m) => m._id === msgData.unreadMarkerId) : -1;
        setMentionQueue(
          firstUnread < 0
            ? []
            : decrypted
                .slice(firstUnread)
                .filter((m) => m.sender._id !== user._id && (m.mentionsAll || m.mentions?.includes(user._id)))
                .map((m) => m._id)
        );

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
        // Team notes (internalFor) work the same way when someone leaves the project team
        const mine = convData.members.find((m) => m.user._id === user._id);
        if (c && (convData.project || convData.internalFor) && convData.rekeyRequested && mine?.role === "admin" && user.role !== "customer") {
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

  // ── First unread message: start the reading there instead of the bottom ─────
  useEffect(() => {
    if (unreadMarkerId) listRef.current?.scrollToKey(unreadMarkerId);
  }, [unreadMarkerId]);

  // ── Older messages (the list asks when the reader nears the top) ───────────
  const loadingMoreRef = useRef(false);
  const loadMore = useCallback(async () => {
    const cursor = nextCursorRef.current;
    if (loadingMoreRef.current || !cursor) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const data = await fetchMessages(conversationId, cursor);
      const decrypted = await decryptAll(data.messages, convCrypto);
      prependMessages(conversationId, decrypted);
      setHasMore(data.hasMore);
      setCursor(data.nextCursor);
    } catch {
      toast.error("Couldn't load earlier messages");
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [conversationId, convCrypto, decryptAll, prependMessages, setCursor]);

  // ── Jump to a message (search, pins, stars, older mentions) ────────────────
  const flash = useCallback((id: string) => {
    setHighlightId(id);
    setTimeout(() => setHighlightId((h) => (h === id ? null : h)), 2500);
  }, []);

  const jumpTo = useCallback(
    async (id: string) => {
      const list = useChatStore.getState().messages[conversationId] || [];
      if (findIndexById(list, id) >= 0) {
        listRef.current?.scrollToKey(id, "center");
        flash(id);
        return;
      }
      try {
        // Not loaded: fetch a window around it, replacing what's shown
        const data = await fetchMessagesAround(conversationId, id);
        if (data.threadRoot) {
          setShowSearch(false);
          setShowGroupInfo(false);
          setOpenThread(data.threadRoot);
          return;
        }
        replaceWindow(conversationId, await decryptAll(data.messages, convCrypto));
        setHasMore(data.hasMore);
        setCursor(data.nextCursor);
        setHasNewer(data.hasNewer);
        newerCursorRef.current = data.newerCursor;
        setUnreadMarkerId(null);
        setPendingJump(id);
      } catch {
        toast.error("That message isn't available any more");
      }
    },
    [conversationId, convCrypto, decryptAll, flash, setCursor]
  );

  // Scroll once the jumped-to window is rendered
  useEffect(() => {
    if (pendingJump && listRef.current?.scrollToKey(pendingJump, "center")) {
      flash(pendingJump);
      setPendingJump(null);
    }
  }, [pendingJump, convMessages, flash]);

  // Scrolling down after a jump: the next newer page
  const loadingNewerRef = useRef(false);
  const loadNewer = useCallback(async () => {
    const cursor = newerCursorRef.current;
    if (loadingNewerRef.current || !cursor) return;
    loadingNewerRef.current = true;
    setLoadingNewer(true);
    try {
      const data = await fetchMessagesAfter(conversationId, cursor);
      appendPage(conversationId, await decryptAll(data.messages, convCrypto));
      setHasNewer(data.hasNewer);
      newerCursorRef.current = data.newerCursor;
    } catch {
      toast.error("Couldn't load newer messages");
    } finally {
      loadingNewerRef.current = false;
      setLoadingNewer(false);
    }
  }, [conversationId, convCrypto, decryptAll]);

  /** Back to the newest messages after a jump. */
  const jumpToLatest = useCallback(async () => {
    try {
      const data = await fetchMessages(conversationId);
      setMessages(conversationId, await decryptAll(data.messages, convCrypto));
      setHasMore(data.hasMore);
      setCursor(data.nextCursor);
      setHasNewer(false);
      newerCursorRef.current = null;
      listRef.current?.scrollToBottom();
    } catch {
      toast.error("Couldn't load the latest messages");
    }
  }, [conversationId, convCrypto, decryptAll, setMessages, setCursor]);

  // Opened from a link to one message (e.g. Starred): jump there once loaded
  const searchParams = useSearchParams();
  const linkedMessage = searchParams.get("m");
  useEffect(() => {
    if (!linkedMessage || loading || !/^[a-f0-9]{24}$/i.test(linkedMessage)) return;
    jumpTo(linkedMessage);
    router.replace(`/chat/${conversationId}`, { scroll: false });
  }, [linkedMessage, loading, jumpTo, router, conversationId]);

  // ── Pins (decrypted here), refreshed when anyone pins or unpins ─────────────
  const loadPins = useCallback(async () => {
    try {
      const data = await fetchPins(conversationId);
      const opened = await decryptAll(data.pins.map((p) => p.message), convCrypto);
      setPins(data.pins.map((p, i) => ({ ...p, message: opened[i] })));
      setCanPin(data.canPin);
    } catch {
      /* pins are an extra: the chat works without them */
    }
  }, [conversationId, convCrypto, decryptAll]);
  useEffect(() => {
    if (loading) return;
    loadPins();
    const socket = getSocket();
    const onPins = ({ conversationId: id }: { conversationId: string }) => id === conversationId && loadPins();
    socket.on("chat:pins:updated", onPins);
    return () => {
      socket.off("chat:pins:updated", onPins);
    };
  }, [loading, loadPins, conversationId]);
  const pinnedIds = useMemo(() => new Set(pins.map((p) => p.message._id)), [pins]);

  const togglePin = useCallback(
    async (msg: Message, pinned: boolean) => {
      try {
        await (pinned ? unpinMessage(conversationId, msg._id) : pinMessage(conversationId, msg._id));
        loadPins();
      } catch (err) {
        toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Couldn't change the pin");
      }
    },
    [conversationId, loadPins]
  );

  const toggleStar = useCallback(
    async (msg: Message) => {
      const next = !msg.starred;
      useChatStore.getState().patchMessage(conversationId, msg._id, { starred: next }); // optimistic
      try {
        await (next ? starMessage(msg._id) : unstarMessage(msg._id));
      } catch {
        useChatStore.getState().patchMessage(conversationId, msg._id, { starred: !next });
        toast.error("Couldn't save the star");
      }
    },
    [conversationId]
  );

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
    if (isProjectChat && hasModule(useAuthStore.getState().user, "moderation")) loadLexicon(); // warm the word list so the first send isn't delayed
  }, [isProjectChat]);

  // ── Send message ────────────────────────────────────────────────────────────
  // The message shows at once and goes through the outbox (lib/chat/chatOutbox.ts):
  // queued per chat, retried after network trouble, never sent twice. Encryption
  // is chained so messages enter the queue in the order they were typed.
  const encryptChainRef = useRef<Promise<void>>(Promise.resolve());
  const handleSend = useCallback(
    async (
      text: string,
      picked: MentionPerson[] = [],
      thread?: { threadRoot: string; alsoInChat: boolean }
    ): Promise<boolean | void> => {
      if (!text.trim() || !sendKey || !user) return;
      // Reading older history after a jump: go back to the newest messages first
      if (hasNewer && (!thread || thread.alsoInChat)) await jumpToLatest();
      const typed = text.trim();
      // The chat's "replying to" bar belongs to the chat's composer, not a thread's
      const currentReplyTo = thread ? null : replyTo;
      // "@Asha Rao" → <@id> inside the encrypted text; the ids also go alongside (CH-D1)
      const { text: plaintext, mentions, mentionsAll } = encodeMentions(typed, picked, mentionInfo.canMentionAll);

      // Project chats: on-device abuse check before anything is encrypted or sent
      let moderation: ModerationFlag | undefined;
      if (conv?.project) {
        const scan = await checkMessage(typed);
        if (scan.hitCount > 0 && scan.severity) {
          if (!(await confirmOffensive(scan))) {
            recordPrevented();
            return false; // keep the text in the box
          }
          moderation = { flagged: true, severity: scan.severity, hitCount: Math.min(scan.hitCount, 20) };
        }
      }

      const clientMsgId = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      if (!thread) setReplyTo(null);

      const step = encryptChainRef.current.catch(() => {}).then(async () => {
        const { ciphertext, iv, keyRef, franking, frankingKey } = await encryptTextWith(sendKey, plaintext);
        queueMessage({
          conversationId,
          body: {
            ciphertext,
            iv,
            type: "text",
            replyTo: currentReplyTo?._id,
            keyRef,
            franking,
            moderation,
            clientMsgId,
            ...(mentions.length ? { mentions } : {}),
            ...(mentionsAll ? { mentionsAll } : {}),
            ...(thread ? { threadRoot: thread.threadRoot, ...(thread.alsoInChat ? { alsoInChat: true } : {}) } : {})
          },
          local: {
            _id: localIdFor(clientMsgId),
            clientMsgId,
            conversation: conversationId,
            sender: user,
            type: "text",
            ciphertext,
            iv,
            keyRef,
            franking,
            decryptedContent: plaintext,
            cryptoKey: sendKey.key,
            frankingKey,
            frankVerified: true,
            attachments: [],
            reactions: [],
            replyTo: currentReplyTo,
            mentions,
            mentionsAll,
            threadRoot: thread?.threadRoot ?? null,
            alsoInChat: thread?.alsoInChat || undefined,
            isEdited: false,
            isDeleted: false,
            createdAt,
            updatedAt: createdAt,
            localStatus: "sending"
          }
        });
      });
      encryptChainRef.current = step;
      try {
        await step;
        if (!thread || thread.alsoInChat) listRef.current?.scrollToBottom();
      } catch {
        if (!thread) setReplyTo(currentReplyTo);
        toast.error("Couldn't encrypt this message");
        return false; // keep the text in the box
      }
    },
    [sendKey, conversationId, user, replyTo, conv, confirmOffensive, mentionInfo, hasNewer, jumpToLatest]
  );

  // ── @ picker ranking: who spoke most recently (last 200 messages, one pass) ─
  const recencyRank = useMemo(() => {
    const rank = new Map<string, number>();
    const from = Math.max(0, convMessages.length - 200);
    for (let i = from; i < convMessages.length; i++) rank.set(convMessages[i].sender._id, i + 1);
    return rank;
  }, [convMessages]);
  const mentionRecency = useCallback((id: string) => recencyRank.get(id) ?? 0, [recencyRank]);

  // ── Unread messages that mention me: the "@" chip jumps through them ────────
  const [mentionQueue, setMentionQueue] = useState<string[]>([]);
  const jumpToNextMention = useCallback(() => {
    setMentionQueue((q) => {
      const [next, ...rest] = q;
      if (next) listRef.current?.scrollToKey(next, "center");
      return rest;
    });
  }, []);

  // ── Voice notes (P4): recorded here, encrypted like any file, then uploaded ──
  const handleVoiceNote = useCallback(
    async (blob: Blob, durationSec: number, mimeType: string, thread?: { threadRoot: string; alsoInChat: boolean }) => {
      if (!sendKey) return;
      if (hasNewer && (!thread || thread.alsoInChat)) await jumpToLatest();
      try {
        const ext = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";
        const saved = await sendEncryptedFile({
          conversationId,
          sendKey,
          data: blob,
          name: `Voice note ${new Date().toLocaleString()}.${ext}`,
          mimeType,
          fileType: "audio",
          durationSec,
          threadRoot: thread?.threadRoot,
          alsoInChat: thread?.alsoInChat
        });
        // Show it now (the live echo is a no-op once it's here); attach the key for playback
        useChatStore.getState().appendMessage(conversationId, { ...saved, cryptoKey: sendKey.key });
        if (!thread || thread.alsoInChat) listRef.current?.scrollToBottom();
      } catch (err) {
        toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Couldn't send the voice note");
      }
    },
    [sendKey, conversationId, hasNewer, jumpToLatest]
  );

  // ── Scheduled send (P4): encrypted now, posted by the server at that time ───
  const handleSchedule = useCallback(
    async (text: string, picked: MentionPerson[], sendAt: Date, thread?: { threadRoot: string; alsoInChat: boolean }): Promise<boolean | void> => {
      if (!text.trim() || !sendKey || !user) return false;
      const typed = text.trim();
      const { text: plaintext, mentions, mentionsAll } = encodeMentions(typed, picked, mentionInfo.canMentionAll);
      let moderation: ModerationFlag | undefined;
      if (conv?.project) {
        const scan = await checkMessage(typed);
        if (scan.hitCount > 0 && scan.severity) {
          if (!(await confirmOffensive(scan))) {
            recordPrevented();
            return false;
          }
          moderation = { flagged: true, severity: scan.severity, hitCount: Math.min(scan.hitCount, 20) };
        }
      }
      try {
        const { ciphertext, iv, keyRef, franking } = await encryptTextWith(sendKey, plaintext);
        await scheduleMessage(conversationId, {
          ciphertext,
          iv,
          type: "text",
          keyRef,
          franking,
          moderation,
          ...(mentions.length ? { mentions } : {}),
          ...(mentionsAll ? { mentionsAll } : {}),
          ...(thread ? { threadRoot: thread.threadRoot, ...(thread.alsoInChat ? { alsoInChat: true } : {}) } : {}),
          sendAt: sendAt.toISOString()
        });
        toast.success(`Scheduled for ${sendAt.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}`);
        scheduledRef.current?.refresh();
      } catch (err) {
        toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Couldn't schedule the message");
        return false;
      }
    },
    [sendKey, user, mentionInfo, conv, confirmOffensive, conversationId]
  );

  // ── Team notes (P4): the project team's private chat, its own key ──────────
  const openNotes = useCallback(async () => {
    if (!conv?.project || !user) return;
    try {
      if (conv.internalNotes) return router.push(`/chat/${conv.internalNotes}`);
      // Start it: a new group key wrapped for the project's staff only (never a customer)
      const customers = new Set((conv.project.customers || []).map((c) => refOf(c)));
      const staff = conv.members
        .filter((m) => m.user && !customers.has(m.user._id))
        .map((m) => ({ _id: m.user._id, publicKey: m.user.publicKey, keyVersion: m.user.keyVersion }));
      const { keys } = await createInitialGroupKeys(user._id, staff);
      const res = await openTeamNotes(conv._id, keys);
      router.push(`/chat/${res.conversationId}`);
    } catch (err) {
      toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Couldn't open team notes");
    }
  }, [conv, user, router]);

  // ── Edit message ────────────────────────────────────────────────────────────
  const handleEdit = useCallback(
    async (msgId: string, encrypted: EncryptedText) => {
      const { ciphertext, iv, keyRef, franking, moderation } = encrypted;
      await editMessage(msgId, ciphertext, iv, keyRef, franking, moderation);
      // Optimistically update store with decrypted content
      const msgs = useChatStore.getState().messages[conversationId] || [];
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
    [conversationId, sendKey, updateMessage]
  );

  // ── Delete message ──────────────────────────────────────────────────────────
  const handleDelete = useCallback(
    async (msgId: string, scope: "me" | "everyone") => {
      const msgs = useChatStore.getState().messages[conversationId] || [];
      const original = msgs.find((m) => m._id === msgId);
      if (!original) return;

      // Optimistic: update immediately instead of waiting on the socket round-trip
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
        // Surface the real reason when we have one (e.g. the 10-minute window has passed)
        toast.error(err?.response?.data?.message || "Failed to delete message");
      }
    },
    [conversationId, updateMessage]
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

  // Latest handlers behind a ref, so the memoized rows get callbacks that never change
  const actionsRef = useRef<RowActions>(null!);
  actionsRef.current = {
    react: (id, emoji) => reactToMessage(id, emoji),
    del: handleDelete,
    reply: setReplyTo,
    edit: handleEdit,
    requestApproval: setApprovalTarget,
    putApproval,
    retry: (msg) => msg.clientMsgId && retryMessage(msg.clientMsgId),
    discard: (msg) => msg.clientMsgId && discardMessage(conversationId, msg.clientMsgId),
    openThread: (msg) => {
      setShowGroupInfo(false);
      setShowSearch(false);
      setOpenThread(msg._id);
    },
    info: setInfoMessage,
    togglePin,
    toggleStar,
    forward: setForwardMsg
  };
  const rowActions = useMemo<RowActions>(
    () => ({
      react: (id, emoji) => actionsRef.current.react(id, emoji),
      del: (id, scope) => actionsRef.current.del(id, scope),
      reply: (msg) => actionsRef.current.reply(msg),
      edit: (id, enc) => actionsRef.current.edit(id, enc),
      requestApproval: (msg) => actionsRef.current.requestApproval(msg),
      putApproval: (a) => actionsRef.current.putApproval(a),
      retry: (msg) => actionsRef.current.retry(msg),
      discard: (msg) => actionsRef.current.discard(msg),
      openThread: (msg) => actionsRef.current.openThread(msg),
      info: (msg) => actionsRef.current.info(msg),
      togglePin: (msg, pinned) => actionsRef.current.togglePin(msg, pinned),
      toggleStar: (msg) => actionsRef.current.toggleStar(msg),
      forward: (msg) => actionsRef.current.forward(msg)
    }),
    []
  );

  // ── Ticks for my messages: one pass over the page (lib/chat/receipts.ts) ────
  const receipts = useChatStore((s) => s.receipts[conversationId]);
  const ticks = useMemo(() => {
    if (!receipts || !user) return [] as ReturnType<typeof ticksForPage>;
    return ticksForPage(
      convMessages.map((m) => new Date(m.createdAt).getTime()),
      convMessages.map((m) => m.sender._id === user._id && !m.localStatus && m.type !== "system"),
      receipts
    );
  }, [convMessages, receipts, user]);
  const isGroup = conv?.type === "group";
  const tickTitle = (t: TickInfo) => {
    if (receipts?.team) return t.tick === "read" ? "Seen by the team" : t.tick === "delivered" ? "Delivered" : "Sent";
    if (!isGroup) return t.tick === "read" ? "Seen" : t.tick === "delivered" ? "Delivered" : "Sent";
    return t.tick === "read" ? "Seen by everyone" : `Seen by ${t.readBy} of ${t.of}`;
  };

  /** One message row; `list` gives the previous message (chat or thread). */
  const renderAnyRow = useCallback(
    (msg: Message, idx: number, list: readonly Message[], inThread: boolean, tick?: TickInfo | null) => {
      const approval = approvalFor(msg._id);
      const mine = msg.sender._id === user?._id;
      return (
        <MessageRow
          msg={msg}
          prevMessage={list[idx - 1]}
          isMine={mine}
          showUnreadMarker={!inThread && msg._id === unreadMarkerId}
          encryptFn={encryptFn}
          actions={rowActions}
          approval={approval}
          canRequestApproval={
            Boolean(conv?.project) && !isCustomer && ["image", "file"].includes(msg.type) && !msg.isDeleted &&
            (!approval || approval.status === "withdrawn")
          }
          canDecide={isCustomer}
          canWithdraw={Boolean(approval) && !isCustomer && (approval!.requestedBy?._id === user?._id || isTeamLead)}
          tick={tick?.tick}
          tickTitle={tick ? tickTitle(tick) : undefined}
          seenBy={tick && isGroup && !receipts?.team && tick.readBy > 0 ? tick.readBy : undefined}
          // Names of who saw it: staff only, in groups (CH-D3)
          canInfo={mine && isGroup && !isCustomer && !receipts?.team}
          inThread={inThread}
          pinned={pinnedIds.has(msg._id)}
          canPin={canPin}
          highlighted={highlightId === msg._id}
          canForward={!isCustomer}
        />
      );
    },
    // tickTitle reads receipts/isGroup, listed below
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [approvalFor, user?._id, unreadMarkerId, encryptFn, rowActions, conv?.project, isCustomer, isTeamLead, isGroup, receipts, pinnedIds, canPin, highlightId]
  );
  const renderRow = useCallback(
    (msg: Message, idx: number) => renderAnyRow(msg, idx, convMessages, false, ticks[idx]),
    [renderAnyRow, convMessages, ticks]
  );
  const decryptForThread = useCallback((msgs: Message[]) => decryptAll(msgs, convCrypto), [decryptAll, convCrypto]);

  const otherMember = conv?.members.find((m) => m.user._id !== user?._id);
  const myMember = conv?.members.find((m) => m.user._id === user?._id);
  const waitingForOther = conv?.type === "dm" && !otherMember?.user.publicKey;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-950">
        <div className="animate-spin h-6 w-6 rounded-full border-2 border-violet-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <MentionProvider value={mentionInfo}>
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

      {showKeySetup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md">
            <KeySetupWizard onClose={() => setShowKeySetup(false)} />
          </div>
        </div>
      )}

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
        <ChatHeader
          conv={conv}
          user={user}
          showGroupInfo={showGroupInfo}
          onBack={() => router.push("/chat")}
          onToggleGroupInfo={() => {
            setOpenThread(null); // one side panel at a time
            setShowSearch(false);
            setShowGroupInfo((v) => !v);
          }}
          onOpenSearch={() => {
            setOpenThread(null);
            setShowGroupInfo(false);
            setShowFiles(false);
            setShowSearch((v) => !v);
          }}
          onOpenFiles={() => {
            setOpenThread(null);
            setShowGroupInfo(false);
            setShowSearch(false);
            setShowFiles((v) => !v);
          }}
          onOpenTeamNotes={conv?.project && !isCustomer ? openNotes : undefined}
          onOpenSafetyNumbers={() => setShowSafetyNumbers(true)}
          onOpenKeySetup={() => setShowKeySetup(true)}
        />

        {/* Ratings belong to the reports module: no prompt (and no refused request) without it */}
        {conv?.project && user?.role === "customer" && orgHasModule(user, "reports") && <RatingPrompt conversationId={conv._id} />}

        {!sendKey && !keysLocked && <NoKeyBanner waitingFor={waitingForOther ? otherMember?.user.name || "" : null} />}

        {/* Customers: when the team usually replies, and whether they're in now */}
        {conv?.project && isCustomer && <ServiceBanner conversationId={conversationId} />}

        {/* Team notes: a reminder of who can read this */}
        {conv?.internalFor && (
          <div className="px-3 sm:px-4 py-1.5 border-b border-amber-500/20 bg-amber-500/10 flex items-center gap-2 text-[11px] text-amber-200 shrink-0" role="note">
            <NotebookPen className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="flex-1 truncate">Team notes · only the project team can read this. Customers never see it.</span>
            <button onClick={() => router.push(`/chat/${conv.internalFor}`)} className="font-semibold hover:underline shrink-0">
              Back to the project chat
            </button>
          </div>
        )}

        <PinnedBar pins={pins} canPin={canPin} onJump={jumpTo} onUnpin={(id) => togglePin({ _id: id } as Message, true)} />

        <div className="relative flex-1 min-h-0 flex flex-col">
          <MessageList
            key={conversationId}
            ref={listRef}
            listId={conversationId}
            items={convMessages}
            getKey={messageKey}
            renderRow={renderRow}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onReachTop={loadMore}
            hasNewer={hasNewer}
            loadingNewer={loadingNewer}
            onReachBottom={loadNewer}
            footer={hasNewer ? undefined : <TypingIndicator names={typingNames} />}
          />
          {hasNewer && (
            <button
              onClick={jumpToLatest}
              className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 h-9 px-4 rounded-full bg-violet-600 text-white text-xs font-semibold shadow-lg hover:bg-violet-500 transition"
            >
              <ArrowDown className="h-3.5 w-3.5" aria-hidden />
              Jump to latest
            </button>
          )}
          {mentionQueue.length > 0 && (
            <button
              onClick={jumpToNextMention}
              className="absolute bottom-3 right-4 z-20 flex items-center gap-1 h-9 px-3 rounded-full bg-amber-500 text-slate-950 text-xs font-bold shadow-lg shadow-amber-500/20 hover:bg-amber-400 transition"
              aria-label={`Jump to the next of ${mentionQueue.length} messages that mention you`}
            >
              <AtSign className="h-3.5 w-3.5" aria-hidden />
              {mentionQueue.length}
            </button>
          )}
        </div>

        {showFileUpload && (
          <FileUploadPreview
            conversationId={conversationId}
            sendKey={sendKey}
            onUploaded={() => setShowFileUpload(false)}
            onCancel={() => setShowFileUpload(false)}
          />
        )}

        {user && !isCustomer && <ScheduledList ref={scheduledRef} conversationId={conversationId} crypto={convCrypto} me={user} />}

        <MessageInput
          onSend={handleSend}
          mentionRecency={mentionRecency}
          draftKey={conversationId}
          onVoiceNote={(blob, sec, mime) => handleVoiceNote(blob, sec, mime)}
          onSchedule={isCustomer ? undefined : (text, picked, at) => handleSchedule(text, picked, at)}
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
              : waitingForOther
              ? `Waiting for ${otherMember?.user.name || "user"} to open Chat…`
              : "Waiting for access to this chat…"
          }
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
        />
      </div>

      {infoMessage && receipts && (
        <MessageInfoDialog message={infoMessage} receipts={receipts} onClose={() => setInfoMessage(null)} />
      )}

      {forwardMsg && <ForwardDialog message={forwardMsg} onClose={() => setForwardMsg(null)} />}

      {/* The one message-options menu for this screen (opened from any bubble's ⌄ button) */}
      <MessageMenu />

      {/* Shared files (drawer on mobile/tablet, side panel on desktop) */}
      {showFiles && (
        <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden" onClick={() => setShowFiles(false)} />
          <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-96 shadow-2xl lg:static lg:z-auto lg:shadow-none shrink-0 h-full flex flex-col">
            <FilesPanel conversationId={conversationId} crypto={convCrypto} onJump={jumpTo} onClose={() => setShowFiles(false)} />
          </div>
        </>
      )}

      {/* Search this chat (drawer on mobile/tablet, side panel on desktop) */}
      {showSearch && user && (
        <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden" onClick={() => setShowSearch(false)} />
          <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-96 shadow-2xl lg:static lg:z-auto lg:shadow-none shrink-0 h-full flex flex-col">
            <SearchPanel
              messages={convMessages}
              myId={user._id}
              members={(conv?.members || []).filter((m) => m.user).map((m) => ({ id: m.user._id, name: m.user.name }))}
              hasMore={hasMore}
              loadOlder={loadMore}
              onPick={jumpTo}
              onClose={() => setShowSearch(false)}
            />
          </div>
        </>
      )}

      {/* Thread (drawer on mobile/tablet, side panel on desktop) */}
      {openThread && (
        <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden" onClick={() => setOpenThread(null)} />
          <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-96 shadow-2xl lg:static lg:z-auto lg:shadow-none shrink-0 h-full flex flex-col">
            <ThreadPanel
              key={openThread}
              conversationId={conversationId}
              rootId={openThread}
              onClose={() => setOpenThread(null)}
              decrypt={decryptForThread}
              onSend={handleSend}
              onVoiceNote={handleVoiceNote}
              onSchedule={isCustomer ? undefined : handleSchedule}
              renderRow={renderAnyRow}
              disabled={!sendKey}
            />
          </div>
        </>
      )}

      {/* Group info panel (drawer on mobile/tablet, side panel on desktop) */}
      {showGroupInfo && conv?.type === "group" && (
        <>
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden animate-in fade-in duration-200"
            onClick={() => setShowGroupInfo(false)}
          />
          <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-80 shadow-2xl lg:static lg:w-80 lg:z-auto lg:shadow-none shrink-0 h-full flex flex-col animate-in slide-in-from-right duration-200">
            <GroupInfoPanel conversation={conv} onClose={() => setShowGroupInfo(false)} onConversationUpdated={setConv} />
          </div>
        </>
      )}
    </div>
    </MentionProvider>
  );
}
