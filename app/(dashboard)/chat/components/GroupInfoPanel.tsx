"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useChatStore } from "@/store/chatStore";
import { Conversation, ConversationMember } from "@/types/chat";
import {
  removeMember,
  updateConversation,
  addMember,
  fetchConversations,
  fetchPublicKey
} from "@/lib/api/chat.api";
import {
  deriveSessionKey,
  wrapGroupKey,
  unwrapGroupKey,
  generateGroupKey
} from "@/lib/crypto/e2e";
import {
  loadPrivateKey,
  ensureUserKeys,
  getCachedSessionKey,
  groupCacheKey,
  setCachedSessionKey
} from "@/lib/crypto/keyStore";
import {
  X,
  Users,
  Crown,
  UserMinus,
  Shield,
  Edit2,
  LogOut,
  RotateCcw,
  Loader2,
  Check
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface GroupInfoPanelProps {
  conversation: Conversation;
  onClose: () => void;
  onConversationUpdated: (conv: Conversation) => void;
}

export function GroupInfoPanel({ conversation, onClose, onConversationUpdated }: GroupInfoPanelProps) {
  const router = useRouter();
  const { user } = useAuthStore();
  const { setConversations } = useChatStore();

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(conversation.name || "");
  const [loading, setLoading] = useState<string | null>(null); // tracks which action is in progress

  const myMember = conversation.members.find((m) => m.user._id === user?._id);
  const isAdmin = myMember?.role === "admin";

  // ── Rename group ────────────────────────────────────────────────────────────
  const handleRename = async () => {
    if (!nameInput.trim() || nameInput === conversation.name) {
      setEditingName(false);
      return;
    }
    setLoading("rename");
    try {
      const updated = await updateConversation(conversation._id, { name: nameInput.trim() });
      onConversationUpdated(updated);
      toast.success("Group renamed");
    } catch {
      toast.error("Failed to rename group");
    } finally {
      setLoading(null);
      setEditingName(false);
    }
  };

  // ── Remove member + re-key (forward secrecy) ───────────────────────────────
  const handleRemove = async (memberId: string) => {
    setLoading(memberId);
    try {
      await removeMember(conversation._id, memberId);

      // Re-key: generate new group key encrypted for remaining members
      const myPrivKey = await loadPrivateKey(user!._id);
      if (!myPrivKey) {
        toast.warning("Member removed but re-keying skipped (no private key found)");
        return;
      }

      const newGroupKey = await generateGroupKey();
      const remainingMembers = conversation.members.filter(
        (m) => m.user._id !== memberId && m.user._id !== user!._id
      );

      const newGroupKeys: Record<string, string> = {};

      // Encrypt for self
      const { publicKeyB64: selfPubKey } = await ensureUserKeys(user!._id);
      const selfSession = await deriveSessionKey(myPrivKey, selfPubKey);
      newGroupKeys[user!._id] = await wrapGroupKey(newGroupKey, selfSession);

      // Encrypt for remaining members
      for (const member of remainingMembers) {
        try {
          let memberKey = member.user.publicKey;
          if (!memberKey) {
            const keyInfo = await fetchPublicKey(member.user._id);
            memberKey = keyInfo?.publicKey;
          }
          if (memberKey) {
            const session = await deriveSessionKey(myPrivKey, memberKey);
            newGroupKeys[member.user._id] = await wrapGroupKey(newGroupKey, session);
          }
        } catch {}
      }

      // Push new keys to server
      const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api/v1";
      await fetch(`${API}/chat/conversations/${conversation._id}/group-keys`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newGroupKeys })
      });

      // Update cached group key
      setCachedSessionKey(groupCacheKey(conversation._id), newGroupKey);

      toast.success("Member removed and keys rotated (forward secrecy applied)");

      // Refresh
      const convs = await fetchConversations();
      setConversations(convs);
      onConversationUpdated({ ...conversation, members: conversation.members.filter((m) => m.user._id !== memberId) });
    } catch (err) {
      toast.error("Failed to remove member");
    } finally {
      setLoading(null);
    }
  };

  // ── Leave group (self) ──────────────────────────────────────────────────────
  const handleLeave = async () => {
    setLoading("leave");
    try {
      await removeMember(conversation._id, user!._id);
      toast.success("Left group");
      router.push("/chat");
    } catch {
      toast.error("Failed to leave group");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="w-full h-full flex flex-col border-l border-slate-800 bg-slate-900 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800">
        <span className="font-semibold text-white text-sm">Group Info</span>
        <button
          onClick={onClose}
          className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Group avatar + name */}
      <div className="px-4 py-5 flex flex-col items-center gap-3 border-b border-slate-800">
        <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-600/30 to-blue-600/30 border border-violet-500/30 flex items-center justify-center">
          <Users className="h-7 w-7 text-violet-400" />
        </div>

        {editingName ? (
          <div className="flex items-center gap-2 w-full">
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
              autoFocus
              className="flex-1 px-2 py-1 rounded-lg bg-slate-800 border border-violet-500/50 text-white text-sm focus:outline-none"
            />
            <button
              onClick={handleRename}
              disabled={loading === "rename"}
              className="h-7 w-7 rounded-lg bg-violet-600 hover:bg-violet-500 flex items-center justify-center text-white transition"
            >
              {loading === "rename" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white text-base">{conversation.name}</span>
            {isAdmin && (
              <button
                onClick={() => setEditingName(true)}
                className="h-6 w-6 rounded-md flex items-center justify-center text-slate-500 hover:text-violet-400 hover:bg-slate-800 transition"
              >
                <Edit2 className="h-3 w-3" />
              </button>
            )}
          </div>
        )}

        <p className="text-xs text-slate-400">{conversation.members.length} members</p>
      </div>

      {/* Members list */}
      <div className="flex-1 px-3 py-3 space-y-1">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-1 mb-2">
          Members
        </p>
        {conversation.members.map((member) => (
          <MemberRow
            key={member.user._id}
            member={member}
            isMe={member.user._id === user?._id}
            isAdmin={isAdmin}
            loading={loading === member.user._id}
            onRemove={() => handleRemove(member.user._id)}
          />
        ))}
      </div>

      {/* Footer actions */}
      <div className="px-4 pb-5 pt-2 border-t border-slate-800 space-y-2">
        <button
          onClick={handleLeave}
          disabled={!!loading}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-sm font-medium transition disabled:opacity-50"
        >
          {loading === "leave" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LogOut className="h-4 w-4" />
          )}
          Leave Group
        </button>
      </div>
    </div>
  );
}

interface MemberRowProps {
  member: ConversationMember;
  isMe: boolean;
  isAdmin: boolean;
  loading: boolean;
  onRemove: () => void;
}

function MemberRow({ member, isMe, isAdmin, loading, onRemove }: MemberRowProps) {
  return (
    <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-slate-800/50 transition group">
      {/* Avatar */}
      <div className="relative shrink-0">
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-600/30 to-slate-600 flex items-center justify-center text-xs font-bold text-slate-300 border border-slate-600">
          {member.user.name[0]?.toUpperCase()}
        </div>
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-slate-900",
            member.isOnline ? "bg-emerald-400" : "bg-slate-600"
          )}
        />
      </div>

      {/* Name + role */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-sm text-slate-200 font-medium truncate">
            {member.user.name}
            {isMe && <span className="text-slate-500 text-xs ml-1">(you)</span>}
          </span>
          {member.role === "admin" && (
            <Crown className="h-3 w-3 text-amber-400 shrink-0" />
          )}
        </div>
        <span className="text-[10px] text-slate-500">{member.user.designation || member.role}</span>
      </div>

      {/* Remove button (admin only, not self) */}
      {isAdmin && !isMe && (
        <button
          onClick={onRemove}
          disabled={loading}
          className="h-6 w-6 rounded-md flex items-center justify-center text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition"
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <UserMinus className="h-3 w-3" />
          )}
        </button>
      )}
    </div>
  );
}
