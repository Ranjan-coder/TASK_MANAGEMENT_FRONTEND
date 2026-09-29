"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useChatStore } from "@/store/chatStore";
import { useAuthStore } from "@/store/authStore";
import { fetchConversations } from "@/lib/api/chat.api";
import { useChat } from "@/hooks/useChat";
import { loadKeyring } from "@/lib/crypto/keyStore";
import { ChatSidebar } from "./components/ChatSidebar";
import { KeySetupWizard } from "./components/KeySetupWizard";
import { ChatUnlock } from "./components/ChatUnlock";
import { MessageSquare, Lock, Key, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const setConversations = useChatStore((s) => s.setConversations);
  // Keys are synced at sign-in; "locked" means this browser has no copy yet
  const [keysLocked, setKeysLocked] = useState(false);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [showKeySetupModal, setShowKeySetupModal] = useState(false);

  // Mount the global chat socket event listener once for the whole chat area
  useChat();

  useEffect(() => {
    fetchConversations().then(setConversations).catch(console.error);
  }, [setConversations]);

  useEffect(() => {
    if (!user) return;
    loadKeyring(user._id)
      .then((keys) => setKeysLocked(!keys && !user.mustChangePassword))
      .catch(() => setKeysLocked(true));
  }, [user]);

  const onUnlocked = () => {
    setKeysLocked(false);
    setShowUnlockModal(false);
    fetchConversations().then(setConversations).catch(console.error);
  };

  // Is a specific conversation open? (e.g. /chat/123 vs /chat)
  const isConversationActive = Boolean(pathname && pathname !== "/chat" && pathname.startsWith("/chat/"));

  return (
    <div className="flex h-full -m-6 md:-m-8 overflow-hidden bg-slate-950">
      {/* Sidebar: Full width on mobile when at /chat, hidden on mobile when in conversation */}
      <ChatSidebar
        className={isConversationActive ? "hidden md:flex" : "flex"}
        needsKeySetup={keysLocked}
        onOpenKeySetup={() => setShowUnlockModal(true)}
        onOpenKeySettings={() => setShowKeySetupModal(true)}
      />

      {/* Content area: Hidden on mobile when on /chat, full width on mobile when in conversation */}
      <div
        className={cn(
          "flex-1 flex flex-col min-w-0 overflow-hidden",
          !isConversationActive ? "hidden md:flex" : "flex"
        )}
      >
        {/* Unlock prompt when this browser has no copy of the chat keys */}
        {!isConversationActive && keysLocked && (
          <div className="flex-1 flex items-center justify-center bg-slate-950 p-6">
            <ChatUnlock onUnlocked={onUnlocked} />
          </div>
        )}

        {/* Empty state (no conversation selected, keys set up) */}
        {!isConversationActive && !keysLocked && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-slate-950 p-6 text-center">
            <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-violet-600/20 to-blue-600/20 border border-violet-500/20 flex items-center justify-center">
              <MessageSquare className="h-9 w-9 text-violet-400 opacity-60" />
            </div>
            <div>
              <p className="text-slate-300 font-semibold text-lg">Select a conversation</p>
              <p className="text-slate-500 text-sm mt-1 max-w-xs">
                Pick a DM or group from the sidebar to start chatting
              </p>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-600/10 border border-violet-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-emerald-400 font-medium">End-to-end encrypted</span>
            </div>

            {/* Key Management Card */}
            <div className="mt-2 p-4 rounded-2xl bg-slate-900/80 border border-slate-800 max-w-xs w-full space-y-2.5">
              <div className="flex items-center justify-center gap-2 text-slate-300 text-xs font-semibold">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                <span>Encryption active</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Your keys sync to every device you sign in on, protected by your password.
              </p>
              <button
                onClick={() => setShowKeySetupModal(true)}
                className="w-full py-2 px-3 rounded-xl bg-violet-600/15 hover:bg-violet-600/25 border border-violet-500/30 text-violet-300 hover:text-violet-200 text-xs font-semibold transition flex items-center justify-center gap-2"
              >
                <Key className="h-3.5 w-3.5" />
                <span>View safety fingerprint</span>
              </button>
            </div>
          </div>
        )}

        {/* Active conversation page */}
        {isConversationActive && children}
      </div>

      {showUnlockModal && keysLocked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <ChatUnlock onUnlocked={onUnlocked} />
        </div>
      )}

      {/* Global Key Setup Modal (triggers on mobile or from banner) */}
      {showKeySetupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md">
            <KeySetupWizard onClose={() => setShowKeySetupModal(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
