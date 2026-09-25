"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useChatStore } from "@/store/chatStore";
import { useAuthStore } from "@/store/authStore";
import { fetchConversations } from "@/lib/api/chat.api";
import { useChat } from "@/hooks/useChat";
import { ensureUserKeys } from "@/lib/crypto/keyStore";
import { ChatSidebar } from "./components/ChatSidebar";
import { KeySetupWizard } from "./components/KeySetupWizard";
import { MessageSquare, Lock, Key, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const { setConversations } = useChatStore();
  const [needsKeySetup, setNeedsKeySetup] = useState(false);
  const [keySetupDone, setKeySetupDone] = useState(false);
  const [showKeySetupModal, setShowKeySetupModal] = useState(false);

  // Mount the global chat socket event listener once for the whole chat area
  useChat();

  useEffect(() => {
    fetchConversations().then(setConversations).catch(console.error);
  }, [setConversations]);

  // Ensure user's encryption keys exist in IndexedDB and are published to MongoDB
  useEffect(() => {
    if (!user) return;
    ensureUserKeys(user._id)
      .then(() => {
        setNeedsKeySetup(false);
      })
      .catch((err) => {
        console.warn("Key initialization notice:", err);
        setNeedsKeySetup(true);
      });
  }, [user]);

  // Is a specific conversation open? (e.g. /chat/123 vs /chat)
  const isConversationActive = Boolean(pathname && pathname !== "/chat" && pathname.startsWith("/chat/"));

  return (
    <div className="flex h-full -m-6 md:-m-8 overflow-hidden bg-slate-950">
      {/* Sidebar: Full width on mobile when at /chat, hidden on mobile when in conversation */}
      <ChatSidebar
        className={isConversationActive ? "hidden md:flex" : "flex"}
        needsKeySetup={needsKeySetup && !keySetupDone}
        onOpenKeySetup={() => setShowKeySetupModal(true)}
      />

      {/* Content area: Hidden on mobile when on /chat, full width on mobile when in conversation */}
      <div
        className={cn(
          "flex-1 flex flex-col min-w-0 overflow-hidden",
          !isConversationActive ? "hidden md:flex" : "flex"
        )}
      >
        {/* One-time key setup prompt on desktop if no conversation selected */}
        {!isConversationActive && needsKeySetup && !keySetupDone && (
          <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 p-6 sm:p-8">
            <div className="w-full max-w-md space-y-4">
              <div className="text-center mb-6">
                <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-600/20 to-blue-600/20 border border-violet-500/20 flex items-center justify-center mx-auto mb-4">
                  <Lock className="h-7 w-7 text-violet-400" />
                </div>
                <h2 className="text-xl font-bold text-white">Welcome to Secure Chat</h2>
                <p className="text-slate-400 text-sm mt-1">
                  Set up your encryption keys to start chatting
                </p>
              </div>
              <KeySetupWizard
                onComplete={() => {
                  setNeedsKeySetup(false);
                  setKeySetupDone(true);
                }}
              />
            </div>
          </div>
        )}

        {/* Empty state (no conversation selected, keys set up) */}
        {!isConversationActive && (!needsKeySetup || keySetupDone) && (
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
                <span>ECDH P-256 Keys Active</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Your private encryption key is securely stored in this browser.
              </p>
              <button
                onClick={() => setShowKeySetupModal(true)}
                className="w-full py-2 px-3 rounded-xl bg-violet-600/15 hover:bg-violet-600/25 border border-violet-500/30 text-violet-300 hover:text-violet-200 text-xs font-semibold transition flex items-center justify-center gap-2"
              >
                <Key className="h-3.5 w-3.5" />
                <span>Manage Keys & Fingerprint</span>
              </button>
            </div>
          </div>
        )}

        {/* Active conversation page */}
        {isConversationActive && children}
      </div>

      {/* Global Key Setup Modal (triggers on mobile or from banner) */}
      {showKeySetupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md">
            <KeySetupWizard
              onComplete={() => {
                setNeedsKeySetup(false);
                setKeySetupDone(true);
                setShowKeySetupModal(false);
              }}
              onClose={() => setShowKeySetupModal(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
