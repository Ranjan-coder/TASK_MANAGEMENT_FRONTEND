"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useChatStore } from "@/store/chatStore";
import { useAuthStore } from "@/store/authStore";
import { Conversation } from "@/types/chat";
import { cn } from "@/lib/utils";
import { formatDistanceToNowStrict } from "date-fns";
import { Search, Plus, Users, MessageSquare, MessageSquarePlus, Lock, Key, ShieldCheck } from "lucide-react";
import { GroupCreateModal } from "./GroupCreateModal";
import { DirectMessageModal } from "./DirectMessageModal";

interface ChatSidebarProps {
  className?: string;
  needsKeySetup?: boolean;
  onOpenKeySetup?: () => void;
}

export function ChatSidebar({ className, needsKeySetup, onOpenKeySetup }: ChatSidebarProps) {
  const router = useRouter();
  const { user } = useAuthStore();
  const { conversations, activeConversationId, setActiveConversation, onlineUsers, totalUnread } =
    useChatStore();
  const [search, setSearch] = useState("");
  const [showDMModal, setShowDMModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);

  const filtered = conversations.filter((c) => {
    const label = getConvLabel(c, user?._id || "");
    return label.toLowerCase().includes(search.toLowerCase());
  });

  const handleSelect = (conv: Conversation) => {
    setActiveConversation(conv._id);
    router.push(`/chat/${conv._id}`);
  };

  return (
    <>
      <aside
        className={cn(
          "w-full md:w-80 shrink-0 flex flex-col border-r border-slate-800 bg-slate-900 h-full",
          className
        )}
      >
        {/* Header */}
        <div className="px-4 pt-5 pb-3 border-b border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-violet-400" />
              <span className="font-bold text-white text-sm tracking-tight">Messages</span>
              {totalUnread > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-violet-600 text-white min-w-[18px] text-center">
                  {totalUnread > 99 ? "99+" : totalUnread}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={onOpenKeySetup}
                title="Manage Encryption Keys"
                className="h-7 w-7 rounded-lg bg-slate-800 hover:bg-violet-600/20 border border-slate-700 hover:border-violet-500/40 flex items-center justify-center transition text-slate-400 hover:text-violet-400"
              >
                <Key className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setShowDMModal(true)}
                title="New direct message"
                className="h-7 w-7 rounded-lg bg-slate-800 hover:bg-violet-600/20 border border-slate-700 hover:border-violet-500/40 flex items-center justify-center transition text-slate-400 hover:text-violet-400"
              >
                <MessageSquarePlus className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setShowGroupModal(true)}
                title="New group"
                className="h-7 w-7 rounded-lg bg-slate-800 hover:bg-violet-600/20 border border-slate-700 hover:border-violet-500/40 flex items-center justify-center transition text-slate-400 hover:text-violet-400"
              >
                <Users className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations…"
              className="w-full pl-8 pr-3 py-2 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500/50 transition"
            />
          </div>
        </div>

        {/* Key setup banner (if keys missing) */}
        {needsKeySetup && (
          <div className="mx-3 mt-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between gap-2.5 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <Lock className="h-4 w-4 text-amber-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-amber-300 truncate">Keys required</p>
                <p className="text-[10px] text-amber-400/80 truncate">Set up E2E keys to chat</p>
              </div>
            </div>
            <button
              onClick={onOpenKeySetup}
              className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold transition shrink-0"
            >
              Setup
            </button>
          </div>
        )}

        {/* E2E status & Key Settings bar */}
        <div className="px-4 py-2 border-b border-slate-800/40 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] text-emerald-400 font-medium">End-to-end encrypted</span>
          </div>
          <button
            onClick={onOpenKeySetup}
            className="flex items-center gap-1 text-[10px] text-violet-400 hover:text-violet-300 font-medium transition group"
          >
            <Key className="h-2.5 w-2.5 group-hover:scale-110 transition-transform" />
            <span>Key Settings</span>
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
          {filtered.length === 0 ? (
            <div className="text-center py-12 px-4 space-y-3">
              <p className="text-slate-500 text-xs">
                {search ? "No conversations found" : "No conversations yet"}
              </p>
              {!search && (
                <button
                  onClick={() => setShowDMModal(true)}
                  className="px-3 py-1.5 rounded-xl bg-violet-600/15 hover:bg-violet-600/25 border border-violet-500/30 text-violet-300 hover:text-violet-200 text-xs font-medium transition inline-flex items-center gap-1.5"
                >
                  <MessageSquarePlus className="h-3.5 w-3.5" />
                  <span>Start a Chat</span>
                </button>
              )}
            </div>
          ) : (
            filtered.map((conv) => (
              <ConvItem
                key={conv._id}
                conv={conv}
                userId={user?._id || ""}
                isActive={activeConversationId === conv._id}
                onlineUsers={onlineUsers}
                onClick={() => handleSelect(conv)}
              />
            ))
          )}
        </div>
      </aside>

      {showDMModal && <DirectMessageModal onClose={() => setShowDMModal(false)} />}
      {showGroupModal && <GroupCreateModal onClose={() => setShowGroupModal(false)} />}
    </>
  );
}

// ── Helper: get display name for a conversation ─────────────────────────────

function getConvLabel(conv: Conversation, myId: string): string {
  if (conv.type === "group") return conv.name || "Unnamed Group";
  const other = conv.members.find((m) => m.user._id !== myId);
  return other?.user.name || "Unknown";
}

function getConvAvatar(conv: Conversation, myId: string) {
  if (conv.type === "group") return conv.avatarUrl || null;
  const other = conv.members.find((m) => m.user._id !== myId);
  return other?.user.avatarUrl || null;
}

function getOtherMemberId(conv: Conversation, myId: string): string | null {
  if (conv.type !== "dm") return null;
  return conv.members.find((m) => m.user._id !== myId)?.user._id || null;
}

// ── ConvItem component ───────────────────────────────────────────────────────

interface ConvItemProps {
  conv: Conversation;
  userId: string;
  isActive: boolean;
  onlineUsers: Set<string>;
  onClick: () => void;
}

function ConvItem({ conv, userId, isActive, onlineUsers, onClick }: ConvItemProps) {
  const label = getConvLabel(conv, userId);
  const avatarUrl = getConvAvatar(conv, userId);
  const otherId = getOtherMemberId(conv, userId);
  const isOnline = otherId ? onlineUsers.has(otherId) : false;
  const hasUnread = conv.unreadCount > 0;

  const preview = conv.lastMessage
    ? conv.lastMessage.isDeleted
      ? "Message deleted"
      : conv.lastMessage.type === "system"
      ? conv.lastMessage.content || ""
      : "🔒 Encrypted message"
    : "No messages yet";

  const timeAgo = conv.lastActivityAt
    ? formatDistanceToNowStrict(new Date(conv.lastActivityAt), { addSuffix: false })
    : "";

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150",
        isActive
          ? "bg-violet-600/15 border border-violet-500/25"
          : "hover:bg-slate-800/70 border border-transparent"
      )}
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={label}
            className="h-10 w-10 rounded-xl object-cover border border-slate-700"
          />
        ) : (
          <div
            className={cn(
              "h-10 w-10 rounded-xl flex items-center justify-center font-bold text-sm border",
              conv.type === "group"
                ? "bg-gradient-to-br from-violet-600/30 to-blue-600/30 border-violet-500/30 text-violet-300"
                : "bg-gradient-to-br from-slate-700 to-slate-600 border-slate-600 text-slate-200"
            )}
          >
            {conv.type === "group" ? (
              <Users className="h-4 w-4" />
            ) : (
              label[0]?.toUpperCase() || "?"
            )}
          </div>
        )}
        {/* Online dot (DMs only) */}
        {conv.type === "dm" && (
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-slate-900",
              isOnline ? "bg-emerald-400" : "bg-slate-600"
            )}
          />
        )}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span
            className={cn(
              "text-sm truncate",
              hasUnread ? "font-semibold text-white" : "font-medium text-slate-300"
            )}
          >
            {label}
          </span>
          <span className="text-[10px] text-slate-500 shrink-0">{timeAgo}</span>
        </div>
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <span className="text-xs text-slate-500 truncate">{preview}</span>
          {hasUnread && (
            <span className="shrink-0 h-5 min-w-5 px-1 rounded-full bg-violet-600 text-white text-[10px] font-bold flex items-center justify-center">
              {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
